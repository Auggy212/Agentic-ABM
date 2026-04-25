"""
SQLAlchemy ORM models for the ABM Engine backend.

UUID columns are stored as String(36) to stay compatible with SQLite in tests.
On PostgreSQL the data is still valid UUID — the driver handles coercion.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text
from sqlalchemy import JSON
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class MasterContextRecord(Base):
    """
    Persisted Master Context documents.

    One row per finalised intake submission. Multiple versions of the same
    client are allowed (each increment of version produces a new row).
    """

    __tablename__ = "master_contexts"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    client_id: Mapped[str] = mapped_column(
        String(36),
        nullable=False,
        index=True,
    )
    version: Mapped[str] = mapped_column(String(20), nullable=False, default="1.0.0")
    # JSON works cross-dialect; JSONB is Postgres-only and set via compile-time dialect
    data: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(tz=timezone.utc),
    )


class ICPAccountRecord(Base):
    """
    Persisted ICP accounts produced by ICP Scout runs.

    is_removed / removed_reason implement soft-delete — Phase 2 agents
    reference these IDs and must never encounter hard-deleted rows.
    """

    __tablename__ = "icp_accounts"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    client_id: Mapped[str] = mapped_column(
        String(36),
        nullable=False,
        index=True,
    )
    run_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        nullable=True,
        index=True,
    )
    domain: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    company_name: Mapped[str] = mapped_column(String(255), nullable=False)
    tier: Mapped[str] = mapped_column(String(20), nullable=False)
    icp_score: Mapped[int] = mapped_column(Integer, nullable=False)
    source: Mapped[str] = mapped_column(String(50), nullable=False)
    data: Mapped[dict] = mapped_column(JSON, nullable=False)
    is_removed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    removed_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(tz=timezone.utc),
    )


class ICPRunRecord(Base):
    """
    Audit log for each ICP Scout discovery run.
    """

    __tablename__ = "icp_runs"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    client_id: Mapped[str] = mapped_column(
        String(36),
        nullable=False,
        index=True,
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(tz=timezone.utc),
    )
    finished_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    total_found: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    quota_warnings: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="running",
    )
