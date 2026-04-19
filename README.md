# Podcast RAG

A local Retrieval-Augmented Generation (RAG) system for podcast transcripts.
Transcribe episodes with Whisper, index them into a vector store, and ask questions
that get answered by Claude — grounded in what the podcasts actually said.

Built as a learning and portfolio project in Python + React, focusing on clean,
modular design and real-world AI system concepts.

---

## What it does

1. **Transcription** — download audio from any RSS feed and transcribe it locally
   with [Whisper](https://github.com/openai/whisper).

2. **Indexing** — chunk transcripts into overlapping windows, embed them with
   [`all-MiniLM-L6-v2`](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
   (384-dim, runs on CPU), and store vectors in [ChromaDB](https://www.trychroma.com/).
   Episode metadata (podcast, title, date, chunk count) is kept in SQLite.

3. **Semantic search** — query the vector store to retrieve the most relevant
   transcript excerpts for any question.

4. **Chat** — feed the retrieved excerpts to [Claude](https://www.anthropic.com/claude)
   as context, get a grounded answer that cites specific episodes.

5. **Web UI** — a React + TypeScript interface for browsing indexed episodes,
   ingesting new ones (local files or RSS feed), and chatting.

---

## Architecture

```
transcribe.py          RSS → audio download → Whisper → .txt files
rag/
  config.py            centralized constants and env variables
  ingest.py            chunk + embed → ChromaDB; upsert → SQLite
  database.py          SQLite: episode metadata (podcast, title, date, chunks)
  search.py            semantic_search(): embed query → ChromaDB nearest neighbours
  chat.py              ask(): search → Claude prompt → answer + cited sources
  rss.py               RSS feed parsing + per-episode ingestion pipeline
  api.py               FastAPI: /episodes /ingest /feed /ingest/rss /chat
ui/
  src/
    api.ts             typed fetch client + SSE stream helper
    components/
      EpisodeList.tsx  table of indexed episodes
      ChatPanel.tsx    semantic search + Claude Q&A
      RssIngest.tsx    RSS feed browser + live ingestion progress
      IngestButton.tsx local .txt file indexer
```

Two stores, complementary roles:
- **ChromaDB** — fast nearest-neighbour vector search
- **SQLite** — list / filter / count episodes (ChromaDB is bad at this)

---

## Prerequisites

- Python 3.10+ (3.11 recommended)
- Node 18+
- `ffmpeg` in your `PATH` (required by Whisper)

```bash
python --version && ffmpeg -version && node --version
```

macOS (Homebrew):

```bash
brew install ffmpeg
```

---

## Setup

### Backend

```bash
python3 -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install --upgrade pip
pip install feedparser requests openai-whisper sentence-transformers \
            chromadb fastapi uvicorn python-dotenv anthropic
```

Copy the environment file and add your Anthropic API key:

```bash
cp .env.example .env
# edit .env and set ANTHROPIC_API_KEY=sk-ant-...
```

### Frontend

```bash
cd ui
npm install
```

---

## Running

Start both servers (two terminals):

```bash
# terminal 1 — API
source .venv/bin/activate
uvicorn rag.api:app --reload

# terminal 2 — UI dev server
cd ui && npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Usage

### Web UI

| Tab | What it does |
|-----|-------------|
| **Episodes** | Browse all indexed episodes |
| **Chat** | Ask a question; see Claude's answer + cited sources + raw retrieved chunks |
| **RSS** | Paste a feed URL, select episodes, watch live download → transcribe → index progress |
| **Local** | Index `.txt` transcript files already in `output/` |

### CLI — transcribe a feed

```bash
python transcribe.py --rss "https://example.com/podcast/feed.xml"
```

Options:
- `--model` — Whisper model (`tiny`, `base`, `small`, `medium`, `large`; default `medium`)
- `--limit` — number of episodes shown in the selection list (default `10`)

### CLI — ingest local transcripts

```bash
python -m rag.ingest              # index new files in output/
python -m rag.ingest --reindex    # re-embed everything
```

### CLI — search without the UI

```bash
python -m rag.search "your question here"
```

---

## Output layout

```
output/
  Podcast Name/
    YYYY-MM-DD_episode_title.mp3
    YYYY-MM-DD_episode_title.txt
rag/data/
  chroma/     ChromaDB vector store
  episodes.db SQLite metadata
```

---

## Troubleshooting

- **No audio URL found** — some RSS entries have no enclosure link; nothing to download.
- **Whisper errors** — confirm `ffmpeg` is installed; try `--model tiny` for speed.
- **Slow first run** — Whisper and the embedding model download on first use (~500 MB total for `medium`).
- **ANTHROPIC_API_KEY not set** — the `/chat` endpoint returns 503 until the key is configured in `.env`.
