import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  FileDetail,
  FileRecord,
  PipelineFailure,
  PipelineMetrics,
} from "../shared/types";
import "./App.css";

const DEFAULT_SQL =
  "SELECT * FROM read_parquet('GOLD_GLOB') LIMIT 5";

type Tab = "pipeline" | "extraction";

function App() {
  const [tab, setTab] = useState<Tab>("pipeline");
  const [metrics, setMetrics] = useState<PipelineMetrics | null>(null);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string>("");
  const [fileDetail, setFileDetail] = useState<FileDetail | null>(null);
  const [sql, setSql] = useState(DEFAULT_SQL);
  const [sqlResult, setSqlResult] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [m, f] = await Promise.all([
      invoke<PipelineMetrics>("get_metrics"),
      invoke<FileRecord[]>("list_files"),
    ]);
    setMetrics(m);
    setFiles(f);
  }, []);

  useEffect(() => {
    refresh();
    const unsubs = [
      listen("metrics:update", () => refresh()),
      listen("file:completed", () => refresh()),
      listen("file:failed", () => refresh()),
    ];
    const interval = setInterval(refresh, 2000);
    return () => {
      unsubs.forEach((p) => p.then((u) => u()));
      clearInterval(interval);
    };
  }, [refresh]);

  useEffect(() => {
    if (!selectedFileId) return;
    invoke<FileDetail | null>("get_file_detail", { fileId: selectedFileId }).then(
      setFileDetail,
    );
  }, [selectedFileId, files]);

  async function handlePickFiles() {
    const selected = await open({
      multiple: true,
      directory: false,
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    await handleIngest(paths);
  }

  async function handleIngest(paths: string[]) {
    setBusy(true);
    try {
      await invoke("ingest_files", { paths });
      await invoke("process_batch");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleRunSql() {
    const result = await invoke<{ columns: string[]; rows: Record<string, unknown>[] }>(
      "run_analytics_query",
      { sql },
    );
    setSqlResult(JSON.stringify(result, null, 2));
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Smriti</h1>
        <p>Finance Document Ingestion — Bronze → Silver → Gold</p>
      </header>

      <div className="tabs">
        <button
          className={`tab ${tab === "pipeline" ? "active" : ""}`}
          onClick={() => setTab("pipeline")}
        >
          Pipeline
        </button>
        <button
          className={`tab ${tab === "extraction" ? "active" : ""}`}
          onClick={() => setTab("extraction")}
        >
          Extraction
        </button>
      </div>

      {tab === "pipeline" && (
        <>
          <div className="dropzone" onClick={handlePickFiles}>
            {busy ? "Processing..." : "Click to select files or drag & drop"}
          </div>

          <div className="metrics-grid">
            <MetricCard label="Files Ingested" value={metrics?.totalFiles ?? 0} />
            <MetricCard
              label="Completed"
              value={metrics?.completed ?? 0}
              className="good"
            />
            <MetricCard label="Failed" value={metrics?.failed ?? 0} className="bad" />
            <MetricCard
              label="Accuracy"
              value={`${(metrics?.accuracyPct ?? 0).toFixed(1)}%`}
            />
            <MetricCard
              label="Validation Pass"
              value={`${(metrics?.validationPassRate ?? 0).toFixed(1)}%`}
            />
            <MetricCard
              label="AI / Deterministic"
              value={`${metrics?.aiParsed ?? 0} / ${metrics?.deterministicParsed ?? 0}`}
            />
          </div>

          <div className="file-list">
            <h3>Files</h3>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Parser</th>
                  <th>Accuracy</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.id ?? f.fileName}>
                    <td>{f.fileName}</td>
                    <td>
                      <span className={`badge ${f.status}`}>{f.status}</span>
                    </td>
                    <td>
                      {f.parserPath && (
                        <span className={`badge ${f.parserPath}`}>
                          {f.parserPath === "deterministic" ? "Deterministic ⚡" : "AI Learned"}
                        </span>
                      )}
                    </td>
                    <td>
                      {f.accuracyPct != null ? `${f.accuracyPct.toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(metrics?.recentFailures?.length ?? 0) > 0 && (
            <div className="failures-table" style={{ marginTop: "1.5rem" }}>
              <h3>Recent Failures</h3>
              <table>
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Error</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics!.recentFailures.map((f: PipelineFailure, i: number) => (
                    <tr key={i}>
                      <td>{f.fileName}</td>
                      <td>{f.errorCode}</td>
                      <td>{f.timestamp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === "extraction" && (
        <>
          <div style={{ marginBottom: "1rem" }}>
            <select
              value={selectedFileId}
              onChange={(e) => setSelectedFileId(e.target.value)}
              style={{ padding: "0.5rem", minWidth: "300px" }}
            >
              <option value="">Select a file...</option>
              {files
                .filter((f) => f.status === "completed")
                .map((f) => (
                  <option key={f.id ?? f.fileName} value={f.id}>
                    {f.fileName}
                  </option>
                ))}
            </select>
          </div>

          <div className="extraction-grid">
            <div className="panel">
              <h3>Source</h3>
              <p>{fileDetail?.fileName ?? "—"}</p>
              <p style={{ fontSize: "0.75rem", color: "#64748b" }}>
                {fileDetail?.bronzePath}
              </p>
            </div>
            <div className="panel">
              <h3>Silver JSON</h3>
              <pre>{JSON.stringify(fileDetail?.silverJson ?? {}, null, 2)}</pre>
            </div>
            <div className="panel">
              <h3>Gold Row</h3>
              <pre>{JSON.stringify(fileDetail?.goldRow ?? {}, null, 2)}</pre>
            </div>
          </div>

          <div className="sql-panel">
            <h3>Analytics (DuckDB)</h3>
            <textarea value={sql} onChange={(e) => setSql(e.target.value)} />
            <button className="primary" onClick={handleRunSql}>
              Run Query
            </button>
            {sqlResult && <pre style={{ marginTop: "1rem" }}>{sqlResult}</pre>}
          </div>
        </>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string | number;
  className?: string;
}) {
  return (
    <div className="metric-card">
      <div className="label">{label}</div>
      <div className={`value ${className}`}>{value}</div>
    </div>
  );
}

export default App;
