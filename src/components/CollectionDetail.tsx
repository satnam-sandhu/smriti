import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AnalyticsQueryResult, CollectionSummary, DocType } from "../../shared/types";
import { CollectionTable } from "./CollectionTable";
import { DropZone } from "./DropZone";
import { SqlPanel } from "./SqlPanel";

const DOC_TYPE_LABELS: Record<DocType, string> = {
  report: "Financial Report",
  ledger: "Account Ledger",
  statement: "Bank Statement",
};

interface CollectionDetailProps {
  collection: CollectionSummary;
  onBack: () => void;
  onRefresh: () => Promise<void>;
}

export function CollectionDetail({
  collection,
  onBack,
  onRefresh,
}: CollectionDetailProps) {
  const [table, setTable] = useState<AnalyticsQueryResult | null>(null);
  const [tableLoading, setTableLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [processingCount, setProcessingCount] = useState(0);
  const ingestingRef = useRef(false);

  const loadTable = useCallback(async () => {
    setTableLoading(true);
    try {
      const data = await invoke<AnalyticsQueryResult>("get_collection_table", {
        collectionId: collection.id,
      });
      setTable(data);
    } finally {
      setTableLoading(false);
    }
  }, [collection.id]);

  useEffect(() => {
    loadTable();
    const unsubs = [
      listen("file:completed", () => loadTable()),
      listen("file:failed", () => loadTable()),
      listen("collections:updated", () => loadTable()),
    ];
    return () => {
      unsubs.forEach((p) => p.then((u) => u()));
    };
  }, [loadTable]);

  const handleIngest = useCallback(
    async (paths: string[]) => {
      if (ingestingRef.current) return;
      ingestingRef.current = true;

      const uniquePaths = [...new Set(paths)];
      setBusy(true);
      setProcessingCount(uniquePaths.length);
      try {
        const ids = await invoke<string[]>("ingest_files", {
          collectionId: collection.id,
          paths: uniquePaths,
        });
        await invoke("process_batch", { fileIds: ids });
        await Promise.all([loadTable(), onRefresh()]);
      } finally {
        setBusy(false);
        setProcessingCount(0);
        ingestingRef.current = false;
      }
    },
    [collection.id, loadTable, onRefresh],
  );

  const sqlDefault = `SELECT * FROM read_parquet('gold/collections/${collection.id}/*.parquet')`;

  return (
    <div className="collection-detail">
      <div className="collection-detail-header">
        <button type="button" className="btn btn-ghost back-btn" onClick={onBack}>
          ? Collections
        </button>
        <div className="collection-detail-meta">
          <h2 className="collection-detail-name">{collection.name}</h2>
          <span className={`doc-type-badge ${collection.docType}`}>
            {DOC_TYPE_LABELS[collection.docType as DocType] ?? collection.docType}
          </span>
        </div>
        <div className="collection-detail-stats">
          <span>
            <strong>{collection.completed}</strong> rows
          </span>
          {collection.failed > 0 && (
            <span className="stat-failed">{collection.failed} failed</span>
          )}
        </div>
      </div>

      <DropZone busy={busy} processingCount={processingCount} onIngest={handleIngest} />

      <div className="card collection-data-card">
        <div className="card-header">
          <h3>Extracted Data</h3>
          <span className="card-count">
            {table?.rows.length ?? 0} row{(table?.rows.length ?? 0) !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="card-body collection-table-body">
          <CollectionTable data={table} loading={tableLoading} />
        </div>
      </div>

      <SqlPanel defaultSql={sqlDefault} />
    </div>
  );
}
