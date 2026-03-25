"""
Automated Report Generation service.

Generates structured reports with AI narrative summaries by pulling data
from relevant services across the platform and calling Claude for
executive summary and per-section narratives.
"""

import json
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.report import ReportTemplate, GeneratedReport

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Template management
# ---------------------------------------------------------------------------

async def get_templates(db: AsyncSession) -> list[dict]:
    """List all report templates."""
    result = await db.execute(
        select(ReportTemplate).order_by(ReportTemplate.name)
    )
    templates = result.scalars().all()
    return [_template_to_dict(t) for t in templates]


async def get_template(db: AsyncSession, template_id: int) -> dict | None:
    """Get a single report template."""
    template = await db.get(ReportTemplate, template_id)
    if not template:
        return None
    return _template_to_dict(template)


# ---------------------------------------------------------------------------
# Report generation
# ---------------------------------------------------------------------------

async def generate_report(
    db: AsyncSession,
    template_id: int,
    period: str,
    generated_by: int,
    params: dict | None = None,
) -> dict:
    """
    Generate a report from a template:
    1. Pull data for each section from relevant services
    2. Call Claude to write narrative summaries per section + executive summary
    3. Store structured content in GeneratedReport.content
    """
    template = await db.get(ReportTemplate, template_id)
    if not template:
        raise ValueError(f"Template {template_id} not found")

    # Create the report record in "generating" status
    report = GeneratedReport(
        template_id=template_id,
        title=f"{template.name} - {period}",
        period=period,
        status="generating",
        generated_by=generated_by,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)

    try:
        # Build section data
        sections_data = []
        for section_def in (template.sections or []):
            section_type = section_def.get("type", "")
            section_title = section_def.get("title", section_type.replace("_", " ").title())
            data = await _pull_section_data(db, section_type)
            narrative = await _generate_section_narrative(section_type, section_title, data)
            sections_data.append({
                "type": section_type,
                "title": section_title,
                "data": data,
                "narrative": narrative,
            })

        # Generate executive summary
        executive_summary = await _generate_executive_summary(template.name, period, sections_data)

        # Update report
        report.content = {"sections": sections_data}
        report.ai_narrative = executive_summary
        report.status = "ready"
        await db.commit()
        await db.refresh(report)

    except Exception as e:
        logger.error("Report generation failed: %s", e, exc_info=True)
        report.status = "failed"
        await db.commit()
        await db.refresh(report)

    return _report_to_dict(report)


# ---------------------------------------------------------------------------
# Report retrieval
# ---------------------------------------------------------------------------

async def get_reports(db: AsyncSession) -> list[dict]:
    """List all generated reports."""
    result = await db.execute(
        select(GeneratedReport).order_by(GeneratedReport.created_at.desc())
    )
    reports = result.scalars().all()
    return [_report_to_dict(r) for r in reports]


async def get_report(db: AsyncSession, report_id: int) -> dict | None:
    """Get a single generated report with full content."""
    report = await db.get(GeneratedReport, report_id)
    if not report:
        return None
    return _report_to_dict(report)


# ---------------------------------------------------------------------------
# Section data pullers — each section type maps to relevant data
# ---------------------------------------------------------------------------

async def _pull_section_data(db: AsyncSession, section_type: str) -> dict:
    """Pull data for a specific section type from the relevant services."""
    # In a full implementation, each section type would query real services.
    # For now, return structured placeholders that match the expected shapes.
    pullers = {
        "raf_summary": _pull_raf_summary,
        "quality_metrics": _pull_quality_metrics,
        "expenditure_overview": _pull_expenditure_overview,
        "provider_performance": _pull_provider_performance,
        "care_management": _pull_care_management,
        "financial_summary": _pull_financial_summary,
        "hcc_capture": _pull_hcc_capture,
        "recommendations": _pull_recommendations,
    }
    puller = pullers.get(section_type)
    if puller:
        return await puller(db)
    return {"note": f"Section type '{section_type}' not yet implemented"}


async def _pull_raf_summary(db: AsyncSession) -> dict:
    """Pull RAF performance data."""
    from app.services.insight_service import build_context_graph
    try:
        ctx = await build_context_graph(db)
        pop = ctx.get("population", {})
        hcc = ctx.get("hcc_suspects", {})
        return {
            "total_lives": pop.get("total_lives", 0),
            "avg_raf": pop.get("avg_raf", 0),
            "projected_raf": pop.get("avg_projected_raf", 0),
            "open_suspects": hcc.get("open_count", 0),
            "suspect_value": hcc.get("total_annual_value", 0),
            "top_categories": hcc.get("top_categories", [])[:5],
        }
    except Exception:
        return {}


