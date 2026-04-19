"""
rag/chat.py — Step 4
=====================
RAG: retrieve relevant chunks, build a prompt, call Claude, return the answer.

Public functions:
  ask(query, top_k, model_key)  — single-model RAG answer
  compare(query, top_k)         — run ask() for all models concurrently,
                                  return {model_key: result} for side-by-side comparison

Run directly:
  python -m rag.chat "Qu'est-ce que Nanocorp ?"
  python -m rag.chat "Qu'est-ce que Nanocorp ?" --top 3
  python -m rag.chat "Qu'est-ce que Nanocorp ?" --model multilingual
"""

import anthropic

from rag.config import ANTHROPIC_API_KEY, ANTHROPIC_MODEL, DEFAULT_MODEL_KEY, EMBED_MODELS, TOP_K
from rag.search import format_context, semantic_search

# ── Prompt ────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """\
Tu es un assistant qui répond à des questions sur des épisodes de podcast.

Règles strictes :
- Réponds UNIQUEMENT à partir des extraits fournis ci-dessous.
- Si la réponse ne se trouve pas dans les extraits, dis-le clairement.
- Cite toujours le titre de l'épisode source entre guillemets.
- Réponds en français.
"""


def build_prompt(query: str, context: str) -> str:
    return f"""\
Extraits de transcriptions :

{context}

---
Question : {query}
"""


# ── RAG call ──────────────────────────────────────────────────────────────────

def ask(query: str, top_k: int = TOP_K, model_key: str = DEFAULT_MODEL_KEY) -> dict:
    """
    Full RAG pipeline for one question using the given embedding model.

    Returns:
      {
        "answer":    str,
        "sources":   list[dict],   # deduplicated episodes cited
        "chunks":    list[dict],   # raw retrieved chunks with distances
        "model_key": str,          # which embedding model was used
      }
    """
    if not ANTHROPIC_API_KEY:
        raise RuntimeError(
            "ANTHROPIC_API_KEY is not set. Create a .env file: cp .env.example .env"
        )

    results      = semantic_search(query, top_k=top_k, model_key=model_key)
    context      = format_context(results)
    user_message = build_prompt(query, context)

    client   = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    response = client.messages.create(
        model      = ANTHROPIC_MODEL,
        max_tokens = 1024,
        system     = SYSTEM_PROMPT,
        messages   = [{"role": "user", "content": user_message}],
    )

    return {
        "answer":    response.content[0].text,
        "sources":   _unique_sources(results),
        "chunks":    results,
        "model_key": model_key,
    }


def compare(query: str, top_k: int = TOP_K) -> dict[str, dict]:
    """
    Run ask() for every configured embedding model concurrently.

    Both searches + LLM calls run in parallel threads (ThreadPoolExecutor)
    since ask() is I/O-bound (Anthropic API). The caller wraps this in
    asyncio.to_thread() so the event loop is not blocked.

    Returns {model_key: ask_result} for each model.
    If one model's call fails, its exception propagates immediately.
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    results: dict[str, dict] = {}

    with ThreadPoolExecutor(max_workers=len(EMBED_MODELS)) as pool:
        futures = {pool.submit(ask, query, top_k, key): key for key in EMBED_MODELS}
        for future in as_completed(futures):
            key = futures[future]
            results[key] = future.result()

    return results


def _unique_sources(results: list[dict]) -> list[dict]:
    """Deduplicate sources by episode title."""
    seen   = set()
    unique = []
    for r in results:
        key = r["title"]
        if key not in seen:
            seen.add(key)
            unique.append({"title": r["title"], "podcast": r["podcast"], "date": r["date"]})
    return unique


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    args      = sys.argv[1:]
    top_k     = TOP_K
    model_key = DEFAULT_MODEL_KEY

    if "--top" in args:
        i     = args.index("--top")
        top_k = int(args[i + 1])
        args  = args[:i] + args[i + 2:]

    if "--model" in args:
        i         = args.index("--model")
        model_key = args[i + 1]
        args      = args[:i] + args[i + 2:]

    query = " ".join(args) if args else "Qu'est-ce que Nanocorp ?"

    print(f"Question : {query!r}  (model={model_key!r})\n")

    result = ask(query, top_k=top_k, model_key=model_key)

    print("Réponse :")
    print(result["answer"])
    print("\nSources :")
    for s in result["sources"]:
        date = s["date"] or "sans date"
        print(f"  — {s['title']}  ({date})")
