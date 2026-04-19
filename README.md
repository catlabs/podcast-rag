# Podcast RAG

A local Retrieval-Augmented Generation (RAG) system for podcast transcripts.
Transcribe episodes with Whisper, index them into a vector store, and chat with Claude — grounded in what the podcasts actually said.

Built as a learning and portfolio project in Python + React, focusing on clean, modular design and real-world AI system concepts.

---

## What it does

1. **Transcription** — download audio from RSS feeds, YouTube, or direct URLs and transcribe locally with [Whisper](https://github.com/openai/whisper).

2. **Indexing** — chunk transcripts into overlapping windows, embed them with two sentence-transformer models, and store vectors in [ChromaDB](https://www.trychroma.com/). Episode metadata is kept in SQLite.

3. **Semantic search** — query the vector store to retrieve the most relevant transcript excerpts for any question.

4. **Chat** — feed the retrieved excerpts to [Claude](https://www.anthropic.com/claude) as context; get a grounded answer that cites specific episodes.

5. **Compare mode** — run the same query through both embedding models simultaneously and see results side by side.

6. **Web UI** — React + TypeScript interface with a ChatGPT-style sidebar layout for browsing episodes, ingesting new sources, and chatting.

---

## Architecture

```
transcribe.py            RSS → audio download → Whisper → .txt files
rag/
  config.py              constants, env variables, model registry
  embed.py               central model/collection registry (lazy-loaded, shared ChromaDB client)
  ingest.py              chunk + embed → ChromaDB (all models); upsert → SQLite
  database.py            SQLite: episodes + episode_models tables
  search.py              semantic_search(query, model_key) → nearest neighbours
  chat.py                ask() + compare() → Claude answer + cited sources
  rss.py                 RSS feed parsing + per-episode ingestion pipeline
  source.py              URL type detection (rss / youtube / audio / webpage)
  yt.py                  YouTube download via yt-dlp + ingest pipeline
  backfill.py            backfill existing episodes into the multilingual collection
  api.py                 FastAPI: all HTTP endpoints + SSE streaming
ui/
  src/
    api.ts               typed fetch client + SSE stream parser
    App.tsx              sidebar layout + tab routing
    components/
      ChatPanel.tsx      chat UI with single / compare mode
      EpisodeList.tsx    table of indexed episodes
      SourceIngest.tsx   unified URL ingestion (RSS, YouTube, audio)
      IngestButton.tsx   local .txt file indexer
```

### Two embedding models

| Key | Model | Collection |
|-----|-------|------------|
| `minilm` | `all-MiniLM-L6-v2` | `podcasts` |
| `multilingual` | `paraphrase-multilingual-MiniLM-L12-v2` | `podcasts_multilingual` |

Both are 384-dim and run on CPU. New ingestion indexes into both collections automatically. Existing episodes can be backfilled into the multilingual collection with `python -m rag.backfill`.

### Two stores, complementary roles

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
            chromadb fastapi uvicorn python-dotenv anthropic yt-dlp
```

Copy the environment file and add your Anthropic API key:

```bash
cp .env.example .env
# edit .env → set ANTHROPIC_API_KEY=sk-ant-...
```

### Frontend

```bash
cd ui && npm install
```

---

## Running

```bash
# terminal 1 — API
source .venv/bin/activate
uvicorn rag.api:app --reload

# terminal 2 — UI
cd ui && npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Usage

### Web UI

| Section | What it does |
|---------|-------------|
| **Chat** | Ask a question; get Claude's answer + cited sources + raw retrieved chunks. Toggle **Compare models** to see both embedding models side by side. |
| **Episodes** | Browse all indexed episodes |
| **Ingest from URL** | Paste any RSS, YouTube, or audio URL — the app detects the type and guides you through ingestion with live progress |
| **Local indexing** | Index `.txt` transcript files already in `output/` |

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

### CLI — backfill multilingual collection

Run this once after adding the multilingual model to index existing episodes without re-transcribing:

```bash
python -m rag.backfill --dry-run   # preview what would be processed
python -m rag.backfill             # execute
```

### CLI — search without the UI

```bash
python -m rag.search "your question here"
```

---

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/episodes` | List all indexed episodes |
| `POST` | `/ingest` | Index local transcripts from `output/` |
| `POST` | `/detect` | Detect URL type (rss / youtube / audio / webpage) |
| `GET` | `/feed?url=…` | Parse an RSS feed, annotate ingested episodes |
| `POST` | `/ingest/rss` | Ingest selected RSS episodes (SSE progress stream) |
| `POST` | `/ingest/url` | Ingest a YouTube or audio URL (SSE progress stream) |
| `POST` | `/chat` | Semantic search + Claude answer |
| `POST` | `/chat/compare` | Same query through all embedding models in parallel |

---

## Output layout

```
output/
  Podcast Name/
    YYYY-MM-DD_episode_title.mp3
    YYYY-MM-DD_episode_title.txt
rag/data/
  chroma/        ChromaDB vector store (podcasts + podcasts_multilingual)
  episodes.db    SQLite metadata
```

---

## Troubleshooting

- **No audio URL found** — some RSS entries have no enclosure link; nothing to download.
- **Whisper errors** — confirm `ffmpeg` is installed and in `PATH`; try `--model tiny` for speed.
- **Slow first run** — Whisper and both embedding models download on first use (~700 MB total for `medium`).
- **ANTHROPIC_API_KEY not set** — `/chat` returns 503 until the key is configured in `.env`.
- **SQLite threading errors** — always create connections inside the thread that uses them; never pass a connection across threads.
