"""
rag/chat.py — Step 4
=====================
RAG: retrieve relevant chunks, build a prompt, call Claude, return the answer.

This is where the two previous steps connect:
  search.semantic_search()  →  finds the most relevant transcript excerpts
  search.format_context()   →  shapes them into a readable block
  anthropic.messages.create →  generates an answer grounded in that context

The model is instructed to answer ONLY from the provided excerpts and to cite
episode titles — so the answer is traceable back to the source audio.

Run directly:
  python -m rag.chat "Qu'est-ce que Nanocorp ?"
  python -m rag.chat "Qu'est-ce que Nanocorp ?" --top 3
"""

import anthropic

from rag.config import ANTHROPIC_API_KEY, ANTHROPIC_MODEL, TOP_K
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

def ask(query: str, top_k: int = TOP_K) -> dict:
    """
    Full RAG pipeline for one question:
      1. semantic_search  — find the top_k most relevant chunks
      2. format_context   — assemble them into a readable block
      3. build_prompt     — wrap context + question into the user message
      4. Claude API call  — generate a grounded answer
      5. return           — answer text + source list

    Returns:
      {
        "answer":  str,          # Claude's response
        "sources": list[dict],   # the chunks used, each with title/date/distance
      }
    """
    if not ANTHROPIC_API_KEY:
        raise RuntimeError(
            "ANTHROPIC_API_KEY is not set. Create a .env file: cp .env.example .env"
        )

    # Step 1 & 2 — retrieve and format
    results = semantic_search(query, top_k=top_k)
    context = format_context(results)

    # Step 3 — build the user message
    user_message = build_prompt(query, context)

    # Step 4 — call Claude
    client   = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    response = client.messages.create(
        model      = ANTHROPIC_MODEL,
        max_tokens = 1024,
        system     = SYSTEM_PROMPT,
        messages   = [{"role": "user", "content": user_message}],
    )

    # Step 5 — return answer + deduplicated source list
    sources = _unique_sources(results)

    return {
        "answer":  response.content[0].text,
        "sources": sources,
    }


def _unique_sources(results: list[dict]) -> list[dict]:
    """
    Deduplicate sources by episode title.
    Multiple chunks from the same episode collapse into one source entry.
    """
    seen   = set()
    unique = []
    for r in results:
        key = r["title"]
        if key not in seen:
            seen.add(key)
            unique.append({
                "title":   r["title"],
                "podcast": r["podcast"],
                "date":    r["date"],
            })
    return unique


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    args  = sys.argv[1:]
    top_k = TOP_K

    if "--top" in args:
        i     = args.index("--top")
        top_k = int(args[i + 1])
        args  = args[:i] + args[i + 2:]

    query = " ".join(args) if args else "Qu'est-ce que Nanocorp ?"

    print(f"Question : {query!r}\n")

    result = ask(query, top_k=top_k)

    print("Réponse :")
    print(result["answer"])
    print("\nSources :")
    for s in result["sources"]:
        date = s["date"] or "sans date"
        print(f"  — {s['title']}  ({date})")
