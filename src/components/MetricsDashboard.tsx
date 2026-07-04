import type { PipelineMetrics } from "../../shared/types";
import { MetricCard } from "./MetricCard";

interface MetricsDashboardProps {
  metrics: PipelineMetrics | null;
  animate?: boolean;
}

export function MetricsDashboard({ metrics, animate = true }: MetricsDashboardProps) {
  const accuracy = `${(metrics?.accuracyPct ?? 0).toFixed(1)}%`;
  const validation = `${(metrics?.validationPassRate ?? 0).toFixed(1)}%`;
  const aiDet = `${metrics?.aiParsed ?? 0} / ${metrics?.deterministicParsed ?? 0}`;

  return (
    <section className="metrics-section">
      <div className="section-header">
        <h2 className="section-title">Key Metrics</h2>
        <p className="section-caption">Lifetime totals across all sessions</p>
      </div>
      <div className="metrics-grid">
        <MetricCard
          label="Files Ingested"
          value={metrics?.totalFiles ?? 0}
          animate={animate}
        />
        <MetricCard
          label="Completed"
          value={metrics?.completed ?? 0}
          className="good"
          animate={animate}
        />
        <MetricCard
          label="Failed"
          value={metrics?.failed ?? 0}
          className="bad"
          animate={animate}
        />
        <MetricCard label="Accuracy" value={accuracy} animate={false} />
        <MetricCard label="Validation Pass" value={validation} animate={false} />
        <MetricCard label="AI / Deterministic" value={aiDet} animate={false} />
      </div>
    </section>
  );
}
