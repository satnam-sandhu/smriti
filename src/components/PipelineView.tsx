import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { PipelineStats } from "../../shared/types";
import { FailuresTable } from "./FailuresTable";
import { MetricCard } from "./MetricCard";
import { Pagination } from "./Pagination";
import {
  formatBytes,
  formatCost,
  formatTimestamp,
  formatTokens,
  toDateInputValue,
  truncate,
} from "../utils/format";

type DatePreset = "all" | "today" | "7d" | "30d" | "custom";

function presetRange(preset: DatePreset): { start?: string; end?: string } {
  const today = new Date();
  const end = toDateInputValue(today);
  if (preset === "all") return {};
  if (preset === "today") return { start: end, end };
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (preset === "7d" ? 6 : 29));
  return { start: toDateInputValue(startDate), end };
}

function statusBadgeClass(status: string): string {
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  if (status === "processing") return "processing";
  return "queued";
}

export function PipelineView() {
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState<DatePreset>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [activityPage, setActivityPage] = useState(1);
  const [activityPageSize, setActivityPageSize] = useState(10);
  const [failuresPage, setFailuresPage] = useState(1);
  const [failuresPageSize, setFailuresPageSize] = useState(5);

  const range = useMemo(() => {
    if (preset === "custom") {
      return {
        start: customStart || undefined,
        end: customEnd || undefined,
      };
    }
    return presetRange(preset);
  }, [preset, customStart, customEnd]);

  const rangeLabel = useMemo(() => {
    if (!range.start && !range.end) return "All time";
    if (range.start === range.end) return range.start ?? "Today";
    if (range.start && range.end) return `${range.start} to ${range.end}`;
    return range.start ?? range.end ?? "Filtered";
  }, [range]);

  useEffect(() => {
    setActivityPage(1);
    setFailuresPage(1);
  }, [range.start, range.end]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke<PipelineStats>("get_pipeline_stats", {
        startDate: range.start ?? null,
        endDate: range.end ?? null,
        activityPage,
        activityPageSize,
        failuresPage,
        failuresPageSize,
      });
      setStats(data);
    } finally {
      setLoading(false);
    }
  }, [
    range.start,
    range.end,
    activityPage,
    activityPageSize,
    failuresPage,
    failuresPageSize,
  ]);

  useEffect(() => {
    load();
    const unsubs = [
      listen("metrics:update", () => load()),
      listen("file:completed", () => load()),
      listen("file:failed", () => load()),
    ];
    return () => {
      unsubs.forEach((p) => p.then((u) => u()));
    };
  }, [load]);

  const maxDaily = Math.max(...(stats?.dailyStats.map((d) => d.ingested) ?? [1]), 1);
  const maxErrors = Math.max(...(stats?.errorsByCode.map((e) => e.count) ?? [1]), 1);

  return (
    <div className="pipeline-view">
      <div className="pipeline-toolbar">
        <div className="pipeline-toolbar-left">
          <span className="pipeline-range-label">{rangeLabel}</span>
          <div className="pipeline-presets">
            {(
              [
                ["all", "All"],
                ["today", "Today"],
                ["7d", "7 days"],
                ["30d", "30 days"],
                ["custom", "Custom"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`review-filter-btn${preset === id ? " active" : ""}`}
                onClick={() => setPreset(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {preset === "custom" && (
          <div className="pipeline-custom-range">
            <input
              type="date"
              className="field-input pipeline-date-input"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
            />
            <span className="pipeline-date-sep">to</span>
            <input
              type="date"
              className="field-input pipeline-date-input"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
            />
          </div>
        )}
      </div>

      <section className="metrics-section">
        <div className="section-header">
          <h2 className="section-title">Throughput</h2>
          <p className="section-caption">{loading ? "Loading..." : rangeLabel}</p>
        </div>
        <div className="metrics-grid pipeline-metrics-grid">
          <MetricCard label="Files Ingested" value={stats?.totalFiles ?? 0} />
          <MetricCard label="Completed" value={stats?.completed ?? 0} className="good" />
          <MetricCard label="Failed" value={stats?.failed ?? 0} className="bad" />
          <MetricCard label="In Progress" value={stats?.inProgress ?? 0} />
          <MetricCard
            label="Pass Rate"
            value={`${(stats?.validationPassRate ?? 0).toFixed(1)}%`}
            animate={false}
          />
          <MetricCard
            label="Volume"
            value={formatBytes(stats?.totalBytes ?? 0)}
            animate={false}
          />
        </div>
      </section>

      <section className="metrics-section">
        <div className="section-header">
          <h2 className="section-title">AI Usage & Cost</h2>
          <p className="section-caption">
            {stats?.llmCalls ?? 0} LLM calls in period
          </p>
        </div>
        <div className="metrics-grid pipeline-ai-grid">
          <MetricCard
            label="Total Tokens"
            value={formatTokens(stats?.totalTokens ?? 0)}
            animate={false}
          />
          <MetricCard
            label="Prompt Tokens"
            value={formatTokens(stats?.promptTokens ?? 0)}
            animate={false}
          />
          <MetricCard
            label="Completion Tokens"
            value={formatTokens(stats?.completionTokens ?? 0)}
            animate={false}
          />
          <MetricCard
            label="Est. AI Cost"
            value={formatCost(stats?.aiCostUsd ?? 0)}
            animate={false}
            className="warn"
          />
          <MetricCard label="AI Parsed" value={stats?.aiParsed ?? 0} animate={false} />
          <MetricCard
            label="Deterministic"
            value={stats?.deterministicParsed ?? 0}
            animate={false}
          />
        </div>
      </section>

      <div className="pipeline-panels">
        <div className="card pipeline-chart-card">
          <div className="card-header">
            <h3>Daily Volume</h3>
            <span className="card-count">{stats?.dailyStats.length ?? 0} days</span>
          </div>
          <div className="card-body pipeline-chart-body">
            {!stats?.dailyStats.length ? (
              <div className="empty-state">
                <p className="empty-state-title">No activity in range</p>
              </div>
            ) : (
              <div className="pipeline-bars">
                {[...stats.dailyStats].reverse().map((day) => (
                  <div key={day.date} className="pipeline-bar-col" title={`${day.date}: ${day.ingested} files`}>
                    <div className="pipeline-bar-stack">
                      <div
                        className="pipeline-bar completed"
                        style={{ height: `${(day.completed / maxDaily) * 100}%` }}
                      />
                      <div
                        className="pipeline-bar failed"
                        style={{ height: `${(day.failed / maxDaily) * 100}%` }}
                      />
                    </div>
                    <span className="pipeline-bar-label">{day.date.slice(5)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card pipeline-errors-card">
          <div className="card-header">
            <h3>Error Breakdown</h3>
          </div>
          <div className="card-body">
            {!stats?.errorsByCode.length ? (
              <div className="empty-state">
                <p className="empty-state-title">No errors in range</p>
              </div>
            ) : (
              <div className="pipeline-error-bars">
                {stats.errorsByCode.map((err) => (
                  <div key={err.errorCode} className="pipeline-error-row">
                    <span className="error-code">{err.errorCode}</span>
                    <div className="pipeline-error-track">
                      <div
                        className="pipeline-error-fill"
                        style={{ width: `${(err.count / maxErrors) * 100}%` }}
                      />
                    </div>
                    <span className="pipeline-error-count">{err.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card pipeline-activity-card">
        <div className="card-header">
          <h3>Processing Activity</h3>
          <span className="card-count">{stats?.activityTotal ?? 0}</span>
        </div>
        <div className="card-body">
          {!stats?.activityTotal ? (
            <div className="empty-state">
              <p className="empty-state-title">No files in range</p>
            </div>
          ) : (
            <>
              <table className="data-table pipeline-activity-table">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Status</th>
                    <th>Parser</th>
                    <th>Tokens</th>
                    <th>Cost</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.activity.map((row) => (
                    <tr key={row.fileId}>
                      <td title={row.fileName}>{truncate(row.fileName, 36)}</td>
                      <td>
                        <span className={`badge ${statusBadgeClass(row.status)}`}>
                          {row.status}
                        </span>
                      </td>
                      <td>
                        {row.parserPath ? (
                          <span
                            className={`badge ${row.parserPath === "deterministic" ? "deterministic" : "ai"}`}
                          >
                            {row.parserPath === "deterministic" ? "Deterministic" : "AI"}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>
                        {row.promptTokens + row.completionTokens > 0
                          ? formatTokens(row.promptTokens + row.completionTokens)
                          : "-"}
                      </td>
                      <td>{row.aiCostUsd > 0 ? formatCost(row.aiCostUsd) : "-"}</td>
                      <td style={{ color: "var(--text-muted)" }}>
                        {formatTimestamp(row.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination
                page={activityPage}
                pageSize={activityPageSize}
                total={stats.activityTotal}
                onPageChange={setActivityPage}
                onPageSizeChange={(size) => {
                  setActivityPageSize(size);
                  setActivityPage(1);
                }}
              />
            </>
          )}
        </div>
      </div>

      <FailuresTable
        failures={stats?.recentFailures ?? []}
        total={stats?.failuresTotal ?? 0}
        page={failuresPage}
        pageSize={failuresPageSize}
        onPageChange={setFailuresPage}
        onPageSizeChange={(size) => {
          setFailuresPageSize(size);
          setFailuresPage(1);
        }}
      />
    </div>
  );
}
