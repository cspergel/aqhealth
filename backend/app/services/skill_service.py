"""
Skill Service — workflow automation engine.

Manages skill CRUD, execution, and AI-powered skill suggestions.
"""

import logging
import time
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Preset skill templates
# ---------------------------------------------------------------------------

PRESET_SKILLS = [
    {
        "id": "preset_new_data_refresh",
        "name": "New Data Refresh",
        "description": "Complete data pipeline: ingest, validate, analyze, and refresh dashboards when new data arrives.",
        "trigger_type": "event",
        "trigger_config": {"event_type": "data_ingested", "filter": {}},
        "steps": [
            {"order": 1, "action": "run_quality_checks", "params": {"scope": "latest_batch"}, "description": "Run data quality checks on new data"},
            {"order": 2, "action": "run_hcc_engine", "params": {"scope": "new_claims_only"}, "description": "Run HCC suspect detection on new claims"},
            {"order": 3, "action": "detect_care_gaps", "params": {"scope": "affected_members"}, "description": "Detect care gaps for affected members"},
            {"order": 4, "action": "run_discovery", "params": {"full": False}, "description": "Run pattern discovery on new data"},
            {"order": 5, "action": "generate_insights", "params": {"scope": "incremental"}, "description": "Generate AI insights from new data"},
            {"order": 6, "action": "refresh_dashboard", "params": {}, "description": "Refresh all dashboard metrics"},
        ],
        "created_from": "preset",
        "scope": "global",
        "expected_outcome": "Dashboards reflect new data, new suspects and gaps identified, insights generated.",
    },
    {
        "id": "preset_post_discharge",
        "name": "Post-Discharge Protocol",
        "description": "Automatically initiates care coordination after a patient discharge: TCM case, HCC review, care manager assignment.",
        "trigger_type": "event",
        "trigger_config": {"event_type": "adt_discharge", "filter": {"patient_class": "inpatient"}},
        "steps": [
            {"order": 1, "action": "create_action_items", "params": {"type": "tcm_case", "priority": "high", "assign_to_role": "care_manager"}, "description": "Create TCM case for discharged patient"},
            {"order": 2, "action": "run_hcc_engine", "params": {"scope": "single_member"}, "description": "Check HCC opportunities for patient"},
            {"order": 3, "action": "detect_care_gaps", "params": {"scope": "single_member"}, "description": "Check for open care gaps"},
            {"order": 4, "action": "create_action_items", "params": {"type": "follow_up", "days_from_now": 2, "assign_to_role": "care_manager"}, "description": "Schedule 48-hour follow-up"},
            {"order": 5, "action": "send_notification", "params": {"channel": "in_app", "template": "post_discharge_alert"}, "description": "Notify care team of discharge"},
        ],
        "created_from": "preset",
        "scope": "global",
        "expected_outcome": "Care team is alerted, TCM case created, follow-up scheduled within 48 hours.",
    },
    {
        "id": "preset_quarterly_hcc_chase",
        "name": "Quarterly HCC Chase",
        "description": "Run full HCC analysis, generate prioritized chase lists, and assign to providers for documentation.",
        "trigger_type": "schedule",
        "trigger_config": {"cron": "0 8 1 1,4,7,10 *"},
        "steps": [
            {"order": 1, "action": "run_hcc_engine", "params": {"scope": "full_population"}, "description": "Run HCC suspect detection on full population"},
            {"order": 2, "action": "generate_chase_list", "params": {"sort_by": "raf_value", "min_raf": 0.1}, "description": "Generate prioritized chase list"},
            {"order": 3, "action": "create_action_items", "params": {"assign_to_role": "care_manager", "priority": "high"}, "description": "Create action items for care managers"},
            {"order": 4, "action": "send_notification", "params": {"channel": "in_app", "template": "chase_list_ready"}, "description": "Notify team that chase list is ready"},
        ],
        "created_from": "preset",
        "scope": "global",
        "expected_outcome": "Chase list distributed to providers, action items created for top RAF-value suspects.",
    },
    {
        "id": "preset_awv_campaign",
        "name": "AWV Campaign",
        "description": "Identify members due for Annual Wellness Visits, generate outreach lists, and schedule reminders.",
        "trigger_type": "schedule",
        "trigger_config": {"cron": "0 9 1 * *"},
        "steps": [
            {"order": 1, "action": "detect_care_gaps", "params": {"measures": ["AWV"], "scope": "full_population"}, "description": "Identify members due for AWV"},
            {"order": 2, "action": "generate_chase_list", "params": {"type": "awv_outreach", "sort_by": "raf_value"}, "description": "Generate AWV outreach list"},
            {"order": 3, "action": "create_action_items", "params": {"type": "outreach_call", "assign_to_role": "outreach"}, "description": "Create outreach tasks"},
            {"order": 4, "action": "send_notification", "params": {"channel": "in_app", "template": "awv_campaign_started"}, "description": "Notify outreach team of new campaign"},
        ],
        "created_from": "preset",
        "scope": "global",
        "expected_outcome": "Outreach team receives prioritized list of members due for AWV, tasks created.",
    },
    {
        "id": "preset_monthly_board_report",
        "name": "Monthly Board Report",
        "description": "Refresh all data, generate comprehensive insights, and produce the monthly executive report.",
        "trigger_type": "schedule",
        "trigger_config": {"cron": "0 6 1 * *"},
        "steps": [
            {"order": 1, "action": "refresh_dashboard", "params": {}, "description": "Refresh all dashboard metrics"},
            {"order": 2, "action": "run_hcc_engine", "params": {"scope": "full_population"}, "description": "Run full HCC analysis"},
            {"order": 3, "action": "detect_care_gaps", "params": {"scope": "full_population"}, "description": "Run care gap detection"},
            {"order": 4, "action": "calculate_stars", "params": {}, "description": "Calculate current star rating projection"},
            {"order": 5, "action": "generate_insights", "params": {"scope": "full", "report_type": "executive"}, "description": "Generate executive insights"},
            {"order": 6, "action": "generate_report", "params": {"template": "monthly_board", "format": "pdf"}, "description": "Generate board report PDF"},
            {"order": 7, "action": "send_notification", "params": {"channel": "in_app", "template": "board_report_ready", "roles": ["mso_admin"]}, "description": "Notify admin that report is ready"},
        ],
        "created_from": "preset",
        "scope": "global",
        "expected_outcome": "Board report generated with latest metrics, insights, and projections.",
    },
]


