"""
FastAPI application entry point for the ABM Engine backend.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.routes.accounts import router as accounts_router
from backend.api.routes.agents import router as agents_router
from backend.api.routes.buyers import router as buyers_router
from backend.api.routes.client_review import router as client_review_router
from backend.api.routes.copilot import router as copilot_router
from backend.api.routes.cp2 import router as cp2_router
from backend.api.routes.cp3 import router as cp3_router
from backend.api.routes.campaign import router as campaign_router
from backend.api.routes.cp4 import router as cp4_router
from backend.api.routes.webhooks import router as webhooks_router
from backend.api.routes.dashboard import router as dashboard_router
from backend.api.routes.intake import router as intake_router
from backend.api.routes.recent_activity import router as recent_activity_router
from backend.api.routes.sequences import router as sequences_router
from backend.api.routes.signals import router as signals_router
from backend.api.routes.storyteller import router as storyteller_router
from backend.api.routes.templates import router as templates_router
from backend.api.routes.verify import router as verify_router
from backend.db.session import create_tables


@asynccontextmanager
async def lifespan(_app: FastAPI):
    create_tables()   # creates SQLite file + schema on first run; no-op if tables exist
    yield


app = FastAPI(
    title="ABM Engine API",
    version="1.0.0",
    description="Agentic Account-Based Marketing Engine",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(intake_router)
app.include_router(accounts_router)
app.include_router(agents_router)
app.include_router(buyers_router)
app.include_router(copilot_router)
app.include_router(dashboard_router)
app.include_router(sequences_router)
app.include_router(signals_router)
app.include_router(verify_router)
app.include_router(recent_activity_router)
app.include_router(cp2_router)
app.include_router(cp3_router)
app.include_router(cp4_router)
app.include_router(webhooks_router)
app.include_router(campaign_router)
app.include_router(client_review_router)
app.include_router(templates_router)
app.include_router(storyteller_router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
