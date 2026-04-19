import { useEffect, useRef, useState } from "react";
import {
  chat,
  compareModels,
  MODEL_LABELS,
  type ChatResponse,
  type Chunk,
  type CompareResponse,
  type ModelResult,
} from "../api";

// ── Types ─────────────────────────────────────────────────────────────────────

type Mode = "single" | "compare";

interface Turn {
  id:       number;
  mode:     Mode;
  query:    string;
  loading:  boolean;
  result?:  ChatResponse;
  compare?: CompareResponse;
  error?:   string;
}

// ── Primitive display components ──────────────────────────────────────────────

function distanceColor(d: number) {
  if (d <= 0.35) return "var(--green)";
  if (d <= 0.55) return "var(--yellow)";
  return "var(--red)";
}

function DistanceBadge({ value }: { value: number }) {
  return (
    <span className="badge" style={{ background: distanceColor(value), color: "#fff", border: "none" }}>
      {value.toFixed(3)}
    </span>
  );
}

function ChunkCard({ chunk, index }: { chunk: Chunk; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const preview = chunk.text.slice(0, 200);
  return (
    <div className="chunk-card">
      <div className="chunk-header">
        <span className="chunk-rank">#{index + 1}</span>
        <DistanceBadge value={chunk.distance} />
        <span className="chunk-title">{chunk.title}</span>
        <span className="muted">{chunk.date ?? "no date"} · chunk {chunk.chunk_index}</span>
      </div>
      <p className="chunk-text">
        {expanded ? chunk.text : preview + (chunk.text.length > 200 ? "…" : "")}
      </p>
      {chunk.text.length > 200 && (
        <button className="link-btn" onClick={() => setExpanded(e => !e)}>
          {expanded ? "Show less" : "Show full chunk"}
        </button>
      )}
    </div>
  );
}

// ── Model result panel ────────────────────────────────────────────────────────

function ResultPanel({ label, result }: { label?: string; result: ModelResult | ChatResponse }) {
  const [chunksOpen, setChunksOpen] = useState(false);

  return (
    <div className="result-panel">
      {label && <div className="result-panel-label">{label}</div>}

      <div className="answer-block">{result.answer}</div>

      {result.sources.length > 0 && (
        <div className="result-sources">
          <span className="muted" style={{ fontSize: "0.8rem" }}>Sources: </span>
          {result.sources.map((s, i) => (
            <span key={s.title}>
              {i > 0 && <span className="muted"> · </span>}
              <span style={{ fontSize: "0.8rem" }}>{s.title}</span>
              {s.date && <span className="muted" style={{ fontSize: "0.75rem" }}> ({s.date})</span>}
            </span>
          ))}
        </div>
      )}

      <button
        className="link-btn"
        style={{ marginTop: "0.25rem" }}
        onClick={() => setChunksOpen(o => !o)}
      >
        {chunksOpen ? "Hide" : "Show"} {result.chunks.length} retrieved chunks
      </button>

      {chunksOpen && (
        <div className="chunk-list" style={{ marginTop: "0.5rem" }}>
          {result.chunks.map((chunk, i) => (
            <ChunkCard key={i} chunk={chunk} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Single conversation turn ──────────────────────────────────────────────────

function ChatTurn({ turn }: { turn: Turn }) {
  return (
    <div className="chat-turn">
      <div className="turn-query-row">
        <div className="turn-query">{turn.query}</div>
      </div>

      <div className="turn-response">
        {turn.loading && <p className="muted" style={{ fontSize: "0.88rem" }}>Searching…</p>}
        {turn.error   && <p className="error">{turn.error}</p>}

        {turn.result && <ResultPanel result={turn.result} />}

        {turn.compare && (
          <div className="compare-grid">
            {Object.entries(turn.compare).map(([key, res]) => (
              <ResultPanel key={key} label={MODEL_LABELS[key] ?? key} result={res} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="chat-empty">
      <div className="chat-empty-icon">🎙</div>
      <h2>What can I help with?</h2>
      <p>Ask a question about your indexed podcasts, or switch to <strong>Compare</strong> mode to see two embedding models side by side.</p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ChatPanel() {
  const [turns,   setTurns]   = useState<Turn[]>([]);
  const [mode,    setMode]    = useState<Mode>("single");
  const [query,   setQuery]   = useState("");
  const [loading, setLoading] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);
  const nextId    = useRef(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q || loading) return;

    const id = nextId.current++;
    const newTurn: Turn = { id, mode, query: q, loading: true };

    setTurns(prev => [...prev, newTurn]);
    setQuery("");
    setLoading(true);

    const patch = (update: Partial<Turn>) =>
      setTurns(prev => prev.map(t => t.id === id ? { ...t, ...update } : t));

    try {
      if (mode === "single") {
        const result = await chat(q);
        patch({ loading: false, result });
      } else {
        const compare = await compareModels(q);
        patch({ loading: false, compare });
      }
    } catch (err) {
      patch({ loading: false, error: (err as Error).message });
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="chat-panel">
      {/* Message history */}
      <div className="chat-messages">
        {turns.length === 0 ? <EmptyState /> : turns.map(t => <ChatTurn key={t.id} turn={t} />)}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="chat-input-area">
        <div className="chat-input-shell">
          {/* Mode chips */}
          <div className="mode-chips">
            <button
              type="button"
              className={`mode-chip${mode === "single" ? " mode-chip--active" : ""}`}
              onClick={() => setMode("single")}
            >
              Single model
            </button>
            <button
              type="button"
              className={`mode-chip${mode === "compare" ? " mode-chip--active" : ""}`}
              onClick={() => setMode("compare")}
            >
              Compare models
            </button>
          </div>

          {/* Composer box */}
          <form onSubmit={handleSubmit}>
            <div className="chat-input-box">
              <input
                ref={inputRef}
                className="chat-input-field"
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Ask a question…"
                disabled={loading}
                autoFocus
              />
              <button
                type="submit"
                className="send-btn"
                disabled={loading || !query.trim()}
                aria-label="Send"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
                </svg>
              </button>
            </div>
          </form>

          <p className="chat-input-disclaimer">
            Podcast RAG can make mistakes. Verify important information.
          </p>
        </div>
      </div>
    </div>
  );
}