# ---------------------------------------------------------------------------
# Available step actions
# ---------------------------------------------------------------------------

AVAILABLE_ACTIONS = [
    {"action": "run_hcc_engine", "label": "Run HCC Engine", "description": "Analyze population for HCC suspect conditions", "category": "Revenue"},
    {"action": "generate_chase_list", "label": "Generate Chase List", "description": "Create prioritized list of HCC suspects for provider review", "category": "Revenue"},
    {"action": "detect_care_gaps", "label": "Detect Care Gaps", "description": "Run care gap detection for quality measures", "category": "Quality"},
    {"action": "generate_insights", "label": "Generate Insights", "description": "Use AI to generate actionable insights from data", "category": "Intelligence"},
    {"action": "run_discovery", "label": "Run Discovery", "description": "AI pattern discovery across population data", "category": "Intelligence"},
    {"action": "create_action_items", "label": "Create Action Items", "description": "Create tasks and assign to team members", "category": "Workflow"},
    {"action": "send_notification", "label": "Send Notification", "description": "Send in-app or email notifications", "category": "Communication"},
    {"action": "generate_report", "label": "Generate Report", "description": "Generate PDF/Excel report from template", "category": "Reporting"},
    {"action": "evaluate_alert_rules", "label": "Evaluate Alert Rules", "description": "Check all alert rules against current data", "category": "Monitoring"},
    {"action": "refresh_dashboard", "label": "Refresh Dashboard", "description": "Recalculate all dashboard metrics", "category": "Data"},
    {"action": "run_quality_checks", "label": "Run Quality Checks", "description": "Execute data quality validation rules", "category": "Data"},
    {"action": "calculate_stars", "label": "Calculate Stars", "description": "Run Stars rating projection calculator", "category": "Quality"},
    {"action": "refresh_provider_scorecards", "label": "Refresh Provider Scorecards", "description": "Recompute provider and practice-group scorecard metrics", "category": "Data"},
]


# ---------------------------------------------------------------------------
# CRUD operations
# ---------------------------------------------------------------------------

async def create_skill(db: AsyncSession, skill_data: dict) -> dict:
    """Create a new skill."""
    from app.models.skill import Skill

    skill = Skill(
        name=skill_data["name"],
        description=skill_data.get("description"),
        trigger_type=skill_data.get("trigger_type", "manual"),
        trigger_config=skill_data.get("trigger_config"),
        steps=skill_data.get("steps", []),
        created_by=skill_data.get("created_by"),
        created_from=skill_data.get("created_from", "manual"),
        is_active=skill_data.get("is_active", True),
        scope=skill_data.get("scope", "tenant"),
    )
    db.add(skill)
    await db.commit()
    await db.refresh(skill)

    return _skill_to_dict(skill)


