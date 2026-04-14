"""
rag/config.py
=============
All configuration in one place.
Import from here in every other module — never hardcode paths elsewhere.
"""

from pathlib import Path

# ── Paths ─────────────────────────────────────────────────────────────────────

BASE_DIR   = Path(__file__).parent.parent   # podcast-parser/
OUTPUT_DIR = BASE_DIR / "output"            # where transcripts live
DATA_DIR   = BASE_DIR / "rag" / "data"      # created at runtime; gitignored
CHROMA_DIR = DATA_DIR / "chroma"            # ChromaDB persistence
DB_PATH    = DATA_DIR / "metadata.db"       # SQLite episode metadata

# ── Embedding ─────────────────────────────────────────────────────────────────

EMBED_MODEL    = "all-MiniLM-L6-v2"
COLLECTION     = "podcasts"

# ── Chunking ──────────────────────────────────────────────────────────────────

CHUNK_SIZE    = 300   # words per chunk (~400 tokens)
CHUNK_OVERLAP = 60    # words of overlap between consecutive chunks

# ── Search ────────────────────────────────────────────────────────────────────

TOP_K = 5   # default number of results to retrieve
