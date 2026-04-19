/**
 * SourceIngest — unified source-aware ingestion UI
 *
 * Phase 1 — input:      paste any URL, click "Detect"
 * detecting:            spinner while POST /detect runs
 * Phase 2 — select:     RSS → episode table (unchanged)
 *                       YouTube / audio → title field + ingest button
 *                       webpage → discovered sources (coming soon)
 * Phase 3 — ingesting:  live SSE progress cards (reused for all source types)
 */

import { useRef, useState } from "react";
import type {
  DetectedSource,
  FeedEpisode,
  FeedResponse,
  RssProgressEvent,
  SourceType,
} from "../api";
import {
  detectSource,
  getFeed,
  ingestRssRaw,
  ingestUrlRaw,
  parseSSEStream,
} from "../api";

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = "input" | "detecting" | "select" | "ingesting";

type EpisodeStatus = {
  step:     "downloading" | "transcribing" | "indexing" | null;
  status:   "pending" | "running" | "done" | "error";
  percent?: number;   // download progress 0-100
  detail?:  string;   // transcription hint e.g. "47 min audio"
  chunks?:  number;
  error?:   string;
};

// ── Small helpers ─────────────────────────────────────────────────────────────

const WHISPER_MODELS = ["tiny", "base", "medium", "large"] as const;

function formatDuration(secs: number | null): string {
  if (!secs) return "";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}min`;
  if (m > 0) return `${m}min ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

const SOURCE_BADGE_COLORS: Record<SourceType, string> = {
  rss:          "var(--accent)",
  youtube:      "var(--red)",
  direct_audio: "var(--green)",
  webpage:      "var(--yellow)",
  unknown:      "var(--muted)",
};

function SourceBadge({ detected }: { detected: DetectedSource }) {
  return (
    <span
      className="badge"
      style={{ background: SOURCE_BADGE_COLORS[detected.source_type], fontSize: "0.8em" }}
    >
      {detected.label}
    </span>
  );
}

// ── Step timeline ─────────────────────────────────────────────────────────────

const STEPS = ["downloading", "transcribing", "indexing"] as const;
type StepName = typeof STEPS[number];
type StepState = "pending" | "active" | "done" | "error";

const STEP_LABELS: Record<StepName, string> = {
  downloading:  "Downloading",
  transcribing: "Transcribing",
  indexing:     "Indexing",
};

function resolveStepState(name: StepName, st: EpisodeStatus): StepState {
  const idx = STEPS.indexOf(name);
  const cur = st.step != null ? STEPS.indexOf(st.step) : -1;
  if (st.status === "pending") return "pending";
  if (st.status === "done")    return "done";
  if (st.status === "error")   return idx < cur ? "done" : idx === cur ? "error" : "pending";
  // running
  return idx < cur ? "done" : idx === cur ? "active" : "pending";
}

function StepDot({ state }: { state: StepState }) {
  const base: React.CSSProperties = { width: 16, height: 16, borderRadius: "50%",
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };
  if (state === "done")  return <div style={{ ...base, background: "var(--green)" }}>
    <span style={{ color: "#fff", fontSize: "0.6rem", lineHeight: 1 }}>✓</span></div>;
  if (state === "error") return <div style={{ ...base, background: "var(--red)" }}>
    <span style={{ color: "#fff", fontSize: "0.65rem", lineHeight: 1 }}>✗</span></div>;
  if (state === "active") return <div style={{ ...base, background: "var(--surface)",
    border: "2px solid var(--accent)" }}><Spinner size={8} /></div>;
  // pending
  return <div style={{ ...base, background: "var(--surface)", border: "2px solid var(--border)" }} />;
}

