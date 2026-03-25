from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import auth, care_gaps, dashboard, discovery, expenditure, groups, hcc, ingestion, insights, learning, patterns, providers, query

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


app.include_router(auth.router)
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


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "version": "0.1.0"}