async def _pull_quality_metrics(db: AsyncSession) -> dict:
    from app.services.insight_service import build_context_graph
    try:
        ctx = await build_context_graph(db)
        return {"measures": ctx.get("care_gaps", {}).get("measures", [])}
    except Exception:
        return {}


async def _pull_expenditure_overview(db: AsyncSession) -> dict:
    from app.services.insight_service import build_context_graph
    try:
        ctx = await build_context_graph(db)
        return ctx.get("expenditure", {})
    except Exception:
        return {}


async def _pull_provider_performance(db: AsyncSession) -> dict:
    from app.services.insight_service import build_context_graph
    try:
        ctx = await build_context_graph(db)
        return ctx.get("providers", {})
    except Exception:
        return {}


async def _pull_care_management(db: AsyncSession) -> dict:
    return {"note": "Care management data pull — placeholder"}


async def _pull_financial_summary(db: AsyncSession) -> dict:
    from app.services.financial_service import get_pnl
    try:
        return await get_pnl(db)
    except Exception:
        return {}


async def _pull_hcc_capture(db: AsyncSession) -> dict:
    from app.services.insight_service import build_context_graph
    try:
        ctx = await build_context_graph(db)
        return ctx.get("hcc_suspects", {})
    except Exception:
        return {}


async def _pull_recommendations(db: AsyncSession) -> dict:
    return {"note": "AI recommendations generated during narrative phase"}


# ---------------------------------------------------------------------------
# AI narrative generation
# ---------------------------------------------------------------------------

def _get_anthropic_client():
    """Create an async Anthropic client, returning None if unavailable."""
    if not settings.anthropic_api_key:
        return None
    try:
        import anthropic
        return anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    except ImportError:
        return None


async def _generate_section_narrative(section_type: str, title: str, data: dict) -> str:
    """Generate a narrative summary for a report section using Claude."""
    client = _get_anthropic_client()
    if not client:
        return f"[AI narrative for {title} would appear here with live data.]"

    try:
        response = await client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1024,
            system="You are a healthcare analytics report writer for a Medicare Advantage MSO. Write concise, data-driven narratives suitable for board reports and regulatory submissions. Use specific numbers from the data provided. Write in professional third person.",
            messages=[{
                "role": "user",
                "content": f"Write a 2-3 paragraph narrative summary for the '{title}' section of a report.\n\nData:\n{json.dumps(data, indent=2, default=str)}\n\nBe specific with numbers. Write professionally.",
            }],
        )
        return response.content[0].text
    except Exception as e:
        logger.error("Failed to generate section narrative: %s", e)
        return f"[Narrative generation failed for {title}]"


async def _generate_executive_summary(report_name: str, period: str, sections: list[dict]) -> str:
    """Generate an executive summary from all section data and narratives."""
    client = _get_anthropic_client()
    if not client:
        return "[AI-generated executive summary would appear here with live data.]"

    sections_text = ""
    for s in sections:
        sections_text += f"\n## {s['title']}\n{s.get('narrative', '')}\n"

    try:
        response = await client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2048,
            system="You are a healthcare analytics executive report writer. Write a compelling executive summary that synthesizes key findings across all sections. Focus on the most impactful data points, risks, and opportunities. Write for a board audience.",
            messages=[{
                "role": "user",
                "content": f"Write an executive summary for the '{report_name}' covering {period}.\n\nSection summaries:\n{sections_text}\n\nWrite 3-5 paragraphs synthesizing the key findings, risks, and recommended actions.",
            }],
        )
        return response.content[0].text
    except Exception as e:
        logger.error("Failed to generate executive summary: %s", e)
        return "[Executive summary generation failed]"


# ---------------------------------------------------------------------------
# Serialization helpers
# ---------------------------------------------------------------------------

def _template_to_dict(t: ReportTemplate) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "description": t.description,
        "report_type": t.report_type,
        "sections": t.sections,
        "schedule": t.schedule,
        "is_system": t.is_system,
    }


def _report_to_dict(r: GeneratedReport) -> dict:
    return {
        "id": r.id,
        "template_id": r.template_id,
        "title": r.title,
        "period": r.period,
        "status": r.status,
        "content": r.content,
        "ai_narrative": r.ai_narrative,
        "generated_by": r.generated_by,
        "file_url": r.file_url,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }
