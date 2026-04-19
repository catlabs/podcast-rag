"""
rag/config.py
=============
All configuration in one place.
Import from here in every other module — never hardcode paths elsewhere.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()   # reads .env if present; no-op if not

# ── Paths ─────────────────────────────────────────────────────────────────────

BASE_DIR   = Path(__file__).parent.parent   # podcast-parser/
OUTPUT_DIR = BASE_DIR / "output"            # where transcripts live
DATA_DIR   = BASE_DIR / "rag" / "data"      # created at runtime; gitignored
CHROMA_DIR = DATA_DIR / "chroma"            # ChromaDB persistence
DB_PATH    = DATA_DIR / "metadata.db"       # SQLite episode metadata

# ── Embedding ─────────────────────────────────────────────────────────────────

EMBED_MODEL    = "all-MiniLM-L6-v2"   # kept for backward compat
COLLECTION     = "podcasts"            # kept for backward compat

# Multi-model registry — key → HuggingFace model name
EMBED_MODELS: dict[str, str] = {
    "minilm":        "all-MiniLM-L6-v2",
    "multilingual":  "paraphrase-multilingual-MiniLM-L12-v2",
}
COLLECTIONS: dict[str, str] = {
    "minilm":        "podcasts",               # existing collection — no migration needed
    "multilingual":  "podcasts_multilingual",  # new
}
DEFAULT_MODEL_KEY = "minilm"

# ── Chunking ──────────────────────────────────────────────────────────────────

CHUNK_SIZE    = 150   # words per chunk (~400 tokens)
CHUNK_OVERLAP = 30    # words of overlap between consecutive chunks

# ── Search ────────────────────────────────────────────────────────────────────

TOP_K = 5   # default number of results to retrieve

# ── LLM ───────────────────────────────────────────────────────────────────────

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL   = "claude-sonnet-4-5"