async def get_skills(db: AsyncSession) -> list[dict]:
    """List all skills."""
    from app.models.skill import Skill

    result = await db.execute(
        select(Skill).order_by(Skill.is_active.desc(), Skill.times_executed.desc())
    )
    skills = result.scalars().all()
    return [_skill_to_dict(s) for s in skills]


async def get_skill(db: AsyncSession, skill_id: int) -> dict | None:
    """Get a single skill by ID."""
    from app.models.skill import Skill

    result = await db.execute(select(Skill).where(Skill.id == skill_id))
    skill = result.scalar_one_or_none()
    if not skill:
        return None
    return _skill_to_dict(skill)


async def update_skill(db: AsyncSession, skill_id: int, updates: dict) -> dict | None:
    """Update a skill."""
    from app.models.skill import Skill

    result = await db.execute(select(Skill).where(Skill.id == skill_id))
    skill = result.scalar_one_or_none()
    if not skill:
        return None

    # Allowlist of fields that callers may update — prevents overwriting
    # internal bookkeeping fields like times_executed, created_at, etc.
    UPDATABLE_FIELDS = {
        "name", "description", "trigger_type", "trigger_config",
        "steps", "is_active", "scope",
    }
    for key, val in updates.items():
        if key in UPDATABLE_FIELDS and val is not None:
            setattr(skill, key, val)
    await db.commit()
    await db.refresh(skill)
    return _skill_to_dict(skill)


async def delete_skill(db: AsyncSession, skill_id: int) -> bool:
    """Delete a skill."""
    from app.models.skill import Skill

    result = await db.execute(select(Skill).where(Skill.id == skill_id))
    skill = result.scalar_one_or_none()
    if not skill:
        return False
    await db.delete(skill)
    await db.commit()
    return True


# ---------------------------------------------------------------------------
# Execution
# ---------------------------------------------------------------------------

async def execute_skill(
    db: AsyncSession,
    skill_id: int,
    triggered_by: str = "manual",
    executed_by: int | None = None,
    tenant_schema: str = "public",
) -> dict:
    """Execute a skill — run each step in order, log results."""
    from app.models.skill import Skill, SkillExecution

    result = await db.execute(select(Skill).where(Skill.id == skill_id))
    skill = result.scalar_one_or_none()
    if not skill:
        raise ValueError(f"Skill {skill_id} not found")

    steps = skill.steps if isinstance(skill.steps, list) else []

    execution = SkillExecution(
        skill_id=skill_id,
        triggered_by=triggered_by,
        status="running",
        steps_completed=0,
        steps_total=len(steps),
        executed_by=executed_by,
    )
    db.add(execution)
    await db.flush()

    start_time = time.time()
    step_results = []

    for step in sorted(steps, key=lambda s: s.get("order", 0)):
        step_order = step.get("order", 0)
        action = step.get("action", "unknown")
        params = step.get("params", {})

        try:
            output = await _execute_step(db, action, params, tenant_schema)
            step_results.append({
                "step": step_order,
                "action": action,
                "status": "completed",
                "output": output,
            })
            execution.steps_completed = step_order
        except Exception as e:
            logger.error("Skill %d step %d (%s) failed: %s", skill_id, step_order, action, e)
            step_results.append({
                "step": step_order,
                "action": action,
                "status": "failed",
                "error": str(e),
            })
            execution.status = "failed"
            execution.error = f"Step {step_order} ({action}) failed: {e}"
            break

    if execution.status != "failed":
        execution.status = "completed"

    duration = int(time.time() - start_time)
    execution.duration_seconds = duration
    execution.results = step_results

    # Update skill metadata
    skill.times_executed = (skill.times_executed or 0) + 1
    skill.last_executed = datetime.now(timezone.utc)
    # Rolling average duration
    if skill.avg_duration_seconds:
        skill.avg_duration_seconds = int(
            (skill.avg_duration_seconds * (skill.times_executed - 1) + duration) / skill.times_executed
        )
    else:
        skill.avg_duration_seconds = duration

    await db.commit()

    return _execution_to_dict(execution)


