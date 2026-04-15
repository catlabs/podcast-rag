import { useEffect, useState } from "react";
import { getEpisodes, type Episode } from "../api";

export default function EpisodeList() {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    getEpisodes()
      .then(setEpisodes)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="muted">Loading episodes…</p>;
  if (error)   return <p className="error">Error: {error}</p>;
  if (!episodes.length) return <p className="muted">No episodes indexed yet. Run ingest first.</p>;

  return (
    <div>
      <h2>Indexed episodes <span className="badge">{episodes.length}</span></h2>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Title</th>
            <th>Chunks</th>
            <th>Indexed at</th>
          </tr>
        </thead>
        <tbody>
          {episodes.map((ep) => (
            <tr key={ep.id}>
              <td className="muted nowrap">{ep.date ?? "—"}</td>
              <td>{ep.title}</td>
              <td className="center">
                <span className="badge">{ep.chunk_count}</span>
              </td>
              <td className="muted nowrap">{ep.indexed_at.slice(0, 19).replace("T", " ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
