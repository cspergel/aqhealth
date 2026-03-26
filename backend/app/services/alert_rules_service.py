"""
Alert Rules Engine — create, manage, and evaluate user-defined alerting rules.
"""

import logging
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert_rule import AlertRule, AlertRuleTrigger
from app.models.member import Member
from app.models.provider import Provider
from app.models.practice_group import PracticeGroup
from app.models.care_gap import GapMeasure, MemberGap
from app.models.claim import Claim

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

async def create_rule(db: AsyncSession, rule_data: dict) -> AlertRule:
    """Create a new alert rule."""
    rule = AlertRule(**rule_data)
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    logger.info("Created alert rule %d: %s", rule.id, rule.name)
    return rule


async def get_rules(db: AsyncSession, user_id: int | None = None) -> list[AlertRule]:
    """Get alert rules, optionally filtered by creator."""
    stmt = select(AlertRule).order_by(AlertRule.id)
    if user_id is not None:
        stmt = stmt.where(AlertRule.created_by == user_id)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def update_rule(db: AsyncSession, rule_id: int, updates: dict) -> AlertRule | None:
    """Update an existing alert rule."""
    result = await db.execute(select(AlertRule).where(AlertRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        return None
    for key, val in updates.items():
        if hasattr(rule, key):
            setattr(rule, key, val)
    await db.commit()
    await db.refresh(rule)
    return rule


async def delete_rule(db: AsyncSession, rule_id: int) -> bool:
    """Delete an alert rule."""
    result = await db.execute(select(AlertRule).where(AlertRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        return False
    await db.delete(rule)
    await db.commit()
    return True


# ---------------------------------------------------------------------------
# Evaluation engine
# ---------------------------------------------------------------------------

def _compare(value: float, operator: str, threshold: float) -> bool:
    """Apply the operator comparison."""
    ops = {
        "gt": lambda v, t: v > t,
        "lt": lambda v, t: v < t,
        "gte": lambda v, t: v >= t,
        "lte": lambda v, t: v <= t,
        "eq": lambda v, t: v == t,
        "change_gt": lambda v, t: v > t,
        "change_lt": lambda v, t: v < t,
    }
    fn = ops.get(operator)
    if fn is None:
        return False
    return fn(value, threshold)


async def _evaluate_member_metric(db: AsyncSession, rule: AlertRule) -> list[dict]:
    """Evaluate member-level metrics."""
    triggers = []
    members = (await db.execute(select(Member))).scalars().all()

    for m in members:
        value = None
        if rule.metric == "spend_12mo":
            # Sum claims for this member
            result = await db.execute(
                select(func.coalesce(func.sum(Claim.paid_amount), 0))
                .where(Claim.member_id == m.id)
            )
            value = float(result.scalar() or 0)
        elif rule.metric == "raf_score":
            value = float(m.current_raf) if m.current_raf else 0
        elif rule.metric == "er_visits":
            result = await db.execute(
                select(func.count())
                .select_from(Claim)
                .where(Claim.member_id == m.id, Claim.service_category == "ed_observation")
            )
            value = int(result.scalar() or 0)
        elif rule.metric == "admissions":
            result = await db.execute(
                select(func.count())
                .select_from(Claim)
                .where(Claim.member_id == m.id, Claim.service_category == "inpatient")
            )
            value = int(result.scalar() or 0)
        elif rule.metric == "days_since_visit":
            result = await db.execute(
                select(func.max(Claim.service_date))
                .where(Claim.member_id == m.id)
            )
            last_visit = result.scalar()
            if last_visit:
                value = (datetime.now(timezone.utc).date() - last_visit).days
            else:
                value = 9999
        elif rule.metric == "gap_count":
            result = await db.execute(
                select(func.count())
                .select_from(MemberGap)
                .where(MemberGap.member_id == m.id, MemberGap.status == "open")
            )
            value = int(result.scalar() or 0)
        elif rule.metric == "suspect_count":
            from app.models.hcc import HccSuspect
            result = await db.execute(
                select(func.count())
                .select_from(HccSuspect)
                .where(HccSuspect.member_id == m.id, HccSuspect.status == "open")
            )
            value = int(result.scalar() or 0)

        if value is not None and _compare(value, rule.operator, float(rule.threshold)):
            triggers.append({
                "entity_type": "member",
                "entity_id": m.id,
                "entity_name": f"{m.first_name} {m.last_name}",
                "metric_value": value,
                "message": f"Member {m.first_name} {m.last_name}: {rule.metric}={value} {rule.operator} {rule.threshold}",
            })
    return triggers


async def _evaluate_provider_metric(db: AsyncSession, rule: AlertRule) -> list[dict]:
    """Evaluate provider-level metrics."""
    triggers = []
    providers = (await db.execute(select(Provider))).scalars().all()

    for p in providers:
        value = None
        if rule.metric in ("capture_rate", "recapture_rate"):
            from app.models.hcc import HccSuspect
            total = (await db.execute(
                select(func.count()).select_from(HccSuspect)
                .where(HccSuspect.provider_id == p.id)
            )).scalar() or 0
            captured = (await db.execute(
                select(func.count()).select_from(HccSuspect)
                .where(HccSuspect.provider_id == p.id, HccSuspect.status == "captured")
            )).scalar() or 0
            value = (captured / total * 100) if total > 0 else 0
        elif rule.metric == "panel_pmpm":
            panel = (await db.execute(
                select(func.count()).select_from(Member)
                .where(Member.pcp_provider_id == p.id)
            )).scalar() or 0
            total_spend = (await db.execute(
                select(func.coalesce(func.sum(Claim.paid_amount), 0))
                .select_from(Claim)
                .join(Member, Claim.member_id == Member.id)
                .where(Member.pcp_provider_id == p.id)
            )).scalar() or 0
            value = float(total_spend) / max(panel, 1) / 12
        elif rule.metric == "gap_closure":
            total = (await db.execute(
                select(func.count()).select_from(MemberGap)
                .join(Member, MemberGap.member_id == Member.id)
                .where(Member.pcp_provider_id == p.id)
            )).scalar() or 0
            closed = (await db.execute(
                select(func.count()).select_from(MemberGap)
                .join(Member, MemberGap.member_id == Member.id)
                .where(Member.pcp_provider_id == p.id, MemberGap.status == "closed")
            )).scalar() or 0
            value = (closed / total * 100) if total > 0 else 0

        if value is not None and _compare(value, rule.operator, float(rule.threshold)):
            triggers.append({
                "entity_type": "provider",
                "entity_id": p.id,
                "entity_name": f"Dr. {p.first_name} {p.last_name}",
                "metric_value": value,
                "message": f"Provider Dr. {p.last_name}: {rule.metric}={value:.1f} {rule.operator} {rule.threshold}",
            })
    return triggers


async def _evaluate_measure_metric(db: AsyncSession, rule: AlertRule) -> list[dict]:
    """Evaluate measure-level metrics (closure_rate)."""
    triggers = []
    measures = (await db.execute(select(GapMeasure).where(GapMeasure.is_active == True))).scalars().all()

    for measure in measures:
        if rule.metric == "closure_rate":
            total = (await db.execute(
                select(func.count()).select_from(MemberGap)
                .where(MemberGap.measure_id == measure.id)
            )).scalar() or 0
            closed = (await db.execute(
                select(func.count()).select_from(MemberGap)
                .where(MemberGap.measure_id == measure.id, MemberGap.status == "closed")
            )).scalar() or 0
            value = (closed / total * 100) if total > 0 else 0

            if _compare(value, rule.operator, float(rule.threshold)):
                triggers.append({
                    "entity_type": "measure",
                    "entity_id": measure.id,
                    "entity_name": measure.name,
                    "metric_value": value,
                    "message": f"Measure {measure.code}: closure_rate={value:.1f}% {rule.operator} {rule.threshold}",
                })
    return triggers


async def _evaluate_population_metric(db: AsyncSession, rule: AlertRule) -> list[dict]:
    """Evaluate population-level metrics."""
    triggers = []
    value = None

    if rule.metric == "avg_raf":
        result = await db.execute(select(func.avg(Member.current_raf)))
        value = float(result.scalar() or 0)
    elif rule.metric == "total_pmpm":
        member_count = (await db.execute(select(func.count()).select_from(Member))).scalar() or 1
        total_spend = (await db.execute(
            select(func.coalesce(func.sum(Claim.paid_amount), 0))
        )).scalar() or 0
        value = float(total_spend) / member_count / 12
    elif rule.metric == "recapture_rate":
        from app.models.hcc import HccSuspect
        total = (await db.execute(select(func.count()).select_from(HccSuspect))).scalar() or 0
        captured = (await db.execute(
            select(func.count()).select_from(HccSuspect)
            .where(HccSuspect.status == "captured")
        )).scalar() or 0
        value = (captured / total * 100) if total > 0 else 0

    if value is not None and _compare(value, rule.operator, float(rule.threshold)):
        triggers.append({
            "entity_type": "population",
            "entity_id": None,
            "entity_name": "All Members",
            "metric_value": value,
            "message": f"Population {rule.metric}={value:.1f} {rule.operator} {rule.threshold}",
        })
    return triggers


async def evaluate_rules(db: AsyncSession) -> list[AlertRuleTrigger]:
    """Evaluate all active rules and create trigger records for violations."""
    active_rules = (await db.execute(
        select(AlertRule).where(AlertRule.is_active == True)
    )).scalars().all()

    all_triggers = []
    now = datetime.now(timezone.utc)

    for rule in active_rules:
        evaluator = {
            "member": _evaluate_member_metric,
            "provider": _evaluate_provider_metric,
            "measure": _evaluate_measure_metric,
            "population": _evaluate_population_metric,
            "group": _evaluate_population_metric,  # fallback
        }.get(rule.entity_type)

        if evaluator is None:
            continue

        try:
            raw_triggers = await evaluator(db, rule)
        except Exception as e:
            logger.error("Error evaluating rule %d: %s", rule.id, e)
            continue

        for t in raw_triggers:
            trigger = AlertRuleTrigger(
                rule_id=rule.id,
                entity_type=t["entity_type"],
                entity_id=t.get("entity_id"),
                entity_name=t.get("entity_name"),
                metric_value=Decimal(str(round(t["metric_value"], 2))),
                threshold=rule.threshold,
                message=t["message"],
            )
            db.add(trigger)
            all_triggers.append(trigger)

        # Update rule state
        rule.last_evaluated = now
        if raw_triggers:
            rule.last_triggered = now
            rule.trigger_count = (rule.trigger_count or 0) + len(raw_triggers)

    await db.commit()
    logger.info("Evaluated %d rules, created %d triggers", len(active_rules), len(all_triggers))
    return all_triggers


# ---------------------------------------------------------------------------
# Trigger management
# ---------------------------------------------------------------------------

async def get_triggered_alerts(
    db: AsyncSession,
    acknowledged: bool | None = None,
) -> list[AlertRuleTrigger]:
    """List triggered alerts with optional filter."""
    stmt = select(AlertRuleTrigger).order_by(AlertRuleTrigger.id.desc())
    if acknowledged is not None:
        stmt = stmt.where(AlertRuleTrigger.acknowledged == acknowledged)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def acknowledge_trigger(db: AsyncSession, trigger_id: int, user_id: int) -> AlertRuleTrigger | None:
    """Acknowledge a triggered alert."""
    result = await db.execute(
        select(AlertRuleTrigger).where(AlertRuleTrigger.id == trigger_id)
    )
    trigger = result.scalar_one_or_none()
    if not trigger:
        return None
    trigger.acknowledged = True
    trigger.acknowledged_by = user_id
    await db.commit()
    await db.refresh(trigger)
    return trigger


# ---------------------------------------------------------------------------
# Preset rules
# ---------------------------------------------------------------------------

def get_preset_rules() -> list[dict]:
    """Return common pre-built rule templates."""
    return [
        {
            "name": "High-cost member alert",
            "description": "Alert when any member's 12-month spend exceeds $100,000",
            "entity_type": "member",
            "metric": "spend_12mo",
            "operator": "gt",
            "threshold": 100000,
            "severity": "critical",
            "notify_channels": {"in_app": True},
        },
        {
            "name": "ER frequent flyer",
            "description": "Alert when a member has 4 or more ER visits",
            "entity_type": "member",
            "metric": "er_visits",
            "operator": "gte",
            "threshold": 4,
            "severity": "high",
            "notify_channels": {"in_app": True},
        },
        {
            "name": "Provider capture rate declining",
            "description": "Alert when a provider's HCC capture rate drops below 50%",
            "entity_type": "provider",
            "metric": "capture_rate",
            "operator": "lt",
            "threshold": 50,
            "severity": "medium",
            "notify_channels": {"in_app": True},
        },
        {
            "name": "Stars measure at risk",
            "description": "Alert when a measure's closure rate falls below its 3-star cutpoint",
            "entity_type": "measure",
            "metric": "closure_rate",
            "operator": "lt",
            "threshold": 50,
            "severity": "high",
            "notify_channels": {"in_app": True},
        },
        {
            "name": "Readmission alert",
            "description": "Alert when a member has 2 or more inpatient admissions (potential readmission)",
            "entity_type": "member",
            "metric": "admissions",
            "operator": "gte",
            "threshold": 2,
            "severity": "high",
            "notify_channels": {"in_app": True},
        },
        {
            "name": "Member not seen",
            "description": "Alert when a member has not had a visit in over 180 days",
            "entity_type": "member",
            "metric": "days_since_visit",
            "operator": "gt",
            "threshold": 180,
            "severity": "medium",
            "notify_channels": {"in_app": True},
        },
    ]
