import { useState } from "react";
import { chat, type ChatResponse, type Chunk } from "../api";

// Colour-code the cosine distance score for quick visual scanning.
// Lower distance = more similar to the query.
function distanceColor(d: number): string {
  if (d <= 0.35) return "var(--green)";
  if (d <= 0.55) return "var(--yellow)";
  return "var(--red)";
}

function DistanceBadge({ value }: { value: number }) {
  return (
    <span className="badge" style={{ background: distanceColor(value), color: "#fff" }}>
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
        <button className="link-btn" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Show less" : "Show full chunk"}
        </button>
      )}
    </div>
  );
}

export default function ChatPanel() {
  const [query, setQuery]   = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ChatResponse | null>(null);
  const [error, setError]   = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      setResult(await chat(query.trim()));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2>Chat</h2>

      <form onSubmit={handleSubmit} className="chat-form">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Posez votre question sur les podcasts…"
          disabled={loading}
        />
        <button type="submit" disabled={loading || !query.trim()}>
          {loading ? "Searching…" : "Ask"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {result && (
        <div className="chat-result">

          {/* Answer */}
          <section>
            <h3>Answer</h3>
            <div className="answer-block">{result.answer}</div>
          </section>

          {/* Sources */}
          <section>
            <h3>Sources <span className="badge">{result.sources.length}</span></h3>
            <ul className="source-list">
              {result.sources.map((s) => (
                <li key={s.title}>
                  <strong>{s.title}</strong>
                  <span className="muted"> — {s.date ?? "no date"}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Retrieved chunks — the observability core */}
          <section>
            <h3>
              Retrieved chunks{" "}
              <span className="badge">{result.chunks.length}</span>
              <span className="muted" style={{ fontSize: "0.8em", marginLeft: "0.5rem" }}>
                distance: <span style={{ color: "var(--green)" }}>≤0.35 strong</span>
                {" · "}
                <span style={{ color: "var(--yellow)" }}>≤0.55 moderate</span>
                {" · "}
                <span style={{ color: "var(--red)" }}>&gt;0.55 weak</span>
              </span>
            </h3>
            <div className="chunk-list">
              {result.chunks.map((chunk, i) => (
                <ChunkCard key={i} chunk={chunk} index={i} />
              ))}
            </div>
          </section>

        </div>
      )}
    </div>
  );
}
