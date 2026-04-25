"""
FastAPI application entry point for the ABM Engine backend.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.routes.accounts import router as accounts_router
from backend.api.routes.intake import router as intake_router
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


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
