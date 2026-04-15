"""
rag/api.py — Step 5
====================
FastAPI layer: three endpoints that expose the RAG pipeline over HTTP.

  POST /ingest     trigger ingestion of output/ transcripts
  GET  /episodes   list all indexed episodes from SQLite
  POST /chat       ask a question, get a grounded answer + sources

The heavy work (embedding, LLM call) all lives in the modules below.
This file only wires HTTP in/out — no business logic here.

Run:
  uvicorn rag.api:app --reload
"""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from rag.chat import ask
from rag.config import ANTHROPIC_API_KEY, TOP_K
from rag.database import get_connection, init_db, list_episodes
from rag.ingest import ingest_all


# ── Startup ───────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Runs once when the server starts.
    Creates the SQLite table if it doesn't exist yet — safe to call every time.
    """
    conn = get_connection()
    init_db(conn)
    conn.close()
    yield   # server runs here


app = FastAPI(title="Podcast RAG", lifespan=lifespan)


# ── Request / Response models ─────────────────────────────────────────────────

class ChatRequest(BaseModel):
    query: str
    top_k: int = TOP_K


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.post("/ingest")
async def ingest_endpoint(reindex: bool = False):
    """
    Walk output/ and index any new transcripts into ChromaDB + SQLite.

    ?reindex=true forces re-embedding of already-indexed files.

    ingest_all() is CPU-bound (embedding), so we run it in a thread
    to avoid blocking the async event loop.
    """
    result = await asyncio.to_thread(ingest_all, reindex=reindex)
    return result


@app.get("/episodes")
async def episodes_endpoint():
    """
    Return all indexed episodes from SQLite, sorted by podcast then date.
    Pure SQL read — fast, no embedding involved.
    """
    conn = get_connection()
    try:
        return list_episodes(conn)
    finally:
        conn.close()


@app.post("/chat")
async def chat_endpoint(body: ChatRequest):
    """
    Semantic search + Claude answer for a given question.

    ask() is I/O-bound (Anthropic API call) and uses the synchronous SDK,
    so we run it in a thread just like ingest.
    """
    if not ANTHROPIC_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY is not configured. Add it to your .env file.",
        )

    result = await asyncio.to_thread(ask, body.query, body.top_k)
    return result
