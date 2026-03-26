"""
Self-Learning Engine — evaluates prediction accuracy, generates learning
reports, and feeds context back into the insight generation pipeline so
the AI improves over time.
"""

import asyncio
import json
import logging
from datetime import date, timedelta
from typing import Any

from sqlalchemy import select, func, case, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.services.llm_guard import guarded_llm_call
from app.models.hcc import HccSuspect, SuspectStatus
from app.models.insight import Insight, InsightStatus
from app.models.care_gap import MemberGap, GapStatus
from app.models.learning import PredictionOutcome, LearningMetric, UserInteraction

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Prediction evaluation
# ---------------------------------------------------------------------------

async def evaluate_predictions(db: AsyncSession) -> dict[str, Any]:
    """
    Evaluate all predictions against actual outcomes.
    Creates PredictionOutcome records and calculates accuracy rates.
    """
    today = date.today()
    stats: dict[str, Any] = {
        "evaluated_date": today.isoformat(),
        "hcc_suspects": {},
        "gap_predictions": {},
        "overall": {},
    }

    # --- HCC suspect evaluation ---
    # Check suspects that were predicted: did they get captured?
    suspects = (await db.execute(
        select(HccSuspect).where(
            HccSuspect.status.in_([
                SuspectStatus.captured,
                SuspectStatus.dismissed,
                SuspectStatus.expired,
            ])
        )
    )).scalars().all()

    hcc_confirmed = 0
    hcc_rejected = 0
    hcc_expired = 0
    by_hcc_code: dict[int, dict] = {}

    for suspect in suspects:
        was_correct = suspect.status == SuspectStatus.captured.value
        outcome = (
            "confirmed" if suspect.status == SuspectStatus.captured.value
            else "rejected" if suspect.status == SuspectStatus.dismissed.value
            else "expired"
        )

        # Check if outcome already recorded
        existing = (await db.execute(
            select(PredictionOutcome).where(
                PredictionOutcome.prediction_type == "hcc_suspect",
                PredictionOutcome.prediction_id == suspect.id,
            )
        )).scalar_one_or_none()

        if not existing:
            po = PredictionOutcome(
                prediction_type="hcc_suspect",
                prediction_id=suspect.id,
                predicted_value=f"HCC {suspect.hcc_code} ({suspect.hcc_label})",
                confidence=suspect.confidence,
                outcome=outcome,
                actual_value=f"Status: {suspect.status}",
                was_correct=was_correct,
                context={
                    "hcc_code": suspect.hcc_code,
                    "suspect_type": suspect.suspect_type,
                    "raf_value": float(suspect.raf_value),
                    "member_id": suspect.member_id,
                },
            )
            db.add(po)

        if outcome == "confirmed":
            hcc_confirmed += 1
        elif outcome == "rejected":
            hcc_rejected += 1
        else:
            hcc_expired += 1

        # Track by HCC code
        code = suspect.hcc_code
        if code not in by_hcc_code:
            by_hcc_code[code] = {"label": suspect.hcc_label, "confirmed": 0, "rejected": 0, "expired": 0}
        by_hcc_code[code][outcome] = by_hcc_code[code].get(outcome, 0) + 1

    total_hcc = hcc_confirmed + hcc_rejected + hcc_expired
    hcc_accuracy = round(hcc_confirmed / total_hcc * 100, 1) if total_hcc > 0 else 0

    stats["hcc_suspects"] = {
        "total": total_hcc,
        "confirmed": hcc_confirmed,
        "rejected": hcc_rejected,
        "expired": hcc_expired,
        "accuracy_rate": hcc_accuracy,
        "by_hcc_code": {
            str(code): {
                **data,
                "accuracy": round(data["confirmed"] / max(data["confirmed"] + data["rejected"], 1) * 100, 1),
            }
            for code, data in sorted(by_hcc_code.items(), key=lambda x: x[1]["confirmed"], reverse=True)[:20]
        },
    }

    # --- Care gap prediction evaluation ---
    closed_gaps = (await db.execute(
        select(func.count(MemberGap.id)).where(MemberGap.status == GapStatus.closed.value)
    )).scalar() or 0
    open_gaps = (await db.execute(
        select(func.count(MemberGap.id)).where(MemberGap.status == GapStatus.open.value)
    )).scalar() or 0

    stats["gap_predictions"] = {
        "closed": closed_gaps,
        "still_open": open_gaps,
        "closure_rate": round(closed_gaps / max(closed_gaps + open_gaps, 1) * 100, 1),
    }

    # --- Overall metrics ---
    total_resolved = total_hcc
    total_correct = hcc_confirmed
    stats["overall"] = {
        "total_predictions_evaluated": total_resolved,
        "total_correct": total_correct,
        "overall_accuracy": round(total_correct / max(total_resolved, 1) * 100, 1),
    }

    # Persist learning metric snapshot
    metric = LearningMetric(
        metric_date=today,
        prediction_type="all",
        total_predictions=total_resolved,
        confirmed=total_correct,
        rejected=hcc_rejected,
        pending=hcc_expired,
        accuracy_rate=stats["overall"]["overall_accuracy"],
        breakdown=stats,
    )
    db.add(metric)
    await db.commit()

    return stats


