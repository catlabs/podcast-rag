"""
rag/ingest.py — Step 1
=======================
Index all transcripts from output/ into ChromaDB.

What's new vs step0_explore.py:
  - handles every transcript, not just one
  - loads the embedding model ONCE and reuses it across all files
  - parses podcast name, date, title from the file path
  - stores metadata alongside each chunk (for display at search time)
  - idempotent: re-running upserts the same data, nothing breaks

Run directly:
    python -m rag.ingest
"""

import hashlib
import re
from pathlib import Path

import chromadb
from sentence_transformers import SentenceTransformer

from rag.config import (
    CHUNK_OVERLAP,
    CHUNK_SIZE,
    CHROMA_DIR,
    COLLECTION,
    EMBED_MODEL,
    OUTPUT_DIR,
)

# ── Module-level singletons ───────────────────────────────────────────────────
# These are initialized on first use, then reused.
# Avoids the Step 0 problem of loading the model once per file/query.

_model: SentenceTransformer | None = None
_collection: chromadb.Collection | None = None


def get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        print(f"Loading embedding model '{EMBED_MODEL}'...")
        _model = SentenceTransformer(EMBED_MODEL)
        print("  Model ready.\n")
    return _model


def get_collection() -> chromadb.Collection:
    global _collection
    if _collection is None:
        CHROMA_DIR.mkdir(parents=True, exist_ok=True)
        client = chromadb.PersistentClient(path=str(CHROMA_DIR))
        _collection = client.get_or_create_collection(COLLECTION)
    return _collection


# ── Parsing ───────────────────────────────────────────────────────────────────

def parse_transcript_path(path: Path) -> dict:
    """
    Extract podcast name, date, and title from a transcript file path.

    Two layouts exist in output/:
      output/<Podcast Name>/YYYY-MM-DD_<title>.txt   ← dated, inside folder
      output/<title>.txt                             ← stray, no date

    The March 24 episode has a double underscore (YYYY-MM-DD__title),
    so we strip leading underscores from the parsed title.
    """
    stem = path.stem

    # Is this inside a podcast subfolder, or directly in output/?
    podcast = path.parent.name if path.parent != OUTPUT_DIR else "unknown"

    # Does the filename start with a date?
    match = re.match(r"^(\d{4}-\d{2}-\d{2})_+(.+)$", stem)
    if match:
        date  = match.group(1)
        title = match.group(2)
    else:
        date  = None
        title = stem

    return {"podcast": podcast, "date": date, "title": title}


# ── Chunking ──────────────────────────────────────────────────────────────────

def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """
    Sliding window over words.  Simple and dependency-free.
    See step0_explore.py for the rationale on size and overlap.
    """
    words = text.split()
    step  = chunk_size - overlap
    chunks = [
        " ".join(words[i : i + chunk_size])
        for i in range(0, len(words) - chunk_size + 1, step)
    ]
    # include the remaining words as a final (possibly shorter) chunk
    remainder_start = ((len(words) - chunk_size) // step + 1) * step
    if remainder_start < len(words):
        chunks.append(" ".join(words[remainder_start:]))
    return chunks


def _chunk_id(path: Path, i: int) -> str:
    """
    Stable, unique ID for a chunk.
    SHA-1 of (file path, chunk index) → first 16 hex chars.
    Stable means re-indexing the same file produces the same IDs,
    so ChromaDB's upsert overwrites rather than duplicates.
    """
    return hashlib.sha1(f"{path}|{i}".encode()).hexdigest()[:16]


# ── Per-file pipeline ─────────────────────────────────────────────────────────

def ingest_file(path: Path) -> int:
    """
    Full pipeline for a single transcript:
      read → parse metadata → chunk → embed → upsert into ChromaDB

    Returns the number of chunks indexed.
    """
    meta   = parse_transcript_path(path)
    text   = path.read_text()
    chunks = chunk_text(text)

    model      = get_model()
    collection = get_collection()

    embeddings = model.encode(chunks, show_progress_bar=False)

    collection.upsert(
        ids        = [_chunk_id(path, i) for i in range(len(chunks))],
        documents  = chunks,
        embeddings = embeddings.tolist(),
        metadatas  = [
            {
                "podcast":     meta["podcast"],
                "date":        meta["date"] or "",   # ChromaDB requires strings
                "title":       meta["title"],
                "chunk_index": i,
            }
            for i in range(len(chunks))
        ],
    )
    return len(chunks)


# ── Full ingestion run ────────────────────────────────────────────────────────

def ingest_all(output_dir: Path = OUTPUT_DIR) -> dict:
    """
    Walk output_dir, find every .txt file, and index it.
    Returns a summary: {"indexed": [...], "errors": [...]}.
    """
    txt_files = sorted(output_dir.rglob("*.txt"))

    if not txt_files:
        print(f"No .txt files found in {output_dir}")
        return {"indexed": [], "errors": []}

    print(f"Found {len(txt_files)} transcript(s)\n")

    results: dict = {"indexed": [], "errors": []}

    for path in txt_files:
        try:
            n = ingest_file(path)
            results["indexed"].append({"file": path.name, "chunks": n})
            print(f"  ✓  {path.name!r}  →  {n} chunks")
        except Exception as exc:
            results["errors"].append({"file": path.name, "error": str(exc)})
            print(f"  ✗  {path.name!r}  →  ERROR: {exc}")

    total_chunks = sum(r["chunks"] for r in results["indexed"])
    print(f"\nDone. {len(results['indexed'])} files indexed, "
          f"{total_chunks} total chunks, "
          f"{len(results['errors'])} error(s).")
    return results


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    ingest_all()
