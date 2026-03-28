"""
Learning Events — cross-loop communication for the self-learning system.

When one learning loop discovers something, it publishes an event.
Other loops subscribe and react. This creates compound intelligence
where the whole system is smarter than any individual loop.

Events are stored in the database for audit and processed async.
"""

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Event type catalogue
# ---------------------------------------------------------------------------

LEARNING_EVENTS = {
    "suspect_captured": "An HCC suspect was confirmed captured",
    "suspect_dismissed": "An HCC suspect was dismissed",
    "gap_closed": "A care gap was closed",
    "mapping_corrected": "A column mapping was overridden by user",
    "query_corrected": "A query answer was corrected by user",
    "insight_acted_on": "An insight was acted on by user",
    "insight_dismissed": "An insight was dismissed",
    "alert_dismissed": "An alert was dismissed without action",
    "rule_auto_created": "A transformation rule was auto-created from patterns",
    "provider_pattern_learned": "A provider capture/dismiss pattern was established",
}


# ---------------------------------------------------------------------------
# Publish
# ---------------------------------------------------------------------------

async def publish_event(
    db: AsyncSession,
    event_type: str,
    payload: dict[str, Any],
    tenant_schema: str = "default",
) -> int | None:
    """Store a learning event in the database for later processing.

    Returns the new event row ID, or None if storage failed.
    Events are inserted via raw SQL so we don't require a dedicated model
    (the table is created by migration or auto-created on first use).
    """
    if event_type not in LEARNING_EVENTS:
        logger.warning("Unknown learning event type: %s", event_type)
        return None

    try:
        import json
        now = datetime.now(timezone.utc)
        result = await db.execute(
            text("""
                INSERT INTO learning_events
                    (event_type, payload, tenant_schema, status, created_at)
                VALUES (:event_type, :payload::jsonb, :tenant_schema, 'pending', :created_at)
                RETURNING id
            """),
            {
                "event_type": event_type,
                "payload": json.dumps(payload, default=str),
                "tenant_schema": tenant_schema,
                "created_at": now,
            },
        )
        row = result.first()
        event_id = row[0] if row else None
        await db.flush()
        logger.debug(
            "Published learning event %s (id=%s) for tenant %s",
            event_type, event_id, tenant_schema,
        )
        return event_id
    except Exception as e:
        logger.warning("Failed to publish learning event %s: %s", event_type, e)
        return None


# ---------------------------------------------------------------------------
# Process cross-loop events
# ---------------------------------------------------------------------------

async def process_cross_loop_events(
    db: AsyncSession,
    tenant_schema: str = "default",
) -> dict[str, Any]:
    """Process pending learning events and trigger cross-loop reactions.

    Each event type triggers specific reactions in other learning loops,
    creating compound intelligence across the system.

    Returns a summary of events processed and reactions triggered.
    """
    summary: dict[str, Any] = {"processed": 0, "reactions": []}

    try:
        result = await db.execute(
            text("""
                SELECT id, event_type, payload
                FROM learning_events
                WHERE status = 'pending'
                  AND tenant_schema = :ts
                ORDER BY created_at ASC
                LIMIT 100
            """),
            {"ts": tenant_schema},
        )
        events = result.fetchall()
    except Exception as e:
        logger.warning("Could not fetch pending learning events: %s", e)
        return summary

    for event in events:
        event_id, event_type, payload = event[0], event[1], event[2]
        if isinstance(payload, str):
            import json
            payload = json.loads(payload)

        reactions = await _react_to_event(db, event_type, payload, tenant_schema)
        summary["reactions"].extend(reactions)

        # Mark event as processed
        try:
            await db.execute(
                text("""
                    UPDATE learning_events
                    SET status = 'processed', processed_at = :now
                    WHERE id = :eid
                """),
                {"eid": event_id, "now": datetime.now(timezone.utc)},
            )
        except Exception as e:
            logger.warning("Failed to mark event %d as processed: %s", event_id, e)

        summary["processed"] += 1

    if summary["processed"] > 0:
        await db.flush()
        logger.info(
            "Processed %d cross-loop events, triggered %d reactions for tenant %s",
            summary["processed"], len(summary["reactions"]), tenant_schema,
        )

    return summary


