"""
SQLAlchemy ORM models for the ABM Engine backend.

UUID columns are stored as String(36) to stay compatible with SQLite in tests.
On PostgreSQL the data is still valid UUID — the driver handles coercion.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text, text
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


class BuyerProfileRecord(Base):
    __tablename__ = "buyer_profiles"
    __table_args__ = (
        Index("ix_buyer_profiles_client_domain", "client_id", "account_domain"),
        Index("ix_buyer_profiles_domain_role", "account_domain", "committee_role"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    account_domain: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    contact_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True)
    committee_role: Mapped[str] = mapped_column(String(30), nullable=False)
    source: Mapped[str] = mapped_column(String(30), nullable=False, default="APOLLO")
    data: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(tz=timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(tz=timezone.utc),
        onupdate=lambda: datetime.now(tz=timezone.utc),
    )


class BuyerIntelRunRecord(Base):
    __tablename__ = "buyer_intel_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(tz=timezone.utc),
    )
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    total_accounts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_contacts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    quota_warnings: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    pending_domains: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="running")


class SignalReportRecord(Base):
    __tablename__ = "signal_reports"
    __table_args__ = (
        Index("ix_signal_reports_client_domain", "client_id", "account_domain"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    account_domain: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    data: Mapped[dict] = mapped_column(JSON, nullable=False)
    buying_stage: Mapped[str] = mapped_column(String(30), nullable=False)
    has_intel_report: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(tz=timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(tz=timezone.utc),
        onupdate=lambda: datetime.now(tz=timezone.utc),
    )


class SignalIntelRunRecord(Base):
    __tablename__ = "signal_intel_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(tz=timezone.utc),
    )
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    total_accounts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    quota_warnings: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="running")


class VerificationResultRecord(Base):
    __tablename__ = "verification_results"
    __table_args__ = (
        Index("ix_verification_results_client_contact", "client_id", "contact_id"),
        Index("ix_verification_results_domain_status", "account_domain", "final_email_status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    contact_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    account_domain: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    data: Mapped[dict] = mapped_column(JSON, nullable=False)
    final_email_status: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    overall_data_quality_score: Mapped[int] = mapped_column(Integer, nullable=False)
    verified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class VerifiedRunRecord(Base):
    __tablename__ = "verified_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(tz=timezone.utc),
    )
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    deliverability_rate: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    meets_target: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    diagnosis: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    quota_usage: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="running")
    data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)


class RecentActivityRecord(Base):
    __tablename__ = "recent_activity"
    __table_args__ = (
        Index("ix_recent_activity_client_has_data", "client_id", "has_data"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    contact_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True)
    data: Mapped[dict] = mapped_column(JSON, nullable=False)
    source: Mapped[str] = mapped_column(String(50), nullable=False)
    scraped_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    has_data: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class CP2ReviewStateRecord(Base):
    __tablename__ = "cp2_review_states"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True, index=True)
    data: Mapped[dict] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="NOT_STARTED")
    opened_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewer: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)


class CP2AuditLogRecord(Base):
    __tablename__ = "cp2_audit_log"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    claim_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    account_domain: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    reviewer: Mapped[str] = mapped_column(String(255), nullable=False)
    before_state: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    after_state: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(tz=timezone.utc),
    )


class PromptTemplateRecord(Base):
    __tablename__ = "prompt_templates"
    __table_args__ = (
        Index("ix_prompt_templates_slot_active", "channel", "tier_target", "sequence_position", "active"),
        Index(
            "ux_prompt_templates_active_slot",
            "channel",
            "tier_target",
            "sequence_position",
            unique=True,
            sqlite_where=text("active = 1"),
            postgresql_where=text("active = true"),
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    template_id: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    channel: Mapped[str] = mapped_column(String(40), nullable=False)
    tier_target: Mapped[str] = mapped_column(String(20), nullable=False)
    sequence_position: Mapped[int] = mapped_column(Integer, nullable=False)
    engine_target: Mapped[str] = mapped_column(String(40), nullable=False)
    system_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    user_prompt_template: Mapped[str] = mapped_column(Text, nullable=False)
    max_tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    temperature: Mapped[float] = mapped_column(Float, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    version: Mapped[str] = mapped_column(String(30), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(tz=timezone.utc),
    )
    deprecated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    deprecation_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class MessageRecord(Base):
    __tablename__ = "messages"
    __table_args__ = (
        Index("ix_messages_client_account", "client_id", "account_domain"),
        Index("ix_messages_client_contact", "client_id", "contact_id"),
        Index("ix_messages_client_review_state", "client_id", "review_state"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    client_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    account_domain: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    contact_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    channel: Mapped[str] = mapped_column(String(40), nullable=False)
    sequence_position: Mapped[int] = mapped_column(Integer, nullable=False)
    tier: Mapped[str] = mapped_column(String(20), nullable=False)
    data: Mapped[dict] = mapped_column(JSON, nullable=False)
    validation_state: Mapped[str] = mapped_column(String(30), nullable=False)
    review_state: Mapped[str] = mapped_column(String(40), nullable=False)
    last_updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class MessagingRunRecord(Base):
    __tablename__ = "messaging_runs"
    __table_args__ = (
        Index("ix_messaging_runs_client_started", "client_id", "started_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(tz=timezone.utc),
    )
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    total_messages: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    hard_failures: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    soft_failures: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_cost_usd: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    claude_cost_usd: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    gpt_cost_usd: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="RUNNING")
    data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)


class CP3ReviewStateRecord(Base):
    __tablename__ = "cp3_review_states"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True, index=True)
    data: Mapped[dict] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="NOT_STARTED")
    opened_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewer: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    client_share_token: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, unique=True, index=True)


class CP3MessageReviewRecord(Base):
    __tablename__ = "cp3_message_reviews"
    __table_args__ = (
        Index("ix_cp3_message_reviews_state_decision", "cp3_state_id", "review_decision"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    cp3_state_id: Mapped[str] = mapped_column(String(36), ForeignKey("cp3_review_states.id"), nullable=False, index=True)
    message_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    review_decision: Mapped[str] = mapped_column(String(30), nullable=False)
    review_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reviewer: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    opened_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class CP3BuyerApprovalRecord(Base):
    __tablename__ = "cp3_buyer_approvals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    cp3_state_id: Mapped[str] = mapped_column(String(36), ForeignKey("cp3_review_states.id"), nullable=False, index=True)
    contact_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    account_domain: Mapped[str] = mapped_column(String(255), nullable=False)
    buyer_decision: Mapped[str] = mapped_column(String(30), nullable=False)
    buyer_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class CP3ClientFeedbackRecord(Base):
    __tablename__ = "cp3_client_feedback"
    __table_args__ = (
        Index("ix_cp3_client_feedback_state_resolved", "cp3_state_id", "resolved"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    cp3_state_id: Mapped[str] = mapped_column(String(36), ForeignKey("cp3_review_states.id"), nullable=False, index=True)
    message_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    feedback_text: Mapped[str] = mapped_column(Text, nullable=False)
    sentiment: Mapped[str] = mapped_column(String(30), nullable=False)
    resolved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    resolved_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    resolution_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class CP3AuditLogRecord(Base):
    __tablename__ = "cp3_audit_log"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    reviewer: Mapped[str] = mapped_column(String(255), nullable=False)
    before_state: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    after_state: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(tz=timezone.utc),
    )


class CampaignRunRecord(Base):
    __tablename__ = "campaign_runs"
    __table_args__ = (Index("ix_campaign_runs_client_started", "client_id", "started_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(tz=timezone.utc))
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="RUNNING")
    total_messages: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_sent: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_failed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_pending: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    halted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    halt_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    quota_warnings: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)


class OutboundSendRecord(Base):
    __tablename__ = "outbound_sends"
    __table_args__ = (
        Index("ix_outbound_sends_client_status", "client_id", "status"),
        Index("ix_outbound_sends_run", "run_id"),
        Index("ix_outbound_sends_message", "message_id"),
        Index("ix_outbound_sends_provider_msg", "transport", "provider_message_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    run_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    client_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    message_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    account_domain: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    contact_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    channel: Mapped[str] = mapped_column(String(40), nullable=False)
    transport: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="QUEUED")
    provider_message_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    error_code: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    attempted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(tz=timezone.utc))
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)


class EngagementEventRecord(Base):
    __tablename__ = "engagement_events"
    __table_args__ = (
        Index("ix_engagement_events_client_account", "client_id", "account_domain"),
        Index("ix_engagement_events_provider_id", "provider", "provider_event_id", unique=True),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    account_domain: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    contact_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    channel: Mapped[str] = mapped_column(String(40), nullable=False)
    event_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    score_delta: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    provider: Mapped[str] = mapped_column(String(30), nullable=False)
    provider_event_id: Mapped[str] = mapped_column(String(255), nullable=False)
    data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(tz=timezone.utc))


class CampaignHaltRecord(Base):
    """Active when resumed_at is null. scope=CLIENT for client-scoped halts; scope=GLOBAL has client_id=null."""

    __tablename__ = "campaign_halts"
    __table_args__ = (Index("ix_campaign_halts_active", "scope", "client_id", "resumed_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    scope: Mapped[str] = mapped_column(String(20), nullable=False, default="CLIENT")
    reason: Mapped[str] = mapped_column(String(50), nullable=False)
    detail: Mapped[str] = mapped_column(Text, nullable=False)
    triggered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(tz=timezone.utc))
    triggered_by: Mapped[str] = mapped_column(String(255), nullable=False)
    resumed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    resumed_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)


class QuotaCounterRecord(Base):
    """Fallback per-source per-window counter when Redis is unavailable. Window is yyyymm or yyyymmdd."""

    __tablename__ = "quota_counters"
    __table_args__ = (Index("ux_quota_counters_source_window", "source", "window", unique=True),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    source: Mapped[str] = mapped_column(String(50), nullable=False)
    window: Mapped[str] = mapped_column(String(20), nullable=False)
    used: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    limit_value: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(tz=timezone.utc), onupdate=lambda: datetime.now(tz=timezone.utc))


class WebhookReceiptRecord(Base):
    """
    Idempotency ledger for inbound webhooks. The (provider, provider_event_id)
    pair is unique — a replayed delivery short-circuits in the receiver before
    any side effects fire.
    """

    __tablename__ = "webhook_receipts"
    __table_args__ = (Index("ux_webhook_receipts_provider_event", "provider", "provider_event_id", unique=True),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    provider: Mapped[str] = mapped_column(String(30), nullable=False)
    provider_event_id: Mapped[str] = mapped_column(String(255), nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(tz=timezone.utc))
    raw_payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)


class AccountPauseRecord(Base):
    """
    Active when resumed_at is null. Created by the webhook processor on negative
    reply (Phase 4->5 handoff doc: 'pause all automation for that account and
    alert the Operator'). Per master prompt §5: pause is unconditional — applied
    regardless of reply_classifier confidence or fallback path.
    """

    __tablename__ = "account_pauses"
    __table_args__ = (Index("ix_account_pauses_active", "client_id", "account_domain", "resumed_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    account_domain: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    contact_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    reason: Mapped[str] = mapped_column(String(80), nullable=False)
    detail: Mapped[str] = mapped_column(Text, nullable=False)
    triggered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(tz=timezone.utc))
    resumed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    resumed_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)


class CampaignAuditLogRecord(Base):
    __tablename__ = "campaign_audit_log"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    run_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    actor: Mapped[str] = mapped_column(String(255), nullable=False)
    before_state: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    after_state: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(tz=timezone.utc))


class SalesHandoffRecord(Base):
    """
    Checkpoint 4 — Sales Handoff Notes. Created by the Phase 5 Campaign agent
    when an account engagement_score crosses >=60. Sales Exec must
    ACCEPT/REJECT within 24h of notify_sent_at or the row is auto-escalated.
    The (client_id, account_domain, contact_id) tuple is unique among
    PENDING/ACCEPTED rows so re-triggering does not create duplicates.
    """

    __tablename__ = "sales_handoffs"
    __table_args__ = (
        Index("ix_sales_handoffs_client_status", "client_id", "status"),
        Index("ix_sales_handoffs_account", "client_id", "account_domain"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    account_domain: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    contact_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    data: Mapped[dict] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="PENDING", index=True)
    engagement_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(tz=timezone.utc),
    )
    notify_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    accepted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    accepted_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    rejected_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    escalated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class CP4AuditLogRecord(Base):
    """Append-only audit trail for every CP4 state change."""

    __tablename__ = "cp4_audit_log"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    handoff_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    client_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    actor: Mapped[str] = mapped_column(String(255), nullable=False)
    before_state: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    after_state: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(tz=timezone.utc),
    )


class EventRecord(Base):
    __tablename__ = "events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(tz=timezone.utc),
    )