async def get_skill_executions(db: AsyncSession, skill_id: int | None = None, limit: int = 20) -> list[dict]:
    """Get execution history, optionally filtered by skill."""
    from app.models.skill import SkillExecution

    q = select(SkillExecution).order_by(SkillExecution.created_at.desc()).limit(limit)
    if skill_id:
        q = q.where(SkillExecution.skill_id == skill_id)

    result = await db.execute(q)
    executions = result.scalars().all()
    return [_execution_to_dict(e) for e in executions]


# ---------------------------------------------------------------------------
# Step execution dispatcher
# ---------------------------------------------------------------------------

async def _execute_step(
    db: AsyncSession, action: str, params: dict, tenant_schema: str
) -> dict:
    """Dispatch a single step action to the appropriate service."""

    if action == "run_hcc_engine":
        try:
            from app.services.hcc_engine import analyze_population
            result = await analyze_population(tenant_schema, db)
            return {"status": "completed", **result}
        except Exception as e:
            logger.error("run_hcc_engine failed: %s", e)
            return {"status": "failed", "error": str(e)}

    elif action == "detect_care_gaps":
        try:
            from app.services.care_gap_service import detect_gaps
            result = await detect_gaps(db)
            return {"status": "completed", **result}
        except Exception as e:
            logger.error("detect_care_gaps failed: %s", e)
            return {"status": "failed", "error": str(e)}

    elif action == "generate_insights":
        try:
            from app.services.insight_service import generate_insights
            result = await generate_insights(db, tenant_schema=tenant_schema)
            return {"status": "completed", "insights_generated": len(result)}
        except Exception as e:
            logger.error("generate_insights failed: %s", e)
            return {"status": "failed", "error": str(e)}

    elif action == "run_discovery":
        try:
            from app.services.discovery_service import run_full_discovery
            result = await run_full_discovery(db, tenant_schema=tenant_schema)
            return {"status": "completed", "discoveries": len(result)}
        except Exception as e:
            logger.error("run_discovery failed: %s", e)
            return {"status": "failed", "error": str(e)}

    elif action == "evaluate_alert_rules":
        try:
            from app.services.alert_rules_service import evaluate_rules
            result = await evaluate_rules(db)
            return {"status": "completed", "alerts_triggered": len(result)}
        except Exception as e:
            logger.error("evaluate_alert_rules failed: %s", e)
            return {"status": "failed", "error": str(e)}

    elif action == "run_quality_checks":
        try:
            from app.services.data_quality_service import run_quality_checks
            result = await run_quality_checks(db, ingestion_job_id=params.get("job_id"))
            return {"status": "completed", **result}
        except Exception as e:
            logger.error("run_quality_checks failed: %s", e)
            return {"status": "failed", "error": str(e)}

    elif action == "generate_chase_list":
        logger.info("STUB: %s — not yet wired", action)
        return {"status": "stub", "message": "Not yet wired — generate_chase_list"}

    elif action == "create_action_items":
        logger.info("STUB: %s — not yet wired", action)
        return {"status": "stub", "message": "Not yet wired — create_action_items"}

    elif action == "send_notification":
        logger.info("STUB: %s — not yet wired", action)
        return {"status": "stub", "message": "Not yet wired — send_notification"}

    elif action == "generate_report":
        logger.info("STUB: %s — not yet wired", action)
        return {"status": "stub", "message": "Not yet wired — generate_report"}

    elif action == "refresh_dashboard":
        logger.info("STUB: %s — not yet wired", action)
        return {"status": "stub", "message": "Not yet wired — refresh_dashboard"}

    elif action == "calculate_stars":
        logger.info("STUB: %s — not yet wired", action)
        return {"status": "stub", "message": "Not yet wired — calculate_stars"}

    elif action == "refresh_provider_scorecards":
        try:
            from app.services.provider_service import refresh_provider_scorecards
            result = await refresh_provider_scorecards(db)
            return {"status": "completed", **result}
        except Exception as e:
            logger.error("refresh_provider_scorecards failed: %s", e)
            return {"status": "failed", "error": str(e)}

    else:
        return {"status": "skipped", "message": f"Unknown action: {action}"}


# ---------------------------------------------------------------------------
# AI Suggestions
# ---------------------------------------------------------------------------