# ---------------------------------------------------------------------------
# Learning report generation
# ---------------------------------------------------------------------------

async def generate_learning_report(db: AsyncSession) -> dict[str, Any]:
    """
    Generate an AI learning report: accuracy trends, blind spots,
    improving areas, and AI-generated lessons.
    """
    # Fetch recent learning metrics (last 6 months)
    six_months_ago = date.today() - timedelta(days=180)
    metrics = (await db.execute(
        select(LearningMetric)
        .where(LearningMetric.metric_date >= six_months_ago)
        .order_by(LearningMetric.metric_date.asc())
    )).scalars().all()

    accuracy_over_time = [
        {
            "date": m.metric_date.isoformat(),
            "accuracy_rate": float(m.accuracy_rate) if m.accuracy_rate else 0,
            "total_predictions": m.total_predictions,
            "confirmed": m.confirmed,
        }
        for m in metrics
    ]

    # Accuracy by prediction type
    type_metrics = (await db.execute(
        select(
            PredictionOutcome.prediction_type,
            func.count(PredictionOutcome.id).label("total"),
            func.sum(case((PredictionOutcome.was_correct == True, 1), else_=0)).label("correct"),  # noqa: E712
        )
        .group_by(PredictionOutcome.prediction_type)
    )).all()

    by_type = {}
    for row in type_metrics:
        total = row.total or 0
        correct = row.correct or 0
        by_type[row.prediction_type] = {
            "total": total,
            "correct": correct,
            "accuracy": round(correct / max(total, 1) * 100, 1),
        }

    # Identify blind spots — lowest accuracy HCC codes
    try:
        blind_spots = (await db.execute(
            select(
                PredictionOutcome.context["hcc_code"].astext.label("hcc_code"),
                func.count(PredictionOutcome.id).label("total"),
                func.sum(case((PredictionOutcome.was_correct == True, 1), else_=0)).label("correct"),  # noqa: E712
            )
            .where(
                PredictionOutcome.prediction_type == "hcc_suspect",
                PredictionOutcome.context.isnot(None),
                PredictionOutcome.context["hcc_code"].astext.isnot(None),
            )
            .group_by(PredictionOutcome.context["hcc_code"].astext)
            .having(func.count(PredictionOutcome.id) >= 2)
            .order_by((func.sum(case((PredictionOutcome.was_correct == True, 1), else_=0)) * 100.0 / func.count(PredictionOutcome.id)).asc())  # noqa: E712
            .limit(5)
        )).all()
    except Exception:
        blind_spots = []

    blind_spot_list = [
        {
            "hcc_code": row.hcc_code,
            "total_predictions": row.total,
            "correct": row.correct,
            "accuracy": round((row.correct or 0) / max(row.total, 1) * 100, 1),
        }
        for row in blind_spots
    ]

    # Identify improving areas — highest accuracy HCC codes
    try:
        strengths = (await db.execute(
            select(
                PredictionOutcome.context["hcc_code"].astext.label("hcc_code"),
                func.count(PredictionOutcome.id).label("total"),
                func.sum(case((PredictionOutcome.was_correct == True, 1), else_=0)).label("correct"),  # noqa: E712
            )
            .where(
                PredictionOutcome.prediction_type == "hcc_suspect",
                PredictionOutcome.context.isnot(None),
                PredictionOutcome.context["hcc_code"].astext.isnot(None),
            )
            .group_by(PredictionOutcome.context["hcc_code"].astext)
            .having(func.count(PredictionOutcome.id) >= 2)
            .order_by((func.sum(case((PredictionOutcome.was_correct == True, 1), else_=0)) * 100.0 / func.count(PredictionOutcome.id)).desc())  # noqa: E712
            .limit(5)
        )).all()
    except Exception:
        strengths = []

    strength_list = [
        {
            "hcc_code": row.hcc_code,
            "total_predictions": row.total,
            "correct": row.correct,
            "accuracy": round((row.correct or 0) / max(row.total, 1) * 100, 1),
        }
        for row in strengths
    ]

    # Generate AI lessons from patterns
    lessons = await _generate_ai_lessons(db, by_type, blind_spot_list, strength_list)

    return {
        "generated_date": date.today().isoformat(),
        "accuracy_over_time": accuracy_over_time,
        "accuracy_by_type": by_type,
        "blind_spots": blind_spot_list,
        "strengths": strength_list,
        "lessons": lessons,
    }


