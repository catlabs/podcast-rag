"""
Step 0 — RAG proof of concept
==============================
Goal: take one transcript, chunk it, embed it, store it in ChromaDB,
      and run a semantic search query. Nothing else.

Run:
    python step0_explore.py                    # index + demo queries
    python step0_explore.py "votre question"   # index + custom query
    python step0_explore.py --reindex "query"  # force re-index first
"""

import sys
from pathlib import Path

from sentence_transformers import SentenceTransformer
import chromadb

# ── Config ────────────────────────────────────────────────────────────────────
TRANSCRIPT = Path(
    "output/Comptoir IA 🎙️🧠🤖/"
    "2026-04-08_Oubliez Lovable, Nanocorp crée des entreprises automomes 🏭 !.txt"
)
CHROMA_DIR  = Path(".chroma_step0")   # ChromaDB persists here on disk
COLLECTION  = "step0"
EMBED_MODEL = "all-MiniLM-L6-v2"     # 80 MB, runs on CPU, handles French well

CHUNK_SIZE    = 300   # words per chunk  (~400 tokens, ~1.5 min of speech)
CHUNK_OVERLAP = 60    # words of overlap (~20% — keeps context at boundaries)


# ── Chunking ──────────────────────────────────────────────────────────────────

def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """
    Split text into overlapping windows of `chunk_size` words.

    Why words, not tokens?  No tokenizer dependency.  1 token ≈ 0.75 words
    for French/English prose, so 300 words ≈ 400 tokens — comfortably under
    the embedding model's 256-token limit (it truncates gracefully).

    Why overlap?  A sentence that straddles two chunk boundaries would be
    split in half.  60-word overlap means each boundary is covered by both
    the preceding and the following chunk.
    """
    words = text.split()
    step   = chunk_size - overlap
    chunks = [
        " ".join(words[i : i + chunk_size])
        for i in range(0, len(words) - chunk_size + 1, step)
    ]
    # include a final short chunk if there are leftover words
    remainder_start = ((len(words) - chunk_size) // step + 1) * step
    if remainder_start < len(words):
        chunks.append(" ".join(words[remainder_start:]))
    return chunks


# ── Index ─────────────────────────────────────────────────────────────────────

def build_index() -> chromadb.Collection:
    """Read the transcript, chunk it, embed it, and store it in ChromaDB."""

    print(f"Reading transcript: {TRANSCRIPT.name}")
    text = TRANSCRIPT.read_text()
    word_count = len(text.split())
    print(f"  {word_count:,} words")

    print(f"\nChunking  (size={CHUNK_SIZE} words, overlap={CHUNK_OVERLAP} words)...")
    chunks = chunk_text(text)
    print(f"  {len(chunks)} chunks")
    print(f"  First chunk preview: {chunks[0][:120]}...")

    print(f"\nLoading embedding model '{EMBED_MODEL}'")
    print("  (first run: downloads ~80 MB — subsequent runs use the cache)")
    model = SentenceTransformer(EMBED_MODEL)

    print("\nEmbedding all chunks...")
    embeddings = model.encode(chunks, show_progress_bar=True, batch_size=32)
    print(f"  Each chunk → vector of {embeddings.shape[1]} floats")

    print(f"\nStoring in ChromaDB at '{CHROMA_DIR}/'...")
    client     = chromadb.PersistentClient(path=str(CHROMA_DIR))
    collection = client.get_or_create_collection(COLLECTION)
    collection.upsert(
        ids        = [str(i) for i in range(len(chunks))],
        documents  = chunks,
        embeddings = embeddings.tolist(),
    )
    print(f"  Collection '{COLLECTION}' now holds {collection.count()} chunks")
    return collection


def load_collection() -> chromadb.Collection:
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    return client.get_or_create_collection(COLLECTION)


# ── Search ────────────────────────────────────────────────────────────────────

def search(query: str, top_k: int = 3) -> None:
    """
    Embed the query with the same model, then ask ChromaDB for the
    top-k most similar chunk vectors.  Print results with distance scores.

    Distance here is cosine distance: 0 = identical, 2 = opposite.
    Typical good matches are in the 0.3–0.7 range.
    """
    model      = SentenceTransformer(EMBED_MODEL)
    collection = load_collection()

    query_vec = model.encode([query])
    results   = collection.query(
        query_embeddings = query_vec.tolist(),
        n_results        = top_k,
    )

    print(f"\n{'─' * 60}")
    print(f"Query: {query!r}")
    print(f"{'─' * 60}")

    for i, (doc, dist) in enumerate(
        zip(results["documents"][0], results["distances"][0])
    ):
        preview = doc[:400] + "…" if len(doc) > 400 else doc
        print(f"\n[{i+1}] distance={dist:.4f}")
        print(preview)

    print()


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    args    = sys.argv[1:]
    reindex = "--reindex" in args
    queries = [a for a in args if a != "--reindex"]

    # Build the index if it doesn't exist yet (or --reindex was passed)
    if reindex or not CHROMA_DIR.exists():
        build_index()
    else:
        count = load_collection().count()
        print(f"Index already exists ({count} chunks). Use --reindex to rebuild.\n")

    # Run queries
    if not queries:
        queries = [
            "Qu'est-ce que Nanocorp ?",
            "entreprises existantes face à de grands changements technologiques",
        ]

    for q in queries:
        search(q)
