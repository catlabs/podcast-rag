// api.ts — typed client for the Podcast RAG backend
// All fetch calls and TypeScript types live here.
// Components import from this file; they never call fetch directly.

const BASE = "http://localhost:8000";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Episode {
  id: number;
  podcast: string;
  title: string;
  date: string | null;
  chunk_count: number;
  indexed_at: string;
}

// A single retrieved chunk — the raw output of semantic search.
// `distance` is cosine distance: lower means more similar to the query.
export interface Chunk {
  text: string;
  podcast: string;
  title: string;
  date: string | null;
  chunk_index: number;
  distance: number;
}

// A deduplicated source episode cited in the answer.
export interface Source {
  title: string;
  podcast: string;
  date: string | null;
}

export interface ChatResponse {
  answer: string;
  sources: Source[];
  chunks: Chunk[];   // raw retrieved chunks, ordered by distance
}

export interface IngestResult {
  indexed: { file: string; chunks: number }[];
  skipped: string[];
  errors: { file: string; error: string }[];
}

// ── Client functions ──────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export function getEpisodes(): Promise<Episode[]> {
  return apiFetch<Episode[]>("/episodes");
}

export function runIngest(reindex = false): Promise<IngestResult> {
  return apiFetch<IngestResult>(`/ingest?reindex=${reindex}`, { method: "POST" });
}

export function chat(query: string, top_k = 5): Promise<ChatResponse> {
  return apiFetch<ChatResponse>("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, top_k }),
  });
}
