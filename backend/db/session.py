"""
SQLAlchemy engine + session factory.

Requires DATABASE_URL to be set to a Supabase PostgreSQL connection string:
  postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

DATABASE_URL: str = os.environ.get("DATABASE_URL", "")

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL environment variable is not set. "
        "Set it to your Supabase PostgreSQL connection string."
    )

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=3,
    max_overflow=4,   # hard cap at 7 total — leaves headroom for Supabase's 15-conn limit
    connect_args={"connect_timeout": 10, "sslmode": "require"},
    pool_timeout=30,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def create_tables() -> None:
    """Create all tables if they don't exist. Called once at app startup."""
    from backend.db.models import Base  # local import avoids circular deps
    Base.metadata.create_all(bind=engine)


def get_db():
    """FastAPI dependency that yields a DB session."""
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