async def suggest_skills(db: AsyncSession, tenant_schema: str = "public") -> list[dict]:
    """AI analyzes user action patterns and suggests skills to create."""
    from app.services.llm_guard import guarded_llm_call

    # In production, we would query UserInteraction logs to find patterns.
    # For now, provide intelligent suggestions based on platform capabilities.
    try:
        prompt = (
            "Based on common healthcare MSO workflows, suggest 2-3 automation skills "
            "that would save the most time. For each suggestion, provide:\n"
            "- name: short descriptive name\n"
            "- description: what it does and why it helps\n"
            "- trigger_type: manual, schedule, event, or condition\n"
            "- steps: list of actions from this set: run_hcc_engine, generate_chase_list, "
            "detect_care_gaps, generate_insights, run_discovery, create_action_items, "
            "send_notification, generate_report, evaluate_alert_rules, refresh_dashboard, "
            "run_quality_checks, calculate_stars\n\n"
            "Return JSON array of suggestions."
        )

        result = await guarded_llm_call(
            tenant_schema=tenant_schema,
            system_prompt="You are a healthcare workflow optimization assistant. Return only valid JSON.",
            user_prompt=prompt,
            context_data={"available_actions": [a["action"] for a in AVAILABLE_ACTIONS]},
            max_tokens=800,
        )

        import json
        import re
        response_text = result.get("response", "")
        cleaned = response_text.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```\w*\n?", "", cleaned)
            cleaned = re.sub(r"\n?```$", "", cleaned)
        suggestions = json.loads(cleaned)
        if isinstance(suggestions, list):
            return suggestions
    except Exception as e:
        logger.warning("AI skill suggestions failed: %s", e)

    # Fallback suggestions
    return [
        {
            "name": "Weekly Quality Review",
            "description": "Every Monday, run quality checks, detect care gaps, evaluate alert rules, and notify the quality team of any issues.",
            "trigger_type": "schedule",
            "trigger_config": {"cron": "0 8 * * 1"},
            "steps": [
                {"order": 1, "action": "run_quality_checks", "params": {}, "description": "Run data quality checks"},
                {"order": 2, "action": "detect_care_gaps", "params": {"scope": "full_population"}, "description": "Detect care gaps"},
                {"order": 3, "action": "evaluate_alert_rules", "params": {}, "description": "Evaluate alert rules"},
                {"order": 4, "action": "send_notification", "params": {"channel": "in_app", "template": "weekly_quality"}, "description": "Notify quality team"},
            ],
            "reason": "You run quality checks and gap detection frequently. Automating this weekly would save ~2 hours per week.",
        },
        {
            "name": "High-Risk Member Monitor",
            "description": "When a member's RAF score changes by more than 0.5, automatically run HCC analysis, check care gaps, and alert the care manager.",
            "trigger_type": "condition",
            "trigger_config": {"metric": "raf_change", "operator": "gt", "threshold": 0.5},
            "steps": [
                {"order": 1, "action": "run_hcc_engine", "params": {"scope": "single_member"}, "description": "Run HCC analysis for member"},
                {"order": 2, "action": "detect_care_gaps", "params": {"scope": "single_member"}, "description": "Check care gaps"},
                {"order": 3, "action": "create_action_items", "params": {"priority": "high", "assign_to_role": "care_manager"}, "description": "Create high-priority action item"},
                {"order": 4, "action": "send_notification", "params": {"channel": "in_app", "template": "high_risk_alert"}, "description": "Alert care manager"},
            ],
            "reason": "Proactive monitoring of high-risk members ensures timely intervention and better outcomes.",
        },
    ]


def get_preset_skills() -> list[dict]:
    """Return built-in skill templates."""
    return PRESET_SKILLS


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _skill_to_dict(skill: Any) -> dict:
    return {
        "id": skill.id,
        "name": skill.name,
        "description": skill.description,
        "trigger_type": skill.trigger_type,
        "trigger_config": skill.trigger_config,
        "steps": skill.steps,
        "created_by": skill.created_by,
        "created_from": skill.created_from,
        "is_active": skill.is_active,
        "times_executed": skill.times_executed,
        "last_executed": skill.last_executed.isoformat() if skill.last_executed else None,
        "avg_duration_seconds": skill.avg_duration_seconds,
        "scope": skill.scope,
        "created_at": skill.created_at.isoformat() if skill.created_at else None,
        "updated_at": skill.updated_at.isoformat() if skill.updated_at else None,
    }


def _execution_to_dict(execution: Any) -> dict:
    return {
        "id": execution.id,
        "skill_id": execution.skill_id,
        "triggered_by": execution.triggered_by,
        "status": execution.status,
        "steps_completed": execution.steps_completed,
        "steps_total": execution.steps_total,
        "results": execution.results,
        "error": execution.error,
        "duration_seconds": execution.duration_seconds,
        "executed_by": execution.executed_by,
        "created_at": execution.created_at.isoformat() if execution.created_at else None,
    }
