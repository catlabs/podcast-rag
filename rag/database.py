"""
rag/database.py — Step 2
=========================
SQLite store for episode metadata.

Why SQLite alongside ChromaDB?
  ChromaDB is built for one thing: "find chunks similar to this vector."
  It's bad at everything else — listing all episodes, filtering by podcast,
  sorting by date, counting totals.  SQLite handles all of that naturally.
  The two stores are complementary, not redundant.

Why stdlib sqlite3 and not an ORM?
  We have one table and five queries.  An ORM would add abstraction
  with no practical benefit at this scale.

Run directly to inspect the DB:
    python -m rag.database
"""

import sqlite3
from datetime import datetime, timezone

from rag.config import DB_PATH


def get_connection() -> sqlite3.Connection:
    """
    Open (or create) the SQLite database.
    row_factory = sqlite3.Row makes rows behave like dicts:
    you can write row["title"] instead of row[1].
    """
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    """Create the episodes table if it doesn't exist yet."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS episodes (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            podcast     TEXT    NOT NULL,
            title       TEXT    NOT NULL,
            date        TEXT,
            file_path   TEXT    UNIQUE NOT NULL,
            chunk_count INTEGER NOT NULL DEFAULT 0,
            indexed_at  TEXT    NOT NULL
        )
    """)
    # Add audio_url for RSS deduplication — safe to call on existing DBs:
    # SQLite raises OperationalError("duplicate column name") if it already exists.
    try:
        conn.execute("ALTER TABLE episodes ADD COLUMN audio_url TEXT")
    except sqlite3.OperationalError:
        pass
    conn.commit()


def episode_exists(conn: sqlite3.Connection, file_path: str) -> bool:
    """Return True if this file has already been indexed."""
    row = conn.execute(
        "SELECT 1 FROM episodes WHERE file_path = ?", (file_path,)
    ).fetchone()
    return row is not None


def episode_exists_by_audio_url(conn: sqlite3.Connection, audio_url: str) -> bool:
    """Return True if an episode with this audio URL has already been indexed.
    Used for RSS deduplication — more reliable than title+date matching."""
    row = conn.execute(
        "SELECT 1 FROM episodes WHERE audio_url = ?", (audio_url,)
    ).fetchone()
    return row is not None


def upsert_episode(
    conn: sqlite3.Connection,
    podcast: str,
    title: str,
    date: str | None,
    file_path: str,
    chunk_count: int,
    audio_url: str | None = None,
) -> int:
    """
    Insert a new episode row, or update it if file_path already exists.
    Returns the row id.

    audio_url is optional — populated for RSS-ingested episodes, NULL for
    episodes indexed from local files.
    """
    indexed_at = datetime.now(timezone.utc).isoformat()
    cursor = conn.execute(
        """
        INSERT INTO episodes (podcast, title, date, file_path, chunk_count, indexed_at, audio_url)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(file_path) DO UPDATE SET
            chunk_count = excluded.chunk_count,
            indexed_at  = excluded.indexed_at,
            audio_url   = excluded.audio_url
        """,
        (podcast, title, date, file_path, chunk_count, indexed_at, audio_url),
    )
    conn.commit()
    return cursor.lastrowid


def list_episodes(conn: sqlite3.Connection) -> list[dict]:
    """Return all episodes sorted by podcast name then date."""
    rows = conn.execute("""
        SELECT id, podcast, title, date, chunk_count, indexed_at
        FROM   episodes
        ORDER  BY podcast, date
    """).fetchall()
    return [dict(row) for row in rows]


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    conn = get_connection()
    init_db(conn)
    episodes = list_episodes(conn)

    if not episodes:
        print("No episodes indexed yet. Run: python -m rag.ingest")
    else:
        print(f"{len(episodes)} episode(s) in the database:\n")
        for ep in episodes:
            date  = ep["date"] or "no date"
            print(f"  [{ep['id']:>2}]  {ep['podcast']}")
            print(f"        {date}  —  {ep['title']}")
            print(f"        {ep['chunk_count']} chunks  |  indexed {ep['indexed_at'][:19]}")
            print()
