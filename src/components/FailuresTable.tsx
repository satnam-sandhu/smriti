import type { PipelineFailure } from "../../shared/types";
import { formatTimestamp } from "../utils/format";

interface FailuresTableProps {
  failures: PipelineFailure[];
}

export function FailuresTable({ failures }: FailuresTableProps) {
  return (
    <div className="card failures-panel">
      <div className="card-header">
        <h3>Recent Failures</h3>
        <span className="card-count">{failures.length}</span>
      </div>
      <div className="card-body">
        {failures.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state-title">No failures</p>
            <p className="empty-state-desc">
              Failed documents are quarantined automatically
            </p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Document</th>
                <th>Error</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {failures.map((f, i) => (
                <tr key={`${f.fileName}-${f.timestamp}-${i}`}>
                  <td>{f.fileName}</td>
                  <td>
                    <span className="error-code">{f.errorCode}</span>
                  </td>
                  <td style={{ color: "var(--text-muted)" }}>
                    {formatTimestamp(f.timestamp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
