import { useState } from "react";
import ChatPanel from "./components/ChatPanel";
import EpisodeList from "./components/EpisodeList";
import IngestButton from "./components/IngestButton";
import SourceIngest from "./components/SourceIngest";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "episodes" | "chat" | "rss" | "ingest";

interface NavItem {
  id:    Tab;
  label: string;
  icon:  string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  { id: "episodes", label: "Episodes",       icon: "▤" },
  { id: "chat",     label: "Chat",           icon: "◎" },
  { id: "rss",      label: "Ingest from URL",icon: "⊕" },
  { id: "ingest",   label: "Local",          icon: "⊘" },
];

const PAGE_TITLES: Record<Tab, string> = {
  episodes: "Episodes",
  chat:     "Chat",
  rss:      "Ingest from URL",
  ingest:   "Local Indexing",
};

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar({ tab, onSelect }: { tab: Tab; onSelect: (t: Tab) => void }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="sidebar-logo-glyph">🎙</span>
        <span>Podcast RAG</span>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map(({ id, label, icon }) => (
          <button
            key={id}
            className={`nav-item${tab === id ? " nav-item--active" : ""}`}
            onClick={() => onSelect(id)}
          >
            <span className="nav-item-icon" aria-hidden>{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab]       = useState<Tab>("episodes");
  // Incrementing this key remounts ChatPanel, clearing its message history.
  const [chatKey, setChatKey] = useState(0);

  const isChat = tab === "chat";

  return (
    <div className="app-layout">
      <Sidebar tab={tab} onSelect={setTab} />

      <div className="main-area">
        <header className="page-header">
          <h1 className="page-title">{PAGE_TITLES[tab]}</h1>
          {isChat && (
            <button className="new-chat-btn" onClick={() => setChatKey(k => k + 1)}>
              + New chat
            </button>
          )}
        </header>

        {/* chat fills the remaining height and owns its scroll; other pages scroll normally */}
        <div className={`page-content${isChat ? " page-content--fill" : ""}`}>
          {tab === "episodes" && <EpisodeList />}
          {tab === "chat"     && <ChatPanel key={chatKey} />}
          {tab === "rss"      && <SourceIngest />}
          {tab === "ingest"   && <IngestButton />}
        </div>
      </div>
    </div>
  );
}
