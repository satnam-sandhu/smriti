import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AnalyticsQueryResult } from "../../shared/types";
import { ChevronIcon } from "./icons";

interface SqlPanelProps {
  defaultSql: string;
  collectionId?: string;
}

function ResultsTable({ result }: { result: AnalyticsQueryResult }) {
  if (result.rows.length === 0) {
    return <p className="sql-empty">Query returned no rows.</p>;
  }

  return (
    <div className="sql-results-wrap">
      <table className="data-table sql-results">
        <thead>
          <tr>
            {result.columns.map((col) => (
              <th key={col}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, i) => (
            <tr key={i}>
              {result.columns.map((col) => (
                <td key={col}>{formatCell(row[col])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(val: unknown): string {
  if (val == null) return "-";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

export function SqlPanel({ defaultSql, collectionId }: SqlPanelProps) {
  const [open, setOpen] = useState(false);
  const [sql, setSql] = useState(defaultSql);
  const [result, setResult] = useState<AnalyticsQueryResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSql(defaultSql);
    setResult(null);
    setError(null);
  }, [defaultSql, collectionId]);

  async function handleRun() {
    setRunning(true);
    setError(null);
    try {
      const data = await invoke<AnalyticsQueryResult>("run_analytics_query", {
        sql,
        collectionId: collectionId ?? null,
      });
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setRunning(false);
    }
  }

  function handleReset() {
    setSql(defaultSql);
    setResult(null);
    setError(null);
  }

  return (
    <div className={`sql-panel${open ? " open" : ""}`}>
      <button
        type="button"
        className="sql-panel-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="sql-panel-toggle-left">
          <span>SQL Analytics</span>
          <span className="sql-badge">DuckDB</span>
        </span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div className="sql-panel-body">
          <textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            spellCheck={false}
            aria-label="SQL query"
          />
          <div className="sql-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleRun}
              disabled={running}
            >
              {running ? "Running..." : "Run Query"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={handleReset}>
              Reset
            </button>
          </div>
          {error && <p className="sql-error">{error}</p>}
          {result && (
            <div className="sql-results-section">
              <div className="sql-results-header">
                {result.rows.length} row{result.rows.length !== 1 ? "s" : ""} returned
              </div>
              <ResultsTable result={result} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
