import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AnalyticsQueryResult, FileDetail } from "../../shared/types";
import { FilePreviewModal } from "./FilePreviewModal";

interface CollectionTableProps {
  data: AnalyticsQueryResult | null;
  loading: boolean;
}

interface PreviewState {
  fileName: string;
  filePath: string;
}

function formatCell(val: unknown): string {
  if (val == null || val === "") return "-";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

function humanizeColumn(col: string): string {
  if (col.startsWith("_")) return col.slice(1).replace(/_/g, " ");
  return col.replace(/_/g, " ");
}

export function CollectionTable({ data, loading }: CollectionTableProps) {
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  async function openPreview(fileId: string, fileName: string) {
    setPreviewLoading(true);
    try {
      const detail = await invoke<FileDetail | null>("get_file_detail", {
        fileId,
      });
      if (detail?.bronzePath) {
        setPreview({ fileName, filePath: detail.bronzePath });
      }
    } finally {
      setPreviewLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="empty-state">
        <p className="empty-state-title">Loading data...</p>
      </div>
    );
  }

  if (!data || data.rows.length === 0) {
    return (
      <div className="empty-state">
        <p className="empty-state-title">No data yet</p>
        <p className="empty-state-desc">
          Drop documents above. Each file becomes one row in this table.
        </p>
      </div>
    );
  }

  const displayColumns = data.columns.filter(
    (c) => !c.startsWith("_") || c === "_file_name" || c === "_parser_path",
  );

  return (
    <>
      <div className="collection-table-wrap">
        <table className="data-table collection-table">
          <thead>
            <tr>
              {displayColumns.map((col) => (
                <th key={col}>{humanizeColumn(col)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, i) => (
              <tr key={i}>
                {displayColumns.map((col) => (
                  <td key={col}>
                    {col === "_parser_path" && row[col] ? (
                      <span
                        className={`badge ${row[col] === "deterministic" ? "deterministic" : "ai"}`}
                      >
                        {row[col] === "deterministic" ? "Deterministic" : "AI Learned"}
                      </span>
                    ) : col === "_file_name" && row._file_id ? (
                      <button
                        type="button"
                        className="file-name-link"
                        disabled={previewLoading}
                        title={formatCell(row[col])}
                        onClick={() =>
                          openPreview(String(row._file_id), formatCell(row[col]))
                        }
                      >
                        {formatCell(row[col])}
                      </button>
                    ) : (
                      formatCell(row[col])
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {preview && (
        <FilePreviewModal
          fileName={preview.fileName}
          filePath={preview.filePath}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}
