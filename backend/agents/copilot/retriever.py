"""
RAG retrieval layer — hybrid keyword + vector search.

Strategy:
  1. Keyword pass  — SQLite LIKE scan across text_chunk (fast, exact matches)
  2. Vector pass   — cosine similarity across all client embeddings (semantic)
  3. Fusion        — Reciprocal Rank Fusion (RRF) merges both ranked lists
  4. Return top-K  — deduped, formatted as context blocks for the LLM prompt

If sentence-transformers is not installed, falls back to keyword-only.
"""

from __future__ import annotations

import re
from typing import List, Optional

from sqlalchemy.orm import Session

from backend.db.models import RagIndexRecord

# Max documents to inject into the copilot prompt
TOP_K = 8
# RRF constant — controls how much low-ranked hits are penalised
RRF_K = 60


# ---------------------------------------------------------------------------
# Keyword search (BM25-lite via LIKE)
# ---------------------------------------------------------------------------

def _keyword_search(
    db: Session,
    client_id: str,
    query: str,
    limit: int = 20,
) -> List[RagIndexRecord]:
    """
    Rough keyword match: split the query into tokens, require at least one to
    appear in text_chunk. Returns rows ordered by match count descending.
    """
    tokens = [t.lower() for t in re.split(r"\W+", query) if len(t) > 2]
    if not tokens:
        return []

    rows = (
        db.query(RagIndexRecord)
        .filter(RagIndexRecord.client_id == client_id)
        .all()
    )

    scored: List[tuple] = []
    for row in rows:
        chunk_lower = row.text_chunk.lower()
        hits = sum(1 for t in tokens if t in chunk_lower)
        if hits:
            scored.append((hits, row))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [row for _, row in scored[:limit]]


# ---------------------------------------------------------------------------
# Vector search
# ---------------------------------------------------------------------------

def _vector_search(
    db: Session,
    client_id: str,
    query: str,
    limit: int = 20,
) -> List[RagIndexRecord]:
    """Cosine similarity search. Returns empty list if embedder unavailable."""
    try:
        from backend.services.embedder import embed, cosine_similarity_bulk
    except Exception:
        return []

    try:
        query_vec = embed(query)
    except Exception:
        return []

    rows = (
        db.query(RagIndexRecord)
        .filter(
            RagIndexRecord.client_id == client_id,
            RagIndexRecord.embedding.isnot(None),
        )
        .all()
    )
    id_to_row = {r.id: r for r in rows}
    pairs = [(r.id, r.embedding) for r in rows]
    scored = cosine_similarity_bulk(query_vec, pairs)  # [(id, score), ...]

    result: List[RagIndexRecord] = []
    for row_id, _score in scored[:limit]:
        row = id_to_row.get(row_id)
        if row:
            result.append(row)
    return result


# ---------------------------------------------------------------------------
# Reciprocal Rank Fusion
# ---------------------------------------------------------------------------

def _rrf_merge(
    keyword_results: List[RagIndexRecord],
    vector_results: List[RagIndexRecord],
    top_k: int = TOP_K,
) -> List[RagIndexRecord]:
    """
    Merge two ranked lists using RRF.
    score(d) = Σ 1/(k + rank(d))  where k=RRF_K and rank is 1-based.
    """
    scores: dict[str, float] = {}

    for rank, row in enumerate(keyword_results, start=1):
        scores[row.id] = scores.get(row.id, 0.0) + 1.0 / (RRF_K + rank)

    for rank, row in enumerate(vector_results, start=1):
        scores[row.id] = scores.get(row.id, 0.0) + 1.0 / (RRF_K + rank)

    # Build id→row map from both lists
    id_to_row: dict[str, RagIndexRecord] = {}
    for row in keyword_results + vector_results:
        id_to_row[row.id] = row

    ranked_ids = sorted(scores, key=lambda i: scores[i], reverse=True)
    return [id_to_row[i] for i in ranked_ids[:top_k] if i in id_to_row]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def retrieve(
    db: Session,
    client_id: str,
    query: str,
    top_k: int = TOP_K,
    source_filter: Optional[List[str]] = None,
) -> List[RagIndexRecord]:
    """
    Hybrid retrieval for the given query.

    Args:
        db: SQLAlchemy session
        client_id: scope to this client's data only
        query: natural language question from the operator
        top_k: number of documents to return
        source_filter: optional list of source_table names to restrict to
    """
    kw = _keyword_search(db, client_id, query, limit=20)
    vec = _vector_search(db, client_id, query, limit=20)

    if source_filter:
        kw = [r for r in kw if r.source_table in source_filter]
        vec = [r for r in vec if r.source_table in source_filter]

    merged = _rrf_merge(kw, vec, top_k=top_k)

    # If both searches produced nothing (empty index), return empty
    return merged


def format_context_block(rows: List[RagIndexRecord]) -> str:
    """
    Format retrieved documents into a compact context block for the LLM prompt.
    Each document is one line prefixed with its source table.
    """
    if not rows:
        return "(No relevant records found in the knowledge base.)"

    lines = []
    for i, row in enumerate(rows, start=1):
        label = row.source_table.replace("_", " ").title()
        lines.append(f"[{i}] {label}: {row.text_chunk}")
    return "\n".join(lines)
