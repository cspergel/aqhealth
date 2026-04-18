import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.core.logging import configure_logging, RequestIdMiddleware
from app.core.audit import AuditMiddleware
from app.core.security_headers import SecurityHeadersMiddleware
from app.core.observability import init_sentry

# Logging must be configured before any other module emits a log line, so
# that the first line is already JSON-formatted with the correct level.
configure_logging()

# Sentry is opt-in: no-op unless SENTRY_DSN is set AND sentry-sdk is installed.
init_sentry()

logger = logging.getLogger(__name__)

from app.routers import actions, adt, ai_pipeline, alert_rules, annotations, auth, attribution, avoidable, awv, boi, care_gaps, care_plans, case_management, claims, clinical, clinical_exchange, cohorts, dashboard, data_protection, data_quality, discovery, education, expenditure, fhir, financial, filters, groups, hcc, health, ingestion, insights, interfaces, journey, learning, members, onboarding, payer_api, patterns, practice_expenses, predictions, prior_auth, providers, query, radv, reconciliation, reports, risk_accounting, scenarios, skills, stars, stoploss, tags, tcm, temporal, tenants, utilization, watchlist
from app.routers.tuva_router import router as tuva_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown lifecycle.

    SECRET_KEY / ENCRYPTION_KEY validation runs at config-load time via
    Pydantic field_validators (app.config). The service refuses to import
    if either is missing or set to a placeholder.
    """
    # --- Startup ---
    # Ensure platform schema + baseline tables exist so auth works on first boot.
    # Schema evolution beyond baseline goes through Alembic migrations.
    from app.database import init_db
    await init_db()

    yield  # App runs here

    # --- Shutdown ---
    from app.database import engine
    await engine.dispose()


app = FastAPI(
    title="AQSoft Health Platform",
    version="0.1.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Middleware execution order matters: Starlette applies middleware in
# reverse registration order, so the LAST-added middleware runs FIRST
# (outermost). AuditMiddleware reads the request_id contextvar populated by
# RequestIdMiddleware, so RequestIdMiddleware must be outermost. Register
# AuditMiddleware FIRST and RequestIdMiddleware SECOND so the wire order
# becomes: client -> RequestIdMiddleware -> AuditMiddleware -> router.
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(AuditMiddleware)
app.add_middleware(RequestIdMiddleware)


app.include_router(health.router)
app.include_router(adt.router)
app.include_router(alert_rules.router)
app.include_router(auth.router)
app.include_router(clinical.router)
app.include_router(dashboard.router)
app.include_router(discovery.router)
app.include_router(hcc.router)
app.include_router(expenditure.router)
app.include_router(ingestion.router)
app.include_router(providers.router)
app.include_router(groups.router)
app.include_router(care_gaps.router)
app.include_router(insights.router)
app.include_router(patterns.router)
app.include_router(learning.router)
app.include_router(query.router)
app.include_router(journey.router)
app.include_router(members.router)
app.include_router(financial.router)
app.include_router(cohorts.router)
app.include_router(predictions.router)
app.include_router(reconciliation.router)
app.include_router(scenarios.router)
app.include_router(filters.router)
app.include_router(annotations.router)
app.include_router(watchlist.router)
app.include_router(reports.router)
app.include_router(actions.router)
app.include_router(tenants.router)
app.include_router(claims.router)
app.include_router(data_quality.router)
app.include_router(awv.router)
app.include_router(stars.router)
app.include_router(stoploss.router)
app.include_router(radv.router)
app.include_router(tcm.router)
app.include_router(attribution.router)
app.include_router(temporal.router)
app.include_router(practice_expenses.router)
app.include_router(boi.router)
app.include_router(clinical_exchange.router)
app.include_router(risk_accounting.router)
app.include_router(care_plans.router)
app.include_router(case_management.router)
app.include_router(prior_auth.router)
app.include_router(utilization.router)
app.include_router(avoidable.router)
app.include_router(fhir.router)
app.include_router(interfaces.router)
app.include_router(ai_pipeline.router)
app.include_router(skills.router)
app.include_router(data_protection.router)
app.include_router(education.router)
app.include_router(tags.router)
app.include_router(onboarding.router)
app.include_router(payer_api.router)
app.include_router(tuva_router)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception: %s", exc, exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})

# Health endpoints (live/ready) live in app.routers.health and are included
# with the rest of the routers. Keeping this file free of inline routes.
