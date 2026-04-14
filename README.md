# Podcast Parser

Python utilities to:
- download podcast episodes from RSS feeds,
- transcribe audio locally with Whisper,
- and explore transcripts with a simple semantic search proof of concept (ChromaDB + sentence-transformers).

## Project scripts

- `podcast_transcriber.py`  
  Interactive CLI for RSS -> audio download -> Whisper transcription.
- `step0_explore.py`  
  Step-0 RAG exploration script: chunk one transcript, embed it, store vectors, and run semantic search queries.

## Prerequisites

- Python 3.10+ (3.11 recommended)
- `ffmpeg` available in your `PATH` (required by Whisper)

Check:

```bash
python --version
ffmpeg -version
```

On macOS (Homebrew):

```bash
brew install ffmpeg
```

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install --upgrade pip
pip install feedparser requests openai-whisper sentence-transformers chromadb
```

## Usage

### 1) Transcribe podcast episodes

Single feed:

```bash
python podcast_transcriber.py --rss "https://example.com/podcast/feed.xml"
```

Multiple feeds in one run:

```bash
python podcast_transcriber.py \
  --rss "https://example.com/show-a.xml" \
  --rss "https://example.com/show-b.xml"
```

Useful options:
- `--model` Whisper model name (`tiny`, `base`, `small`, `medium`, `large`; default `medium`)
- `--limit` number of latest episodes shown in the selection list (default `10`)

Episode selection supports:
- one episode (`5`)
- an inclusive range (`2-10`, `10-2`, or `2–10`)

### 2) Run Step-0 semantic search

```bash
python step0_explore.py
python step0_explore.py "Qu'est-ce que Nanocorp ?"
python step0_explore.py --reindex "startup San Francisco"
```

Notes:
- embeddings are persisted in `.chroma_step0/`
- default transcript path is defined in `step0_explore.py` (`TRANSCRIPT`)

## Output layout

Transcription output is written under `output/`, grouped by podcast title:

```text
output/
  Podcast Name/
    YYYY-MM-DD_episode_title.mp3
    YYYY-MM-DD_episode_title.txt
```

The date prefix keeps files naturally sorted oldest -> newest by filename.

## Troubleshooting

- **No episodes listed:** verify RSS URL is valid and reachable.
- **No audio URL found:** some feed entries do not provide enclosure links.
- **Whisper errors:** confirm `ffmpeg` is installed and try a smaller model (`--model tiny`).
- **Slow first run:** Whisper and embedding models may download on first execution.
