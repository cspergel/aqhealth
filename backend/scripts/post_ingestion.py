"""
Run the full post-ingestion pipeline for a tenant schema.

Executes in order:
  1. Seed quality measures (idempotent)
  2. HCC suspect analysis across full population
  3. Provider/group scorecard refresh
  4. Care gap detection
  5. AI insight generation

Usage:
    cd backend
    python -m scripts.post_ingestion --schema pinellas_mso
"""

import argparse
import asyncio
import os
import sys
import time

# ---------------------------------------------------------------------------
# Ensure app package is importable
# ---------------------------------------------------------------------------
_backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

from sqlalchemy import text  # noqa: E402

from app.database import validate_schema_name, async_session_factory  # noqa: E402


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _fmt_elapsed(start: float) -> str:
    elapsed = time.time() - start
    if elapsed < 60:
        return f"{elapsed:.1f}s"
    return f"{elapsed / 60:.1f}m"


async def _get_session(schema_name: str):
    """Create a tenant-scoped session (for script use, not FastAPI DI)."""
    session = async_session_factory()
    await session.execute(text(f'SET search_path TO "{schema_name}", public'))
    return session


# ---------------------------------------------------------------------------
# Pipeline steps
# ---------------------------------------------------------------------------

async def step_seed_measures(schema_name: str) -> dict:
    from app.services.care_gap_service import seed_default_measures
    db = await _get_session(schema_name)
    try:
        count = await seed_default_measures(db)
        await db.commit()
        return {"measures_seeded": count}
    finally:
        await db.close()


async def step_hcc_analysis(schema_name: str) -> dict:
    from app.services.hcc_engine import analyze_population
    db = await _get_session(schema_name)
    try:
        result = await analyze_population(schema_name, db)
        await db.commit()
        return result
    finally:
        await db.close()


async def step_provider_scorecards(schema_name: str) -> dict:
    from app.services.provider_service import refresh_provider_scorecards
    db = await _get_session(schema_name)
    try:
        result = await refresh_provider_scorecards(db)
        await db.commit()
        return result
    finally:
        await db.close()


async def step_care_gap_detection(schema_name: str) -> dict:
    from app.services.care_gap_service import detect_gaps
    db = await _get_session(schema_name)
    try:
        result = await detect_gaps(db)
        await db.commit()
        return result
    finally:
        await db.close()


async def step_insight_generation(schema_name: str) -> dict:
    from app.services.insight_service import generate_insights
    db = await _get_session(schema_name)
    try:
        results = await generate_insights(db, tenant_schema=schema_name)
        await db.commit()
        return {"insights_created": len(results)}
    finally:
        await db.close()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

STEPS = [
    ("Seed quality measures", step_seed_measures),
    ("HCC suspect analysis", step_hcc_analysis),
    ("Provider scorecard refresh", step_provider_scorecards),
    ("Care gap detection", step_care_gap_detection),
    ("AI insight generation", step_insight_generation),
]


async def run_pipeline(schema_name: str, skip_insights: bool = False):
    validate_schema_name(schema_name)

    # Verify schema exists
    session = async_session_factory()
    try:
        result = await session.execute(
            text("SELECT 1 FROM information_schema.schemata WHERE schema_name = :s"),
            {"s": schema_name},
        )
        if result.scalar() is None:
            print(f"ERROR: Schema '{schema_name}' does not exist.")
            print("Run create_tenant.py first.")
            sys.exit(1)
    finally:
        await session.close()

    pipeline_start = time.time()
    total_steps = len(STEPS)
    if skip_insights:
        total_steps -= 1

    print(f"Post-ingestion pipeline for schema: {schema_name}")
    print(f"Running {total_steps} steps...")
    print("=" * 60)

    for i, (name, func) in enumerate(STEPS, 1):
        if skip_insights and name == "AI insight generation":
            print(f"[{i}/{len(STEPS)}] {name} ... SKIPPED (--skip-insights)")
            continue

        print(f"[{i}/{len(STEPS)}] {name} ...", end=" ", flush=True)
        step_start = time.time()
        try:
            result = await func(schema_name)
            print(f"DONE ({_fmt_elapsed(step_start)})")
            # Print key metrics from the result
            if isinstance(result, dict):
                for k, v in result.items():
                    if isinstance(v, (int, float, str)) and not k.startswith("_"):
                        print(f"         {k}: {v}")
        except Exception as e:
            print(f"FAILED ({_fmt_elapsed(step_start)})")
            print(f"         Error: {e}")
            # Continue with next step

    print("=" * 60)
    print(f"Pipeline complete in {_fmt_elapsed(pipeline_start)}")


def main():
    parser = argparse.ArgumentParser(
        description="Run post-ingestion pipeline for a tenant schema."
    )
    parser.add_argument("--schema", required=True, help="Tenant schema name")
    parser.add_argument(
        "--skip-insights", action="store_true",
        help="Skip the AI insight generation step (requires API key)"
    )

    args = parser.parse_args()
    asyncio.run(run_pipeline(args.schema, skip_insights=args.skip_insights))


if __name__ == "__main__":
    main()
