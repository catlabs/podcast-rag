"""
rag/embed.py
============
Central registry for embedding models and ChromaDB collections.

One (SentenceTransformer, chromadb.Collection) pair is cached per model_key.
All modules that need to embed or query vectors import from here instead of
maintaining their own module-level singletons.

Usage:
    from rag.embed import get_model, get_collection, MODEL_KEYS
    model      = get_model("minilm")
    collection = get_collection("multilingual")
"""

from __future__ import annotations

import chromadb
from sentence_transformers import SentenceTransformer

from rag.config import CHROMA_DIR, COLLECTIONS, DEFAULT_MODEL_KEY, EMBED_MODELS

# ── Internal caches ───────────────────────────────────────────────────────────

_models:      dict[str, SentenceTransformer]  = {}
_collections: dict[str, chromadb.Collection]  = {}
_client:      chromadb.PersistentClient | None = None

# Public list of valid model keys — import this instead of config to avoid
# coupling callers to the config module structure.
MODEL_KEYS: list[str] = list(EMBED_MODELS.keys())


# ── Client (shared across all keys) ──────────────────────────────────────────

def _get_client() -> chromadb.PersistentClient:
    global _client
    if _client is None:
        CHROMA_DIR.mkdir(parents=True, exist_ok=True)
        _client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    return _client


# ── Public accessors ──────────────────────────────────────────────────────────

def get_model(model_key: str = DEFAULT_MODEL_KEY) -> SentenceTransformer:
    """Return (and cache) the SentenceTransformer for model_key."""
    if model_key not in EMBED_MODELS:
        raise ValueError(f"Unknown model_key {model_key!r}. Valid keys: {MODEL_KEYS}")
    if model_key not in _models:
        name = EMBED_MODELS[model_key]
        print(f"Loading embedding model '{name}' (key={model_key!r})...")
        _models[model_key] = SentenceTransformer(name)
        print(f"  Model '{model_key}' ready.")
    return _models[model_key]


def get_collection(model_key: str = DEFAULT_MODEL_KEY) -> chromadb.Collection:
    """Return (and cache) the ChromaDB collection for model_key."""
    if model_key not in COLLECTIONS:
        raise ValueError(f"Unknown model_key {model_key!r}. Valid keys: {MODEL_KEYS}")
    if model_key not in _collections:
        col_name = COLLECTIONS[model_key]
        _collections[model_key] = _get_client().get_or_create_collection(col_name)
    return _collections[model_key]
