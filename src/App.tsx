import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { PipelineMetrics } from "../shared/types";
import { ChatBotView } from "./components/ChatBotView";
import { CollectionsView } from "./components/CollectionsView";
import { PipelineView } from "./components/PipelineView";
import { ReviewView } from "./components/ReviewView";
import { CollectionsIcon, ReviewIcon } from "./components/icons";
import { SmritiLogo } from "./components/SmritiLogo";
import { formatBytes } from "./utils/format";
import "./App.css";

type Tab = "collections" | "review" | "pipeline" | "chatbot";

function PipelineIcon() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" />
    </svg>
  );
}

function ChatBotIcon() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function App() {
  const [tab, setTab] = useState<Tab>("collections");
  const [metrics, setMetrics] = useState<PipelineMetrics | null>(null);

  const refreshMetrics = useCallback(async () => {
    const m = await invoke<PipelineMetrics>("get_metrics");
    setMetrics(m);
  }, []);

  useEffect(() => {
    refreshMetrics();
    const unsubs = [
      listen("metrics:update", () => refreshMetrics()),
      listen("file:completed", () => refreshMetrics()),
      listen("file:failed", () => refreshMetrics()),
    ];
    return () => {
      unsubs.forEach((p) => p.then((u) => u()));
    };
  }, [refreshMetrics]);

  const pendingReviewCount = metrics?.unreviewedFailed ?? metrics?.failed ?? 0;

  const topbar = {
    collections: {
      title: "Collections",
      subtitle: "Organize documents and view extracted data",
    },
    review: {
      title: "Failure Review",
      subtitle: "Inspect quarantined documents and error details",
    },
    pipeline: {
      title: "Pipeline",
      subtitle: "Throughput, AI cost, and ingestion activity",
    },
    chatbot: {
      title: "Chat Bot",
      subtitle: "Ask questions and invoke Smriti MCP tools via NitroChat",
    },
  }[tab];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand" data-tauri-drag-region>
          <div className="brand-mark">
            <SmritiLogo size={44} />
            <div>
              <h1>Smriti</h1>
              <p className="brand-devanagari">स्मृति</p>
              <p className="brand-tagline">Document Intelligence</p>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav" data-tauri-drag-region={false}>
          <button
            type="button"
            className={`nav-item ${tab === "collections" ? "active" : ""}`}
            onClick={() => setTab("collections")}
          >
            <CollectionsIcon />
            Collections
          </button>
          <button
            type="button"
            className={`nav-item ${tab === "review" ? "active" : ""}`}
            onClick={() => setTab("review")}
          >
            <ReviewIcon />
            Review
            {pendingReviewCount > 0 && (
              <span className="nav-badge">{pendingReviewCount}</span>
            )}
          </button>
          <button
            type="button"
            className={`nav-item ${tab === "pipeline" ? "active" : ""}`}
            onClick={() => setTab("pipeline")}
          >
            <PipelineIcon />
            Pipeline
          </button>
          <button
            type="button"
            className={`nav-item ${tab === "chatbot" ? "active" : ""}`}
            onClick={() => setTab("chatbot")}
          >
            <ChatBotIcon />
            Chat Bot
          </button>
        </nav>

        <div className="sidebar-footer" data-tauri-drag-region={false}>
          <div className="live-indicator">
            <span className="live-dot" />
            Pipeline connected
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar" data-tauri-drag-region>
          <div className="topbar-drag">
            <h2 className="topbar-title">{topbar.title}</h2>
            <p className="topbar-subtitle">{topbar.subtitle}</p>
          </div>
          {metrics && tab !== "chatbot" && (
            <div className="topbar-stats" data-tauri-drag-region={false}>
              <div className="topbar-stat">
                <span className="topbar-stat-label">Ingested</span>
                <span className="topbar-stat-value">{metrics.totalFiles}</span>
              </div>
              <div className="topbar-stat">
                <span className="topbar-stat-label">Pass Rate</span>
                <span className="topbar-stat-value">
                  {metrics.validationPassRate.toFixed(0)}%
                </span>
              </div>
              <div className="topbar-stat">
                <span className="topbar-stat-label">Volume</span>
                <span className="topbar-stat-value">
                  {formatBytes(metrics.totalBytes)}
                </span>
              </div>
            </div>
          )}
        </header>

        <div className={`content ${tab === "chatbot" ? "content-chatbot" : ""}`}>
          {tab === "collections" && <CollectionsView />}
          {tab === "review" && <ReviewView />}
          {tab === "pipeline" && <PipelineView />}
          {tab === "chatbot" && <ChatBotView />}
        </div>
      </div>
    </div>
  );
}

export default App;
