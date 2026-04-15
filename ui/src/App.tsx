import { useState } from "react";
import EpisodeList from "./components/EpisodeList";
import IngestButton from "./components/IngestButton";
import ChatPanel from "./components/ChatPanel";

type Tab = "episodes" | "chat" | "ingest";

export default function App() {
  const [tab, setTab] = useState<Tab>("episodes");

  return (
    <div className="layout">
      <header>
        <span className="logo">🎙 Podcast RAG</span>
        <nav>
          {(["episodes", "chat", "ingest"] as Tab[]).map((t) => (
            <button
              key={t}
              className={tab === t ? "tab active" : "tab"}
              onClick={() => setTab(t)}
            >
              {t === "episodes" && "Episodes"}
              {t === "chat"     && "Chat"}
              {t === "ingest"   && "Ingest"}
            </button>
          ))}
        </nav>
      </header>

      <main>
        {tab === "episodes" && <EpisodeList />}
        {tab === "chat"     && <ChatPanel />}
        {tab === "ingest"   && <IngestButton />}
      </main>
    </div>
  );
}