async def _generate_ai_lessons(
    db: AsyncSession,
    by_type: dict,
    blind_spots: list,
    strengths: list,
    tenant_schema: str = "default",
) -> list[str]:
    """Use Claude to generate learning lessons from accuracy patterns."""
    if not settings.anthropic_api_key:
        return [
            "Insufficient data for AI-generated lessons. Connect an API key to enable.",
        ]

    prompt = f"""Based on these prediction accuracy patterns for a Medicare Advantage risk adjustment platform,
generate 3-5 concise lessons (1-2 sentences each) about what we should adjust:

Accuracy by prediction type: {json.dumps(by_type)}
Blind spots (lowest accuracy areas): {json.dumps(blind_spots)}
Strengths (highest accuracy areas): {json.dumps(strengths)}

Return a JSON array of strings. Each string is one lesson.
Return ONLY valid JSON."""

    try:
        guard_result = await guarded_llm_call(
            tenant_schema=tenant_schema,
            system_prompt="You are a healthcare AI learning advisor. Generate concise lessons from prediction accuracy data.",
            user_prompt=prompt,
            context_data={"by_type": by_type, "blind_spots": blind_spots, "strengths": strengths},
            max_tokens=1024,
        )
        if guard_result["warnings"]:
            logger.warning("AI lessons LLM warnings: %s", guard_result["warnings"])
        text = guard_result["response"].strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
            if text.endswith("```"):
                text = text[:-3].strip()
        result = json.loads(text)
        if isinstance(result, list):
            return result
    except Exception as e:
        logger.error("Failed to generate AI lessons: %s", e)

    return ["Unable to generate AI lessons at this time."]


# ---------------------------------------------------------------------------
# Learning context for insight generation
# ---------------------------------------------------------------------------

async def get_learning_context_for_insights(db: AsyncSession) -> dict[str, Any]:
    """
    Called by the insight engine before generating new insights.
    Returns accuracy history, known blind spots, and successful patterns
    so the LLM can adjust confidence and focus accordingly.
    """
    # Recent accuracy by prediction type
    type_accuracy = (await db.execute(
        select(
            PredictionOutcome.prediction_type,
            func.count(PredictionOutcome.id).label("total"),
            func.sum(case((PredictionOutcome.was_correct == True, 1), else_=0)).label("correct"),  # noqa: E712
        )
        .group_by(PredictionOutcome.prediction_type)
    )).all()

    accuracy_by_type = {}
    for row in type_accuracy:
        total = row.total or 0
        correct = row.correct or 0
        accuracy_by_type[row.prediction_type] = {
            "total": total,
            "correct": correct,
            "accuracy": round(correct / max(total, 1) * 100, 1),
        }

    # HCC-specific accuracy (top and bottom)
    try:
        hcc_accuracy = (await db.execute(
            select(
                PredictionOutcome.context["hcc_code"].astext.label("hcc_code"),
                func.count(PredictionOutcome.id).label("total"),
                func.sum(case((PredictionOutcome.was_correct == True, 1), else_=0)).label("correct"),  # noqa: E712
            )
            .where(
                PredictionOutcome.prediction_type == "hcc_suspect",
                PredictionOutcome.context.isnot(None),
            )
            .group_by(PredictionOutcome.context["hcc_code"].astext)
            .having(func.count(PredictionOutcome.id) >= 2)
        )).all()
    except Exception:
        hcc_accuracy = []

    hcc_performance = {}
    for row in hcc_accuracy:
        total = row.total or 0
        correct = row.correct or 0
        acc = round(correct / max(total, 1) * 100, 1)
        hcc_performance[row.hcc_code] = {"total": total, "correct": correct, "accuracy": acc}

    # Sort to find best and worst
    sorted_hcc = sorted(hcc_performance.items(), key=lambda x: x[1]["accuracy"])
    blind_spots = dict(sorted_hcc[:5])
    strong_areas = dict(sorted_hcc[-5:]) if len(sorted_hcc) >= 5 else dict(sorted_hcc)

    # Confidence calibration: how accurate are predictions at each confidence level?
    confidence_buckets = (await db.execute(
        select(
            case(
                (PredictionOutcome.confidence < 50, "low"),
                (PredictionOutcome.confidence < 75, "medium"),
                else_="high",
            ).label("bucket"),
            func.count(PredictionOutcome.id).label("total"),
            func.sum(case((PredictionOutcome.was_correct == True, 1), else_=0)).label("correct"),  # noqa: E712
        )
        .where(PredictionOutcome.confidence.isnot(None))
        .group_by("bucket")
    )).all()

    confidence_calibration = {}
    for row in confidence_buckets:
        total = row.total or 0
        correct = row.correct or 0
        confidence_calibration[row.bucket] = {
            "total": total,
            "correct": correct,
            "actual_accuracy": round(correct / max(total, 1) * 100, 1),
        }

    # Recent lessons from LearningMetric breakdown
    latest_metric = (await db.execute(
        select(LearningMetric)
        .order_by(LearningMetric.metric_date.desc())
        .limit(1)
    )).scalar_one_or_none()

    return {
        "accuracy_by_type": accuracy_by_type,
        "hcc_blind_spots": blind_spots,
        "hcc_strong_areas": strong_areas,
        "confidence_calibration": confidence_calibration,
        "latest_overall_accuracy": float(latest_metric.accuracy_rate) if latest_metric and latest_metric.accuracy_rate else None,
        "has_learning_data": len(accuracy_by_type) > 0,
    }


