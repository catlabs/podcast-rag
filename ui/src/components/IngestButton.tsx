import { useState } from "react";
import { runIngest, type IngestResult } from "../api";

export default function IngestButton() {
  const [loading, setLoading]   = useState(false);
  const [reindex, setReindex]   = useState(false);
  const [result, setResult]     = useState<IngestResult | null>(null);
  const [error, setError]       = useState<string | null>(null);

  async function handleIngest() {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await runIngest(reindex);
      setResult(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2>Ingest transcripts</h2>
      <p className="muted">
        Walks <code>output/</code>, chunks each transcript, embeds it, and stores it in
        ChromaDB + SQLite. Already-indexed files are skipped unless you force re-index.
      </p>

      <div className="row gap">
        <button onClick={handleIngest} disabled={loading}>
          {loading ? "Indexing…" : "Run ingest"}
        </button>
        <label className="row gap-sm">
          <input
            type="checkbox"
            checked={reindex}
            onChange={(e) => setReindex(e.target.checked)}
          />
          Force re-index
        </label>
      </div>

      {error && <p className="error">{error}</p>}

      {result && (
        <div className="ingest-result">
          {result.indexed.length > 0 && (
            <section>
              <h3>Indexed <span className="badge badge-green">{result.indexed.length}</span></h3>
              <table>
                <thead><tr><th>File</th><th>Chunks</th></tr></thead>
                <tbody>
                  {result.indexed.map((r) => (
                    <tr key={r.file}>
                      <td>{r.file}</td>
                      <td className="center"><span className="badge">{r.chunks}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {result.skipped.length > 0 && (
            <section>
              <h3>Skipped <span className="badge">{result.skipped.length}</span></h3>
              <ul className="muted">
                {result.skipped.map((f) => <li key={f}>{f}</li>)}
              </ul>
            </section>
          )}

          {result.errors.length > 0 && (
            <section>
              <h3>Errors <span className="badge badge-red">{result.errors.length}</span></h3>
              {result.errors.map((e) => (
                <p key={e.file} className="error"><strong>{e.file}</strong>: {e.error}</p>
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
