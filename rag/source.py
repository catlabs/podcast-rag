"""
rag/source.py
=============
Source type detection: given any URL, figure out what it is.

Detection order (cheap → expensive):
  1. YouTube — pure regex, no I/O
  2. Audio file extension in URL path
  3. HEAD request → Content-Type header
  4. feedparser.parse() on the URL
  5. Fallback → unknown

Returns a DetectedSource dataclass with a stable source_type string that
the API, the ingest router, and the UI badge all share.
"""

import re
from dataclasses import dataclass, field
from typing import Literal

import feedparser
import requests

SourceType = Literal["rss", "youtube", "direct_audio", "webpage", "unknown"]

_YOUTUBE_RE = re.compile(
    r"(?:youtube\.com/(?:watch\?.*v=|shorts/)|youtu\.be/)([A-Za-z0-9_-]{11})"
)

_AUDIO_EXT_RE = re.compile(
    r"\.(mp3|m4a|ogg|wav|opus|aac|flac)(\?|$)", re.IGNORECASE
)

_AUDIO_CONTENT_TYPES = {"audio/mpeg", "audio/mp4", "audio/ogg",
                        "audio/wav", "audio/opus", "audio/aac", "audio/flac"}

_RSS_CONTENT_TYPES   = {"application/rss+xml", "application/atom+xml",
                        "text/xml", "application/xml"}


@dataclass
class DetectedSource:
    url:         str
    source_type: SourceType
    label:       str          # human-readable, shown as a UI badge
    meta:        dict = field(default_factory=dict)


def detect_source(url: str) -> DetectedSource:
    """
    Inspect a URL and return its detected type.

    Never raises — unknown URLs return source_type="unknown" with an
    "error" key in meta rather than crashing the endpoint.
    """
    url = url.strip()

    # ── 1. YouTube ────────────────────────────────────────────────────────────
    m = _YOUTUBE_RE.search(url)
    if m:
        return DetectedSource(
            url=url,
            source_type="youtube",
            label="YouTube video",
            meta={"video_id": m.group(1)},
        )

    # ── 2. Audio file extension ───────────────────────────────────────────────
    if _AUDIO_EXT_RE.search(url):
        return DetectedSource(url=url, source_type="direct_audio", label="Audio file")

    # ── 3. HEAD request — inspect Content-Type ────────────────────────────────
    try:
        head = requests.head(
            url, timeout=10, allow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (podcast-rag)"},
        )
        ct = head.headers.get("Content-Type", "").split(";")[0].strip().lower()

        if ct in _AUDIO_CONTENT_TYPES:
            return DetectedSource(url=url, source_type="direct_audio", label="Audio file")

        if ct in _RSS_CONTENT_TYPES:
            return DetectedSource(url=url, source_type="rss", label="RSS feed")

        # text/html → try feedparser before declaring it a webpage
        if "html" in ct:
            result = _try_feedparser(url)
            if result:
                return result
            return DetectedSource(url=url, source_type="webpage", label="Web page")

    except requests.RequestException:
        pass   # fall through to feedparser attempt

    # ── 4. feedparser — works for feeds that don't set Content-Type correctly ─
    result = _try_feedparser(url)
    if result:
        return result

    # ── 5. Unknown ────────────────────────────────────────────────────────────
    return DetectedSource(url=url, source_type="unknown", label="Unknown source")


def _try_feedparser(url: str) -> DetectedSource | None:
    """
    Attempt to parse the URL as an RSS/Atom feed.
    Returns a DetectedSource if the feed has entries or a title, else None.

    We fetch the content ourselves (with a hard timeout) and pass the text
    to feedparser, so feedparser only parses — it never makes network calls.
    This prevents feedparser's own urllib from hanging indefinitely.
    """
    try:
        resp = requests.get(
            url, timeout=15, allow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (podcast-rag)"},
        )
        feed = feedparser.parse(resp.text)
        if feed.entries or feed.feed.get("title"):
            title = feed.feed.get("title", "")
            return DetectedSource(
                url=url,
                source_type="rss",
                label="RSS feed",
                meta={"feed_title": title} if title else {},
            )
    except Exception:
        pass
    return None
