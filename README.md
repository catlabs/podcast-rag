# Podcast transcriber (Whisper)

Small Python CLI that:
- reads a podcast RSS feed,
- lets you choose **one episode or a range** of episodes (e.g. `2-10`) in the terminal,
- downloads and transcribes each selection with `openai-whisper`,
- saves `.txt` transcripts (and audio) under `output/`.

## Prerequisites

- Python 3.10+ recommended
- `ffmpeg` installed and available in your `PATH`

Check `ffmpeg`:

```bash
ffmpeg -version
```

On macOS (Homebrew):

```bash
brew install ffmpeg
```

## Install

```bash
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install feedparser requests openai-whisper
```

## Usage

```bash
python podcast_transcriber.py --rss "https://example.com/podcast/feed.xml"
```

Process several feeds in one run (you get a clear **START** / **DONE** block in the terminal for each):

```bash
python podcast_transcriber.py \
  --rss "https://example.com/show-a.xml" \
  --rss "https://example.com/show-b.xml"
```

Optional arguments:
- `--model` Whisper model name (default: `medium`)
- `--limit` how many **latest** episodes are listed and selectable (default: `10`). If you want a range like `2-50`, use `--limit 50` (or higher) so those rows appear in the list.

### Choosing episodes

After the episode list appears:

- Enter **one number** to process a single episode (e.g. `5`).
- Enter **two numbers separated by a hyphen** to process every episode in that inclusive range (e.g. `2-10` processes episodes 2 through 10, in order). You can also use an en dash (`–`) instead of `-`.
- If the first number is larger than the second (e.g. `10-2`), the range is treated as `2-10`.

The script then downloads and transcribes **each** episode in that range in one run, so you can start a long batch and leave it running.

Example:

```bash
python podcast_transcriber.py --rss "https://example.com/podcast/feed.xml" --model small --limit 30
```

## Output

Files are grouped **one folder per podcast** (folder name = the show title from the RSS feed, sanitized). Inside each folder:

- Audio: `YYYY-MM-DD_episode_title.mp3` (or `.m4a`, etc.)
- Transcript: `YYYY-MM-DD_episode_title.txt`

The `YYYY-MM-DD` prefix is the episode date from the feed when available. That keeps files sorted **oldest first** when your file browser sorts by name. If the feed has no date, the prefix is `0000-00-00`.

Example:

```text
output/
  My Favorite Show/
    2024-01-15_intro_episode.mp3
    2024-01-15_intro_episode.txt
    2024-02-20_guest_interview.mp3
    2024-02-20_guest_interview.txt
```

## Troubleshooting

- No episodes listed: check that the RSS URL is valid and reachable.
- No audio URL found: some feeds/episodes do not expose enclosure links.
- Whisper fails: confirm `ffmpeg` is installed and try a smaller model (for example `--model tiny`).
