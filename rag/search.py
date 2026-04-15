"""
rag/search.py — Step 3
=======================
Semantic search over the indexed transcripts.

Two public functions:
  semantic_search(query, top_k) -> list[dict]   — find the most relevant chunks
  format_context(results)       -> str          — shape them into an LLM prompt block

Run directly to try a query:
  python -m rag.search "votre question"
  python -m rag.search "Nanocorp" --top 3
"""

import chromadb
from sentence_transformers import SentenceTransformer

from rag.config import CHROMA_DIR, COLLECTION, EMBED_MODEL, TOP_K

# ── Singletons ────────────────────────────────────────────────────────────────
# Same pattern as ingest.py: initialize once, reuse across calls.
# search.py is intentionally independent of ingest.py — no cross-import.

_model: SentenceTransformer | None = None
_collection: chromadb.Collection | None = None


def get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer(EMBED_MODEL)
    return _model


def get_collection() -> chromadb.Collection:
    global _collection
    if _collection is None:
        client = chromadb.PersistentClient(path=str(CHROMA_DIR))
        _collection = client.get_or_create_collection(COLLECTION)
    return _collection


# ── Search ────────────────────────────────────────────────────────────────────

def semantic_search(query: str, top_k: int = TOP_K) -> list[dict]:
    """
    Embed the query with the same model used at index time, then ask ChromaDB
    for the top_k nearest chunks by cosine distance.

    Returns a list of dicts, one per result:
      {
        "text":        str,    # the raw chunk content
        "podcast":     str,
        "title":       str,
        "date":        str | None,
        "chunk_index": int,    # position of this chunk within its episode
        "distance":    float,  # cosine distance — lower means more similar
      }

    Why return dicts instead of a dataclass?  Simple enough that dicts are
    fine; no behaviour to encapsulate, and JSON-serialisable out of the box
    (useful in Step 5 when the API returns sources alongside the answer).
    """
    query_vec = get_model().encode([query])

    raw = get_collection().query(
        query_embeddings=query_vec.tolist(),
        n_results=top_k,
    )

    # ChromaDB returns parallel lists — zip them into readable dicts
    return [
        {
            "text":        doc,
            "podcast":     meta["podcast"],
            "title":       meta["title"],
            "date":        meta["date"] or None,
            "chunk_index": meta["chunk_index"],
            "distance":    round(dist, 4),
        }
        for doc, meta, dist in zip(
            raw["documents"][0],
            raw["metadatas"][0],
            raw["distances"][0],
        )
    ]


# ── Context formatting ────────────────────────────────────────────────────────

def format_context(results: list[dict]) -> str:
    """
    Turn a list of search results into a formatted text block ready to be
    injected into an LLM prompt.

    Each chunk gets a header with the episode title and date so the model
    can cite sources in its answer.

    Example output:
        [Épisode : "Nanocorp..." — 2026-04-08]
        <chunk text>
        ---
        [Épisode : "Selfpressionnisme..." — 2026-03-05]
        <chunk text>
    """
    if not results:
        return "(Aucun extrait pertinent trouvé.)"

    blocks = []
    for r in results:
        date_part = f" — {r['date']}" if r["date"] else ""
        header    = f'[Épisode : "{r["title"]}"{date_part}]'
        blocks.append(f"{header}\n{r['text']}")

    return "\n---\n".join(blocks)


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    args  = sys.argv[1:]
    top_k = TOP_K

    # optional --top N flag
    if "--top" in args:
        i     = args.index("--top")
        top_k = int(args[i + 1])
        args  = args[:i] + args[i + 2:]

    query = " ".join(args) if args else "Qu'est-ce que Nanocorp ?"

    print(f"Query : {query!r}  (top {top_k})\n")

    results = semantic_search(query, top_k=top_k)

    for i, r in enumerate(results):
        date = r["date"] or "sans date"
        print(f"[{i + 1}]  distance={r['distance']}")
        print(f"      {r['podcast']}  —  {r['title']}  ({date})  chunk #{r['chunk_index']}")
        print(f"      {r['text'][:280]}…")
        print()

    print("─── format_context() output (sent to LLM in Step 4) ───\n")
    print(format_context(results))
