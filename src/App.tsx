import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { PipelineMetrics } from "../shared/types";
import { CollectionsView } from "./components/CollectionsView";
import { FailuresTable } from "./components/FailuresTable";
import { MetricsDashboard } from "./components/MetricsDashboard";
import { formatBytes } from "./utils/format";
import "./App.css";

type Tab = "pipeline" | "collections";

function PipelineIcon() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" />
    </svg>
  );
}

function CollectionsIcon() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <div className="brand-icon">S</div>
            <div>
              <h1>Smriti</h1>
              <p>Document Intelligence</p>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
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
            className={`nav-item ${tab === "pipeline" ? "active" : ""}`}
            onClick={() => setTab("pipeline")}
          >
            <PipelineIcon />
            Pipeline
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="live-indicator">
            <span className="live-dot" />
            Pipeline connected
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div>
            <h2 className="topbar-title">
              {tab === "collections" ? "Collections" : "Pipeline Health"}
            </h2>
            <p className="topbar-subtitle">
              {tab === "collections"
                ? "Organize documents and view extracted data"
                : "System-wide ingestion metrics and failures"}
            </p>
          </div>
          {metrics && (
            <div className="topbar-stats">
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

        <div className="content">
          {tab === "collections" && <CollectionsView />}

          {tab === "pipeline" && (
            <div className="pipeline-view">
              <MetricsDashboard metrics={metrics} />
              <FailuresTable failures={metrics?.recentFailures ?? []} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
