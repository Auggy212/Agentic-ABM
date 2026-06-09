"""
RAG Indexer — converts app data into searchable embeddings.

Called automatically after every agent run via post_run_index().
Also callable on-demand via index_client() to rebuild a client's full index.

Architecture:
  - Each source table has a _chunk_* function that turns one ORM row into
    a human-readable text chunk.
  - upsert_chunk() stores/updates the chunk + embedding in rag_index.
  - Embeddings are computed lazily: the text is always stored so keyword
    search works immediately; the embedding is added in the same call when
    sentence-transformers is available.
"""

from __future__ import annotations

import logging
from typing import List, Optional

from sqlalchemy.orm import Session

from backend.db.models import (
    BuyerProfileRecord,
    CP3ClientFeedbackRecord,
    ICPAccountRecord,
    MasterContextRecord,
    MessageRecord,
    RagIndexRecord,
    SignalReportRecord,
    SalesHandoffRecord,
    VerificationResultRecord,
)

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Text chunkers — one per source table
# ---------------------------------------------------------------------------

def _chunk_icp_account(row: ICPAccountRecord) -> str:
    d = row.data or {}
    parts = [
        f"ICP Account: {row.company_name} ({row.domain})",
        f"Tier: {row.tier} | ICP Score: {row.icp_score} | Source: {row.source}",
    ]
    if d.get("industry"):
        parts.append(f"Industry: {d['industry']}")
    if d.get("employee_count"):
        parts.append(f"Employees: {d['employee_count']}")
    if d.get("tech_stack"):
        parts.append(f"Tech stack: {', '.join(d['tech_stack'][:8])}")
    if d.get("funding_stage"):
        parts.append(f"Funding: {d['funding_stage']}")
    if d.get("location"):
        parts.append(f"Location: {d['location']}")
    if row.is_removed:
        parts.append(f"[REMOVED: {row.removed_reason}]")
    return " | ".join(parts)


def _chunk_buyer_profile(row: BuyerProfileRecord) -> str:
    d = row.data or {}
    parts = [
        f"Buyer Profile: {d.get('full_name', row.contact_id)} at {row.account_domain}",
        f"Role: {row.committee_role} | Source: {row.source}",
    ]
    if d.get("title"):
        parts.append(f"Title: {d['title']}")
    if d.get("email"):
        parts.append(f"Email: {d['email']}")
    if d.get("pain_points"):
        parts.append(f"Pain points: {'; '.join(d['pain_points'][:3])}")
    if d.get("linkedin_url"):
        parts.append(f"LinkedIn: {d['linkedin_url']}")
    return " | ".join(parts)


def _chunk_signal_report(row: SignalReportRecord) -> str:
    d = row.data or {}
    parts = [
        f"Signal Report: {row.account_domain}",
        f"Buying stage: {row.buying_stage}",
    ]
    signals = d.get("signals", [])
    if signals:
        top = signals[:4]
        sig_text = "; ".join(
            f"{s.get('signal_type', '?')} ({s.get('intent', '?')}): {s.get('summary', '')[:80]}"
            for s in top
        )
        parts.append(f"Top signals: {sig_text}")
    if row.has_intel_report and d.get("intel_report"):
        ir = d["intel_report"]
        if ir.get("recommended_angle"):
            parts.append(f"Recommended angle: {ir['recommended_angle'][:120]}")
        if ir.get("inferred_pain_points"):
            parts.append(f"Pain points: {'; '.join(ir['inferred_pain_points'][:3])}")
    return " | ".join(parts)


def _chunk_message(row: MessageRecord) -> str:
    d = row.data or {}
    parts = [
        f"Outreach message for {row.account_domain} ({row.channel}, position {row.sequence_position}, tier {row.tier})",
        f"Validation: {row.validation_state} | Review: {row.review_state}",
    ]
    if d.get("subject"):
        parts.append(f"Subject: {d['subject'][:100]}")
    if d.get("body"):
        parts.append(f"Body preview: {d['body'][:200]}")
    if d.get("personalization_hooks"):
        parts.append(f"Hooks: {'; '.join(d['personalization_hooks'][:3])}")
    return " | ".join(parts)


