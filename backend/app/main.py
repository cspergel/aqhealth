import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings

logger = logging.getLogger(__name__)
from app.routers import actions, adt, ai_pipeline, alert_rules, annotations, auth, attribution, avoidable, awv, boi, care_gaps, care_plans, case_management, claims, clinical, clinical_exchange, cohorts, dashboard, data_quality, discovery, expenditure, fhir, financial, filters, groups, hcc, ingestion, insights, interfaces, journey, learning, members, patterns, practice_expenses, predictions, prior_auth, providers, query, radv, reconciliation, reports, risk_accounting, scenarios, skills, stars, stoploss, tcm, temporal, tenants, utilization, watchlist

app = FastAPI(
    title="AQSoft Health Platform",
    version="0.1.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


@app.on_event("startup")
async def _warn_default_secrets():
    if settings.secret_key == "CHANGE-ME-IN-PRODUCTION":
        logger.warning(
            "SECRET_KEY is set to the default value. "
            "This is insecure — set a strong SECRET_KEY environment variable before deploying to production."
        )


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "version": "0.1.0"}