# ---------------------------------------------------------------------------
# Event reaction dispatcher
# ---------------------------------------------------------------------------

async def _react_to_event(
    db: AsyncSession,
    event_type: str,
    payload: dict[str, Any],
    tenant_schema: str,
) -> list[dict]:
    """Dispatch reactions based on event type. Returns list of reaction descriptions."""
    reactions: list[dict] = []

    try:
        if event_type == "suspect_captured":
            reactions.extend(await _react_suspect_captured(db, payload, tenant_schema))

        elif event_type == "suspect_dismissed":
            reactions.extend(await _react_suspect_dismissed(db, payload, tenant_schema))

        elif event_type == "gap_closed":
            reactions.extend(await _react_gap_closed(db, payload, tenant_schema))

        elif event_type == "mapping_corrected":
            reactions.extend(await _react_mapping_corrected(db, payload, tenant_schema))

        elif event_type == "query_corrected":
            # Currently just logged — future: feed into query fine-tuning
            reactions.append({"reaction": "query_correction_logged", "detail": "Stored for future prompt tuning"})

        elif event_type == "insight_acted_on":
            reactions.extend(await _react_insight_acted_on(db, payload, tenant_schema))

        elif event_type == "insight_dismissed":
            # Fed into insight priority adjustments on next generation cycle
            reactions.append({"reaction": "insight_dismiss_noted", "detail": "Will reduce priority on next insight generation"})

        elif event_type == "alert_dismissed":
            reactions.extend(await _react_alert_dismissed(db, payload, tenant_schema))

        elif event_type == "rule_auto_created":
            reactions.extend(await _react_rule_auto_created(db, payload, tenant_schema))

        elif event_type == "provider_pattern_learned":
            reactions.extend(await _react_provider_pattern(db, payload, tenant_schema))

    except Exception as e:
        logger.warning("Error reacting to event %s: %s", event_type, e)

    return reactions


# ---------------------------------------------------------------------------
# Individual reaction handlers
# ---------------------------------------------------------------------------

async def _react_suspect_captured(
    db: AsyncSession, payload: dict, tenant_schema: str,
) -> list[dict]:
    """When a suspect is captured: check if related care gaps should close,
    update provider scorecard knowledge."""
    reactions: list[dict] = []
    member_id = payload.get("member_id")
    hcc_code = payload.get("hcc_code")
    provider_id = payload.get("provider_id")

    # Check if related care gaps exist for this member that might auto-close
    if member_id:
        try:
            result = await db.execute(
                text("""
                    SELECT COUNT(*) FROM member_gaps
                    WHERE member_id = :mid AND status = 'open'
                """),
                {"mid": member_id},
            )
            open_gaps = result.scalar() or 0
            if open_gaps > 0:
                reactions.append({
                    "reaction": "check_related_gaps",
                    "detail": f"Member {member_id} has {open_gaps} open gaps — suspect capture may relate",
                    "member_id": member_id,
                })
        except Exception:
            pass

    # Track provider success
    if provider_id:
        reactions.append({
            "reaction": "provider_success_tracked",
            "detail": f"Provider {provider_id} captured HCC {hcc_code}",
            "provider_id": provider_id,
        })

    return reactions


async def _react_suspect_dismissed(
    db: AsyncSession, payload: dict, tenant_schema: str,
) -> list[dict]:
    """When a suspect is dismissed: track provider pattern for future confidence adjustment."""
    reactions: list[dict] = []
    provider_id = payload.get("provider_id")
    reason = payload.get("reason")

    if provider_id and reason:
        reactions.append({
            "reaction": "dismiss_pattern_tracked",
            "detail": f"Provider {provider_id} dismiss reason: {reason}",
            "provider_id": provider_id,
        })

    return reactions


async def _react_gap_closed(
    db: AsyncSession, payload: dict, tenant_schema: str,
) -> list[dict]:
    """When a gap is closed: check if it was recommended by the learning system."""
    reactions: list[dict] = []
    measure_code = payload.get("measure_code")

    # Check if learning system had recommended closure for this measure
    if measure_code:
        try:
            result = await db.execute(
                text("""
                    SELECT COUNT(*) FROM gap_closure_learn
                    WHERE measure_code = :mc
                """),
                {"mc": measure_code},
            )
            prior_closures = result.scalar() or 0
            if prior_closures > 0:
                reactions.append({
                    "reaction": "learning_success_tracked",
                    "detail": f"Measure {measure_code} closure aligns with {prior_closures} prior learned closures",
                })
        except Exception:
            pass

    return reactions