# ---------------------------------------------------------------------------
# User interaction tracking
# ---------------------------------------------------------------------------

async def track_user_interaction(
    db: AsyncSession,
    user_id: int,
    interaction_type: str,
    target_type: str,
    target_id: int | None = None,
    page_context: str | None = None,
    metadata: dict | None = None,
) -> UserInteraction:
    """Record a user interaction for learning purposes."""
    interaction = UserInteraction(
        user_id=user_id,
        interaction_type=interaction_type,
        target_type=target_type,
        target_id=target_id,
        page_context=page_context,
        interaction_metadata=metadata,
    )
    db.add(interaction)
    await db.commit()
    await db.refresh(interaction)
    return interaction


async def get_user_preference_model(db: AsyncSession) -> dict[str, Any]:
    """
    Analyze UserInteraction history to build a preference model.
    Returns which insight categories users engage with most, which they
    dismiss, and what questions they ask.
    """
    # Interaction counts by type and target
    interactions = (await db.execute(
        select(
            UserInteraction.interaction_type,
            UserInteraction.target_type,
            func.count(UserInteraction.id).label("count"),
        )
        .group_by(UserInteraction.interaction_type, UserInteraction.target_type)
        .order_by(func.count(UserInteraction.id).desc())
    )).all()

    engagement_by_target = {}
    dismissals_by_target = {}
    for row in interactions:
        key = row.target_type
        if row.interaction_type in ("bookmark", "act_on", "capture", "view"):
            engagement_by_target[key] = engagement_by_target.get(key, 0) + row.count
        elif row.interaction_type == "dismiss":
            dismissals_by_target[key] = dismissals_by_target.get(key, 0) + row.count

    # Most common page contexts
    page_activity = (await db.execute(
        select(
            UserInteraction.page_context,
            func.count(UserInteraction.id).label("count"),
        )
        .where(UserInteraction.page_context.isnot(None))
        .group_by(UserInteraction.page_context)
        .order_by(func.count(UserInteraction.id).desc())
        .limit(10)
    )).all()

    # Recent questions asked
    recent_questions = (await db.execute(
        select(UserInteraction.interaction_metadata)
        .where(
            UserInteraction.interaction_type == "ask_question",
            UserInteraction.interaction_metadata.isnot(None),
        )
        .order_by(UserInteraction.created_at.desc())
        .limit(20)
    )).scalars().all()

    question_topics = []
    for meta in recent_questions:
        if isinstance(meta, dict) and "question" in meta:
            question_topics.append(meta["question"])

    return {
        "engagement_by_target": engagement_by_target,
        "dismissals_by_target": dismissals_by_target,
        "top_pages": [{"page": r.page_context, "interactions": r.count} for r in page_activity],
        "recent_questions": question_topics[:10],
        "has_preference_data": len(interactions) > 0,
    }