def _chunk_verification_result(row: VerificationResultRecord) -> str:
    d = row.data or {}
    parts = [
        f"Verification: contact {row.contact_id} at {row.account_domain}",
        f"Email status: {row.final_email_status} | Quality score: {row.overall_data_quality_score}",
    ]
    if d.get("verified_email"):
        parts.append(f"Verified email: {d['verified_email']}")
    if d.get("failure_reason"):
        parts.append(f"Failure: {d['failure_reason']}")
    return " | ".join(parts)


def _chunk_sales_handoff(row: SalesHandoffRecord) -> str:
    parts = [
        f"Sales Handoff: {row.account_domain} / contact {row.contact_id}",
        f"Status: {row.status} | Engagement score: {row.engagement_score}",
    ]
    if row.status == "ACCEPTED" and row.accepted_by:
        parts.append(f"Accepted by: {row.accepted_by}")
    return " | ".join(parts)


def _chunk_master_context(row: MasterContextRecord) -> str:
    d = row.data or {}
    parts = [f"Master Context v{row.version} for client {row.client_id}"]
    if d.get("company_name"):
        parts.append(f"Company: {d['company_name']}")
    if d.get("target_industries"):
        parts.append(f"Target industries: {', '.join(d['target_industries'][:5])}")
    if d.get("icp_description"):
        parts.append(f"ICP: {str(d['icp_description'])[:200]}")
    if d.get("competitors"):
        comps = d["competitors"]
        if isinstance(comps, list):
            parts.append(f"Competitors: {', '.join(str(c) for c in comps[:5])}")
    if d.get("value_proposition"):
        parts.append(f"Value prop: {str(d['value_proposition'])[:200]}")
    return " | ".join(parts)


def _chunk_cp3_feedback(row: CP3ClientFeedbackRecord) -> str:
    parts = [
        f"Client feedback on message {row.message_id}",
        f"Sentiment: {row.sentiment} | Resolved: {row.resolved}",
        f"Feedback: {row.feedback_text[:300]}",
    ]
    if row.resolution_notes:
        parts.append(f"Resolution: {row.resolution_notes[:150]}")
    return " | ".join(parts)


# ---------------------------------------------------------------------------
# Core upsert
# ---------------------------------------------------------------------------

def upsert_chunk(
    db: Session,
    client_id: str,
    source_table: str,
    source_id: str,
    text_chunk: str,
    embed: bool = True,
) -> None:
    """Insert or update one RAG index row. Skips embedding if unavailable."""
    from sqlalchemy.exc import IntegrityError

    embedding_str: Optional[str] = None
    if embed:
        try:
            from backend.services.embedder import embed as _embed, serialize
            embedding_str = serialize(_embed(text_chunk))
        except Exception as exc:  # noqa: BLE001
            log.warning("Embedding skipped (%s) — keyword search still works.", exc)

    existing = (
        db.query(RagIndexRecord)
        .filter(
            RagIndexRecord.source_table == source_table,
            RagIndexRecord.source_id == source_id,
        )
        .first()
    )
    if existing:
        existing.text_chunk = text_chunk
        if embedding_str:
            existing.embedding = embedding_str
        from datetime import datetime, timezone
        existing.indexed_at = datetime.now(tz=timezone.utc)
    else:
        db.add(RagIndexRecord(
            client_id=client_id,
            source_table=source_table,
            source_id=source_id,
            text_chunk=text_chunk,
            embedding=embedding_str,
        ))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()


# ---------------------------------------------------------------------------
# Per-table indexers
# ---------------------------------------------------------------------------

def index_icp_accounts(db: Session, client_id: str) -> int:
    rows = db.query(ICPAccountRecord).filter(ICPAccountRecord.client_id == client_id).all()
    for row in rows:
        upsert_chunk(db, client_id, "icp_accounts", row.id, _chunk_icp_account(row))
    return len(rows)


