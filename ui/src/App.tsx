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

const MAIN_ITEMS: NavItem[] = [
  { id: "chat",     label: "New chat",    icon: "✎" },
  { id: "episodes", label: "Episodes",    icon: "▤" },
];

const INGEST_ITEMS: NavItem[] = [
  { id: "rss",    label: "Ingest from URL", icon: "⊕" },
  { id: "ingest", label: "Local indexing",  icon: "⊘" },
];

const PAGE_TITLES: Record<Tab, string> = {
  episodes: "Episodes",
  chat:     "Chat",
  rss:      "Ingest from URL",
  ingest:   "Local Indexing",
};

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar({
  tab,
  onSelect,
  onNewChat,
}: {
  tab: Tab;
  onSelect: (t: Tab) => void;
  onNewChat: () => void;
}) {
  return (
    <aside className="sidebar">
      {/* Logo / title row */}
      <div className="sidebar-logo">
        <span className="sidebar-logo-title">🎙 Podcast RAG</span>
        <div className="sidebar-logo-actions">
          <button className="icon-btn" title="New chat" onClick={onNewChat}>✎</button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {MAIN_ITEMS.map(({ id, label, icon }) => (
          <button
            key={id}
            className={`nav-item${tab === id ? " nav-item--active" : ""}`}
            onClick={() => { if (id === "chat") onNewChat(); else onSelect(id); }}
          >
            <span className="nav-item-icon" aria-hidden>{icon}</span>
            <span>{label}</span>
          </button>
        ))}

        <div className="nav-section-label">Indexing</div>

        {INGEST_ITEMS.map(({ id, label, icon }) => (
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

      {/* User profile footer */}
      <div className="sidebar-footer">
        <div className="user-row">
          <div className="user-avatar">JC</div>
          <div className="user-info">
            <span className="user-name">Julien Catala</span>
            <span className="user-plan">Personal</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [tab,     setTab]     = useState<Tab>("chat");
  const [chatKey, setChatKey] = useState(0);

  const isChat = tab === "chat";

  function handleNewChat() {
    setTab("chat");
    setChatKey(k => k + 1);
  }

  return (
    <div className="app-layout">
      <Sidebar tab={tab} onSelect={setTab} onNewChat={handleNewChat} />

      <div className="main-area">
        {!isChat && (
          <header className="page-header">
            <h1 className="page-title">{PAGE_TITLES[tab]}</h1>
          </header>
        )}

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
