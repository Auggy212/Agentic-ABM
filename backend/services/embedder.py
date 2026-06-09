"""
Local embedding service using sentence-transformers.

Model: all-MiniLM-L6-v2  (22 MB, 384-dim, Apache-2 licence)
Loaded once at first call and cached for the process lifetime.
No API key, no per-query cost.
"""

from __future__ import annotations

import json
import math
from functools import lru_cache
from typing import List

_MODEL_NAME = "all-MiniLM-L6-v2"


@lru_cache(maxsize=1)
def _model():
    try:
        from sentence_transformers import SentenceTransformer  # type: ignore
        return SentenceTransformer(_MODEL_NAME)
    except ImportError as exc:
        raise RuntimeError(
            "sentence-transformers is not installed. "
            "Run: pip install sentence-transformers"
        ) from exc


def embed(text: str) -> List[float]:
    """Return a 384-dim embedding for the given text."""
    model = _model()
    vec = model.encode(text, normalize_embeddings=True)
    return vec.tolist()


def embed_batch(texts: List[str]) -> List[List[float]]:
    """Embed a list of texts in one forward pass (faster than one-by-one)."""
    model = _model()
    vecs = model.encode(texts, normalize_embeddings=True, batch_size=32, show_progress_bar=False)
    return [v.tolist() for v in vecs]


def serialize(vec: List[float]) -> str:
    """Store embedding as compact JSON string."""
    return json.dumps(vec)


def deserialize(s: str) -> List[float]:
    return json.loads(s)


def cosine_similarity(a: List[float], b: List[float]) -> float:
    """Cosine similarity between two already-normalised vectors."""
    dot = sum(x * y for x, y in zip(a, b))
    # Both are L2-normalised by sentence-transformers so ||a||=||b||=1
    # but clamp to [-1, 1] to guard against float rounding
    return max(-1.0, min(1.0, dot))


def cosine_similarity_bulk(query_vec: List[float], rows: list) -> List[tuple]:
    """
    Score a list of (id, embedding_str) tuples against query_vec.
    Returns list of (id, score) sorted descending.
    """
    scored = []
    for row_id, emb_str in rows:
        if not emb_str:
            continue
        try:
            vec = deserialize(emb_str)
            score = cosine_similarity(query_vec, vec)
            scored.append((row_id, score))
        except Exception:  # noqa: BLE001
            continue
    scored.sort(key=lambda x: x[1], reverse=True)
    return scored