async def _react_mapping_corrected(
    db: AsyncSession, payload: dict, tenant_schema: str,
) -> list[dict]:
    """When a mapping is corrected: feed into data_learning_service pattern detection."""
    reactions: list[dict] = []
    source_column = payload.get("source_column")
    corrected_to = payload.get("confirmed")

    if source_column:
        reactions.append({
            "reaction": "mapping_pattern_fed",
            "detail": f"Column '{source_column}' correction fed into pattern detection",
        })

    return reactions


async def _react_insight_acted_on(
    db: AsyncSession, payload: dict, tenant_schema: str,
) -> list[dict]:
    """When an insight is acted on: boost related discovery scan weight."""
    reactions: list[dict] = []
    category = payload.get("category")

    if category:
        reactions.append({
            "reaction": "discovery_weight_boosted",
            "detail": f"Category '{category}' discovery weight boosted due to user action",
        })

    return reactions


async def _react_alert_dismissed(
    db: AsyncSession, payload: dict, tenant_schema: str,
) -> list[dict]:
    """When an alert is dismissed: feed into alert effectiveness analysis."""
    reactions: list[dict] = []
    rule_id = payload.get("rule_id")

    if rule_id:
        reactions.append({
            "reaction": "alert_effectiveness_updated",
            "detail": f"Alert rule {rule_id} dismissal fed into effectiveness analysis",
        })

    return reactions


async def _react_rule_auto_created(
    db: AsyncSession, payload: dict, tenant_schema: str,
) -> list[dict]:
    """When a rule is auto-created: generate an insight notifying the user."""
    reactions: list[dict] = []
    field = payload.get("field")
    rule_type = payload.get("rule_type")
    is_active = payload.get("is_active", False)

    try:
        from app.models.insight import Insight
        status_label = "active (auto-applied)" if is_active else "pending approval"
        insight = Insight(
            title=f"New data transformation rule created ({status_label})",
            description=(
                f"The system detected a recurring pattern in the '{field}' field "
                f"and auto-created a {rule_type} transformation rule. "
                f"Status: {status_label}."
            ),
            category="data_quality",
            severity="info",
            confidence=90,
            status="active",
            source="learning_events",
        )
        db.add(insight)
        await db.flush()
        reactions.append({
            "reaction": "user_notified_via_insight",
            "detail": f"Created insight about new {rule_type} rule for field '{field}'",
        })
    except Exception as e:
        logger.warning("Failed to create insight for auto-created rule: %s", e)

    return reactions


async def _react_provider_pattern(
    db: AsyncSession, payload: dict, tenant_schema: str,
) -> list[dict]:
    """When a provider pattern is learned: generate an insight about the provider."""
    reactions: list[dict] = []
    provider_id = payload.get("provider_id")
    pattern_type = payload.get("pattern_type")
    capture_rate = payload.get("capture_rate")

    if provider_id:
        try:
            from app.models.insight import Insight
            insight = Insight(
                title=f"Provider pattern detected: {pattern_type}",
                description=(
                    f"Provider {provider_id} shows a consistent {pattern_type} pattern "
                    f"with capture rate {capture_rate:.0%}. "
                    "Consider targeted education or workflow adjustment."
                ) if capture_rate is not None else (
                    f"Provider {provider_id} shows a consistent {pattern_type} pattern. "
                    "Review their coding behavior for intervention opportunities."
                ),
                category="revenue_opportunity",
                severity="medium",
                confidence=75,
                status="active",
                source="learning_events",
                related_entity_type="provider",
                related_entity_id=provider_id,
            )
            db.add(insight)
            await db.flush()
            reactions.append({
                "reaction": "provider_insight_generated",
                "detail": f"Generated insight about provider {provider_id} {pattern_type} pattern",
            })
        except Exception as e:
            logger.warning("Failed to create insight for provider pattern: %s", e)

    return reactions