function StepTimeline({ st }: { st: EpisodeStatus }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {STEPS.map((name, i) => {
        const state   = resolveStepState(name, st);
        const isLast  = i === STEPS.length - 1;
        const lineColor = state === "done" || (state === "error" && i < STEPS.indexOf(st.step ?? "downloading"))
          ? "var(--green)" : "var(--border)";

        return (
          <div key={name} style={{ display: "flex", gap: "0.65rem" }}>
            {/* Left column: dot + connector line */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 16 }}>
              <StepDot state={state} />
              {!isLast && (
                <div style={{ width: 2, flex: 1, minHeight: 14, background: lineColor,
                  marginTop: 2, marginBottom: 2 }} />
              )}
            </div>

            {/* Right column: label + detail */}
            <div style={{ paddingBottom: isLast ? 0 : "0.6rem", minWidth: 0 }}>
              <span style={{
                fontSize: "0.85rem",
                color: state === "pending" ? "var(--muted)" : "var(--text)",
                fontWeight: state === "active" ? 500 : 400,
              }}>
                {STEP_LABELS[name]}
              </span>

              {/* Detail text (transcription duration hint) */}
              {state === "active" && st.detail && (
                <span className="muted" style={{ fontSize: "0.78rem", marginLeft: "0.5rem" }}>
                  {st.detail}
                </span>
              )}

              {/* Download progress bar */}
              {state === "active" && name === "downloading" && st.percent !== undefined && (
                <div style={{ marginTop: "0.3rem", maxWidth: 200 }}>
                  <div style={{ height: 3, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${st.percent}%`,
                      background: "var(--accent)", transition: "width 0.2s ease" }} />
                  </div>
                  <span style={{ fontSize: "0.72rem", color: "var(--muted)", display: "block", marginTop: 2 }}>
                    {st.percent}%
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Spinner({ size = 10 }: { size?: number }) {
  return (
    <span style={{
      display: "inline-block",
      width:  size,
      height: size,
      border: "2px solid var(--border)",
      borderTopColor: "var(--accent)",
      borderRadius: "50%",
      animation: "spin 0.7s linear infinite",
      flexShrink: 0,
    }} />
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SourceIngest() {
  const [phase,       setPhase]       = useState<Phase>("input");
  const [url,         setUrl]         = useState("");
  const [detected,    setDetected]    = useState<DetectedSource | null>(null);
  const [customTitle, setCustomTitle] = useState("");
  const [detectError, setDetectError] = useState<string | null>(null);
  const [feed,        setFeed]        = useState<FeedResponse | null>(null);
  const [feedError,   setFeedError]   = useState<string | null>(null);
  const [selected,    setSelected]    = useState<Set<string>>(new Set());
  const [model,       setModel]       = useState<typeof WHISPER_MODELS[number]>("medium");
  const [progress,    setProgress]    = useState<Map<string, EpisodeStatus>>(new Map());
  const [ingestTotal, setIngestTotal] = useState(0);
  const [ingestDone,  setIngestDone]  = useState(0);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Phase 1 → detecting ────────────────────────────────────────────────────

  async function handleDetect() {
    if (!url.trim()) return;
    setDetectError(null);
    setFeedError(null);
    setDetected(null);
    setFeed(null);
    setPhase("detecting");

    let result: DetectedSource;
    try {
      result = await detectSource(url.trim());
    } catch (err) {
      setDetectError(err instanceof Error ? err.message : String(err));
      setPhase("input");
      return;
    }

    setDetected(result);

    if (result.source_type === "rss") {
      // Proceed straight to episode selection
      try {
        const data = await getFeed(url.trim());
        setFeed(data);
        setSelected(
          new Set(data.episodes.filter((ep) => !ep.is_ingested && ep.audio_url).map((ep) => ep.guid))
        );
        setPhase("select");
      } catch (err) {
        setFeedError(err instanceof Error ? err.message : String(err));
        setPhase("input");
      }
    } else {
      // For all other types: show the detected badge and a placeholder
      setPhase("select");
    }
  }

  // ── RSS selection helpers ──────────────────────────────────────────────────

  function toggleAll(episodes: FeedEpisode[]) {
    const selectable = episodes.filter((ep) => ep.audio_url);
    setSelected(
      selected.size === selectable.length
        ? new Set()
        : new Set(selectable.map((ep) => ep.guid))
    );
  }

  function toggle(guid: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(guid) ? next.delete(guid) : next.add(guid);
      return next;
    });
  }

  // ── RSS ingestion ──────────────────────────────────────────────────────────

  async function handleRssIngest() {
    if (!feed || selected.size === 0) return;

    const chosen = feed.episodes.filter((ep) => selected.has(ep.guid));
    setProgress(new Map(chosen.map((ep) => [ep.guid, { step: null, status: "pending" }])));
    setIngestDone(0);
    setIngestError(null);
    setPhase("ingesting");

    let res: Response;
    try {
      res = await ingestRssRaw({
        feed_url:      url,
        feed_title:    feed.feed_title,
        whisper_model: model,
        episodes:      chosen.map((ep) => ({
          guid: ep.guid, title: ep.title, date: ep.date, audio_url: ep.audio_url,
        })),
      });
    } catch (err) {
      setIngestError(err instanceof Error ? err.message : String(err));
      return;
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      setIngestError(`Server error ${res.status}: ${detail}`);
      setPhase("select");
      return;
    }

    if (!res.body) { setIngestError("No response body."); return; }

    const indexToGuid = chosen.map((ep) => ep.guid);
    for await (const event of parseSSEStream(res.body)) {
      handleEvent(event, indexToGuid);
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }

  // ── YouTube / direct-audio ingestion ──────────────────────────────────────

  async function handleUrlIngest() {
    if (!detected) return;

    // Progress will be keyed by the URL itself (single-item map)
    const key = url;
    setProgress(new Map([[key, { step: null, status: "pending" }]]));
    setIngestTotal(1);
    setIngestDone(0);
    setIngestError(null);
    setPhase("ingesting");

    let res: Response;
    try {
      res = await ingestUrlRaw({
        url,
        source_type:   detected.source_type,
        title:         customTitle.trim() || undefined,
        whisper_model: model,
      });
    } catch (err) {
      setIngestError(err instanceof Error ? err.message : String(err));
      return;
    }

    if (!res.body) { setIngestError("No response body."); return; }

    // For /ingest/url the server always uses episode_index=1, map it to our key
    for await (const event of parseSSEStream(res.body)) {
      handleEvent(event, [key]);
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }

  function handleEvent(event: RssProgressEvent, indexToGuid: string[]) {
    if (event.type === "start") { setIngestTotal(event.total); return; }
    const guid = indexToGuid[event.episode_index - 1];
    if (!guid) return;
    if (event.type === "progress") {
      setProgress((prev) => { const n = new Map(prev); n.set(guid, { step: event.step, status: "running", percent: event.percent, detail: event.detail }); return n; });
    } else if (event.type === "done") {
      setProgress((prev) => { const n = new Map(prev); n.set(guid, { step: null, status: "done", chunks: event.chunks }); return n; });
      setIngestDone((d) => d + 1);
    } else if (event.type === "error") {
      setProgress((prev) => {
        const n = new Map(prev);
        // Preserve the last known step so the timeline shows which step failed
        n.set(guid, { step: prev.get(guid)?.step ?? null, status: "error", error: event.message });
        return n;
      });
      setIngestDone((d) => d + 1);
    }
  }

  function reset() {
    setPhase("input");
    setUrl("");
    setDetected(null);
    setFeed(null);
    setProgress(new Map());
  }

  const allDone = phase === "ingesting" && ingestDone === ingestTotal && ingestTotal > 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      <h2>Ingest from URL</h2>

      {/* ── Phase 1 + detecting ── */}
      {(phase === "input" || phase === "detecting") && (
        <>
          <p className="muted" style={{ marginBottom: "1rem" }}>
            Paste any URL — RSS feed, YouTube video, or audio file.
            The system will detect the source type automatically.
          </p>
          <form
            className="chat-form"
            onSubmit={(e) => { e.preventDefault(); handleDetect(); }}
          >
            <input
              type="text"
              placeholder="https://… (RSS feed, YouTube, audio file)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={phase === "detecting"}
            />
            <button type="submit" disabled={phase === "detecting" || !url.trim()}>
              {phase === "detecting" ? "Detecting…" : "Detect"}
            </button>
          </form>
          {detectError && <p className="error">{detectError}</p>}
          {feedError   && <p className="error">{feedError}</p>}
        </>
      )}

      {/* ── Phase 2 — select ── */}
      {phase === "select" && detected && (
        <>
          {/* Detected type badge + back link */}
          <div className="row gap" style={{ marginBottom: "1.25rem", flexWrap: "wrap" }}>
            <SourceBadge detected={detected} />
            {detected.source_type === "rss" && feed && (
              <span style={{ fontWeight: 600 }}>{feed.feed_title}</span>
            )}
            <button className="link-btn" onClick={reset}>← change URL</button>
          </div>

          {/* RSS: episode table */}
          {detected.source_type === "rss" && feed && (
            <>
              {/* Banner when the feed has no audio at all */}
              {feed.episodes.every((ep) => !ep.audio_url) && (
                <div style={{
                  background: "var(--surface)", border: "1px solid var(--yellow)",
                  borderRadius: 8, padding: "0.9rem 1.1rem", marginBottom: "1rem",
                  fontSize: "0.875rem",
                }}>
                  <strong style={{ color: "var(--yellow)" }}>No audio episodes found.</strong>
                  <span className="muted" style={{ marginLeft: "0.5rem" }}>
                    This looks like a text/news RSS feed rather than a podcast.
                    Audio ingestion requires episodes with an audio enclosure (
                    <code>&lt;enclosure&gt;</code> or <code>&lt;media:content&gt;</code>).
                    Try a podcast RSS feed URL instead.
                  </span>
                </div>
              )}

              <div className="row gap" style={{ marginBottom: "1rem", flexWrap: "wrap" }}>
                {(() => {
                  const withAudio = feed.episodes.filter(ep => ep.audio_url).length;
                  const total = feed.episodes.length;
                  return (
                    <span className="muted">
                      {total} episodes
                      {withAudio < total && (
                        <span> · <span style={{ color: withAudio === 0 ? "var(--red)" : "var(--yellow)" }}>
                          {withAudio} with audio
                        </span></span>
                      )}
                    </span>
                  );
                })()}
                <label className="row gap-sm">
                  <span className="muted" style={{ fontSize: "0.85em" }}>Whisper model:</span>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value as typeof WHISPER_MODELS[number])}
                    style={{
                      background: "var(--surface)", border: "1px solid var(--border)",
                      color: "var(--text)", borderRadius: 6, padding: "0.3rem 0.6rem", fontSize: "0.85rem",
                    }}
                  >
                    {WHISPER_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
                <button disabled={selected.size === 0} onClick={handleRssIngest}>
                  Ingest {selected.size} episode{selected.size !== 1 ? "s" : ""}
                </button>
              </div>

              <table style={{ tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: 36 }} />
                  <col />                        {/* title — takes remaining space */}
                  <col style={{ width: 100 }} />  {/* date */}
                  <col style={{ width: 80 }} />   {/* duration */}
                  <col style={{ width: 80 }} />   {/* status */}
                </colgroup>
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={selected.size === feed.episodes.filter(ep => ep.audio_url).length && selected.size > 0}
                        ref={(el) => {
                          if (el) {
                            const selectable = feed.episodes.filter(ep => ep.audio_url).length;
                            el.indeterminate = selected.size > 0 && selected.size < selectable;
                          }
                        }}
                        onChange={() => toggleAll(feed.episodes)}
                      />
                    </th>
                    <th>Title</th>
                    <th>Date</th>
                    <th>Duration</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {feed.episodes.map((ep) => {
                    const noAudio = !ep.audio_url;
                    return (
                      <tr
                        key={ep.guid}
                        onClick={() => !noAudio && toggle(ep.guid)}
                        style={{ cursor: noAudio ? "default" : "pointer", opacity: noAudio ? 0.45 : 1 }}
                      >
                        <td>
                          <input
                            type="checkbox"
                            checked={selected.has(ep.guid)}
                            disabled={noAudio}
                            onChange={() => toggle(ep.guid)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </td>
                        <td style={{ overflow: "hidden" }}>
                          <div style={{
                            fontWeight: 500, fontSize: "0.875rem",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {ep.title}
                          </div>
                          {ep.description && (
                            <div className="muted" style={{
                              fontSize: "0.78rem", marginTop: "0.15rem",
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                            }}>
                              {ep.description}
                            </div>
                          )}
                          {noAudio && (
                            <div style={{ fontSize: "0.75rem", color: "var(--yellow)", marginTop: "0.1rem" }}>
                              No audio
                            </div>
                          )}
                        </td>
                        <td className="nowrap muted" style={{ fontSize: "0.8rem" }}>{ep.date ?? "—"}</td>
                        <td className="nowrap muted" style={{ fontSize: "0.8rem" }}>
                          {formatDuration(ep.duration_secs)}
                        </td>
                        <td>{ep.is_ingested && <span className="badge badge-green">indexed</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}

          {/* YouTube / direct audio: title field + ingest button */}
          {(detected.source_type === "youtube" || detected.source_type === "direct_audio") && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: 560 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <span className="muted" style={{ fontSize: "0.85em" }}>
                  Title <span style={{ fontWeight: 400 }}>(optional — auto-detected if left blank)</span>
                </span>
                <input
                  type="text"
                  placeholder={detected.source_type === "youtube" ? "Video title…" : "Episode title…"}
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  style={{
                    background: "var(--surface)", border: "1px solid var(--border)",
                    color: "var(--text)", padding: "0.5rem 0.75rem",
                    borderRadius: 6, fontSize: "0.9rem", outline: "none",
                  }}
                />
              </label>

              <label className="row gap-sm">
                <span className="muted" style={{ fontSize: "0.85em" }}>Whisper model:</span>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value as typeof WHISPER_MODELS[number])}
                  style={{
                    background: "var(--surface)", border: "1px solid var(--border)",
                    color: "var(--text)", borderRadius: 6, padding: "0.3rem 0.6rem", fontSize: "0.85rem",
                  }}
                >
                  {WHISPER_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>

              <div>
                <button onClick={handleUrlIngest}>Ingest</button>
              </div>
            </div>
          )}

          {/* Webpage / unknown: not yet supported */}
          {(detected.source_type === "webpage" || detected.source_type === "unknown") && (
            <div
              style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: 8, padding: "1.5rem", color: "var(--muted)", fontSize: "0.9rem",
              }}
            >
              {detected.source_type === "webpage" && (
                <>
                  <strong style={{ color: "var(--text)" }}>Web page detected</strong>
                  <p style={{ marginTop: "0.5rem" }}>
                    Page scraping is coming soon. Will discover RSS feeds, YouTube links,
                    and audio files embedded in the page.
                  </p>
                </>
              )}
              {detected.source_type === "unknown" && (
                <p>Could not determine the source type for this URL. Try pasting the RSS or YouTube URL directly.</p>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Phase 3 — ingesting ── */}
      {phase === "ingesting" && (
        <>
          <div className="row gap" style={{ marginBottom: "1rem" }}>
            {detected && <SourceBadge detected={detected} />}
            {feed && <span style={{ fontWeight: 600 }}>{feed.feed_title}</span>}
            {!allDone && ingestTotal > 0 && (
              <span className="muted">
                {ingestTotal === 1
                  ? "Ingesting…"
                  : `Ingesting episode ${Math.min(ingestDone + 1, ingestTotal)} of ${ingestTotal}…`}
              </span>
            )}
            {allDone && (
              <span style={{ color: "var(--green)" }}>
                Done — {ingestDone} episode{ingestDone !== 1 ? "s" : ""} processed
              </span>
            )}
          </div>

          {ingestError && <p className="error">{ingestError}</p>}

          <div className="chunk-list">
            {Array.from(progress.entries()).map(([key, st]) => {
              const rssEp       = feed?.episodes.find((e) => e.guid === key);
              const displayTitle = rssEp?.title ?? (customTitle || key);
              return (
                <div key={key} className="chunk-card">
                  {/* Title row */}
                  <div className="chunk-header" style={{ marginBottom: "0.75rem" }}>
                    <span className="chunk-title">{displayTitle}</span>
                    {rssEp?.date && (
                      <span className="muted" style={{ fontSize: "0.78rem" }}>{rssEp.date}</span>
                    )}
                    {st.status === "done" && (
                      <span className="badge badge-green">{st.chunks} chunks</span>
                    )}
                  </div>

                  {/* Step timeline */}
                  <StepTimeline st={st} />

                  {/* Error message */}
                  {st.status === "error" && st.error && (
                    <div className="error" style={{ fontSize: "0.82rem", marginTop: "0.5rem" }}>
                      {st.error}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {allDone && (
            <div style={{ marginTop: "1.5rem" }}>
              <button onClick={reset}>Load another URL</button>
            </div>
          )}

          <div ref={bottomRef} />
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
