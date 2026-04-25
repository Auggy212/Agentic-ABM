"""
SQLAlchemy engine + session factory.

Resolution order for the database URL:
  1. DATABASE_URL environment variable  (PostgreSQL in production)
  2. Falls back to a local SQLite file   (abm_engine.db in the repo root)

This means the backend starts and works correctly with zero infrastructure —
no PostgreSQL required for local development.
"""

from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session, sessionmaker

_DEFAULT_SQLITE = (
    f"sqlite:///{Path(__file__).resolve().parent.parent / 'abm_engine.db'}"
)

DATABASE_URL: str = os.environ.get("DATABASE_URL", _DEFAULT_SQLITE)

_is_sqlite = DATABASE_URL.startswith("sqlite")

# SQLite needs check_same_thread=False; pool_pre_ping is fine for both.
_connect_args = {"check_same_thread": False} if _is_sqlite else {}

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=not _is_sqlite,   # pre-ping not useful for SQLite
    connect_args=_connect_args,
)

# Enable WAL mode + foreign keys for SQLite connections
if _is_sqlite:
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_conn, _conn_record):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

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