# ---------------------------------------------------------------------------
# Per-provider learning profile
# ---------------------------------------------------------------------------

async def get_provider_learning_profile(db: AsyncSession, provider_id: int) -> dict[str, Any]:
    """
    Build a per-provider accuracy profile by analyzing prediction outcomes
    for members attributed to this provider (via member -> PCP).

    Returns:
        {
            provider_id: int,
            overall_accuracy: float,
            total_predictions: int,
            by_type: {prediction_type: {total, correct, accuracy}},
            blind_spots: [{hcc_code, total, correct, accuracy}],
            strengths: [{hcc_code, total, correct, accuracy}],
        }
    """
    from app.models.member import Member

    # Find all member IDs attributed to this provider
    member_ids_q = await db.execute(
        select(Member.id).where(Member.pcp_provider_id == provider_id)
    )
    member_ids = [r[0] for r in member_ids_q.all()]

    if not member_ids:
        return {
            "provider_id": provider_id,
            "overall_accuracy": 0.0,
            "total_predictions": 0,
            "by_type": {},
            "blind_spots": [],
            "strengths": [],
        }

    # Get all prediction outcomes where context has a member_id in our set
    # PredictionOutcome.context is JSONB with a "member_id" key for hcc_suspect type
    all_outcomes = (await db.execute(
        select(PredictionOutcome).where(
            PredictionOutcome.context.isnot(None),
        )
    )).scalars().all()

    # Filter to outcomes for this provider's members
    provider_outcomes = []
    for outcome in all_outcomes:
        ctx = outcome.context
        if isinstance(ctx, dict) and ctx.get("member_id") in member_ids:
            provider_outcomes.append(outcome)

    if not provider_outcomes:
        return {
            "provider_id": provider_id,
            "overall_accuracy": 0.0,
            "total_predictions": 0,
            "by_type": {},
            "blind_spots": [],
            "strengths": [],
        }

    # Accuracy by prediction type
    by_type: dict[str, dict] = {}
    total_correct = 0
    total_count = 0

    for po in provider_outcomes:
        ptype = po.prediction_type
        if ptype not in by_type:
            by_type[ptype] = {"total": 0, "correct": 0}
        by_type[ptype]["total"] += 1
        total_count += 1
        if po.was_correct:
            by_type[ptype]["correct"] += 1
            total_correct += 1

    for ptype_data in by_type.values():
        ptype_data["accuracy"] = round(
            ptype_data["correct"] / max(ptype_data["total"], 1) * 100, 1
        )

    overall_accuracy = round(total_correct / max(total_count, 1) * 100, 1)

    # HCC-specific accuracy for this provider
    hcc_performance: dict[str, dict] = {}
    for po in provider_outcomes:
        if po.prediction_type == "hcc_suspect" and isinstance(po.context, dict):
            hcc_code = str(po.context.get("hcc_code", "unknown"))
            if hcc_code not in hcc_performance:
                hcc_performance[hcc_code] = {"total": 0, "correct": 0}
            hcc_performance[hcc_code]["total"] += 1
            if po.was_correct:
                hcc_performance[hcc_code]["correct"] += 1

    for hcc_data in hcc_performance.values():
        hcc_data["accuracy"] = round(
            hcc_data["correct"] / max(hcc_data["total"], 1) * 100, 1
        )

    # Sort to find blind spots (lowest accuracy) and strengths (highest accuracy)
    # Only include codes with 2+ predictions to be meaningful
    significant = [
        (code, data) for code, data in hcc_performance.items()
        if data["total"] >= 2
    ]
    sorted_hcc = sorted(significant, key=lambda x: x[1]["accuracy"])

    blind_spots = [
        {"hcc_code": code, **data}
        for code, data in sorted_hcc[:5]
        if data["accuracy"] < 70
    ]
    strengths = [
        {"hcc_code": code, **data}
        for code, data in sorted_hcc[-5:]
        if data["accuracy"] >= 70
    ]

    return {
        "provider_id": provider_id,
        "overall_accuracy": overall_accuracy,
        "total_predictions": total_count,
        "by_type": by_type,
        "blind_spots": blind_spots,
        "strengths": strengths,
    }