def index_buyer_profiles(db: Session, client_id: str) -> int:
    rows = db.query(BuyerProfileRecord).filter(BuyerProfileRecord.client_id == client_id).all()
    for row in rows:
        upsert_chunk(db, client_id, "buyer_profiles", row.id, _chunk_buyer_profile(row))
    return len(rows)


def index_signal_reports(db: Session, client_id: str) -> int:
    rows = db.query(SignalReportRecord).filter(SignalReportRecord.client_id == client_id).all()
    for row in rows:
        upsert_chunk(db, client_id, "signal_reports", row.id, _chunk_signal_report(row))
    return len(rows)


def index_messages(db: Session, client_id: str) -> int:
    rows = db.query(MessageRecord).filter(MessageRecord.client_id == client_id).all()
    for row in rows:
        upsert_chunk(db, client_id, "messages", row.id, _chunk_message(row))
    return len(rows)


def index_verification_results(db: Session, client_id: str) -> int:
    rows = db.query(VerificationResultRecord).filter(VerificationResultRecord.client_id == client_id).all()
    for row in rows:
        upsert_chunk(db, client_id, "verification_results", row.id, _chunk_verification_result(row))
    return len(rows)


def index_sales_handoffs(db: Session, client_id: str) -> int:
    rows = db.query(SalesHandoffRecord).filter(SalesHandoffRecord.client_id == client_id).all()
    for row in rows:
        upsert_chunk(db, client_id, "sales_handoffs", row.id, _chunk_sales_handoff(row))
    return len(rows)


def index_master_contexts(db: Session, client_id: str) -> int:
    rows = db.query(MasterContextRecord).filter(MasterContextRecord.client_id == client_id).all()
    for row in rows:
        upsert_chunk(db, client_id, "master_contexts", row.id, _chunk_master_context(row))
    return len(rows)


def index_cp3_feedback(db: Session, client_id: str) -> int:
    from backend.db.models import CP3ReviewStateRecord
    state = db.query(CP3ReviewStateRecord).filter(CP3ReviewStateRecord.client_id == client_id).first()
    if not state:
        return 0
    rows = db.query(CP3ClientFeedbackRecord).filter(CP3ClientFeedbackRecord.cp3_state_id == state.id).all()
    for row in rows:
        upsert_chunk(db, client_id, "cp3_client_feedback", row.id, _chunk_cp3_feedback(row))
    return len(rows)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def index_client(db: Session, client_id: str) -> dict:
    """Full re-index of all tables for one client. Returns counts per table."""
    counts = {
        "icp_accounts": index_icp_accounts(db, client_id),
        "buyer_profiles": index_buyer_profiles(db, client_id),
        "signal_reports": index_signal_reports(db, client_id),
        "messages": index_messages(db, client_id),
        "verification_results": index_verification_results(db, client_id),
        "sales_handoffs": index_sales_handoffs(db, client_id),
        "master_contexts": index_master_contexts(db, client_id),
        "cp3_client_feedback": index_cp3_feedback(db, client_id),
    }
    total = sum(counts.values())
    log.info("RAG re-index complete for %s: %d docs", client_id, total)
    return counts


def post_run_index(db: Session, client_id: str, tables: List[str]) -> None:
    """
    Lightweight post-run hook — only re-indexes the tables that changed.
    Pass the list of table names that the agent just wrote to.

    Usage in agent run completion:
        from backend.agents.copilot.rag_indexer import post_run_index
        post_run_index(db, client_id, ["icp_accounts"])
    """
    _table_fn = {
        "icp_accounts": index_icp_accounts,
        "buyer_profiles": index_buyer_profiles,
        "signal_reports": index_signal_reports,
        "messages": index_messages,
        "verification_results": index_verification_results,
        "sales_handoffs": index_sales_handoffs,
        "master_contexts": index_master_contexts,
        "cp3_client_feedback": index_cp3_feedback,
    }
    for table in tables:
        fn = _table_fn.get(table)
        if fn:
            try:
                count = fn(db, client_id)
                log.debug("post_run_index: %s → %d docs indexed", table, count)
            except Exception as exc:  # noqa: BLE001
                log.warning("post_run_index failed for %s/%s: %s", client_id, table, exc)
