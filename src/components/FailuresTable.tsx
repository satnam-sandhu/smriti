import type { PipelineFailure } from "../../shared/types";
import { formatTimestamp } from "../utils/format";
import { Pagination } from "./Pagination";

interface FailuresTableProps {
  failures: PipelineFailure[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export function FailuresTable({
  failures,
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: FailuresTableProps) {
  return (
    <div className="card failures-panel">
      <div className="card-header">
        <h3>Recent Failures</h3>
        <span className="card-count">{total}</span>
      </div>
      <div className="card-body">
        {total === 0 ? (
          <div className="empty-state">
            <p className="empty-state-title">No failures</p>
            <p className="empty-state-desc">
              Failed documents are quarantined automatically
            </p>
          </div>
        ) : (
          <>
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
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              pageSizeOptions={[5, 10, 25]}
              onPageChange={onPageChange}
              onPageSizeChange={onPageSizeChange}
            />
          </>
        )}
      </div>
    </div>
  );
}
