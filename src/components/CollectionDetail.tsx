import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AnalyticsQueryResult, CollectionSummary, DocType } from "../../shared/types";
import { CollectionTable } from "./CollectionTable";
import { DropZone } from "./DropZone";
import { BackIcon } from "./icons";
import { SqlPanel } from "./SqlPanel";

const DOC_TYPE_LABELS: Record<DocType, string> = {
  report: "Financial Report",
  ledger: "Account Ledger",
  statement: "Bank Statement",
};

const DOC_TYPE_SQL_DEFAULTS: Record<DocType, string> = {
  report: `-- Portfolio summary: revenue and profitability by company
SELECT
  company_name,
  report_type,
  COUNT(*) AS filings,
  ROUND(SUM(COALESCE(revenue, 0)), 2) AS total_revenue,
  ROUND(SUM(COALESCE(net_income, 0)), 2) AS total_net_income,
  ROUND(AVG(NULLIF(net_income, 0)), 2) AS avg_net_income
FROM read_parquet('GOLD_GLOB')
WHERE company_name IS NOT NULL AND company_name != ''
GROUP BY company_name, report_type
ORDER BY total_revenue DESC`,
  ledger: `-- Ledger roll-up: debit/credit activity by account
SELECT
  account_id,
  COUNT(*) AS entries,
  ROUND(SUM(COALESCE(debit, 0)), 2) AS total_debit,
  ROUND(SUM(COALESCE(credit, 0)), 2) AS total_credit,
  ROUND(MAX(COALESCE(balance, 0)), 2) AS closing_balance
FROM read_parquet('GOLD_GLOB')
WHERE account_id IS NOT NULL AND account_id != ''
GROUP BY account_id
ORDER BY total_debit DESC`,
  statement: `-- Cash-flow snapshot: transaction volume by account holder
SELECT
  account_holder,
  COUNT(*) AS transactions,
  ROUND(SUM(COALESCE(amount, 0)), 2) AS total_amount,
  ROUND(AVG(COALESCE(amount, 0)), 2) AS avg_transaction,
  ROUND(MAX(COALESCE(balance, 0)), 2) AS peak_balance
FROM read_parquet('GOLD_GLOB')
WHERE account_holder IS NOT NULL AND account_holder != ''
GROUP BY account_holder
ORDER BY total_amount DESC`,
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

  const sqlDefault =
    DOC_TYPE_SQL_DEFAULTS[collection.docType as DocType] ??
    DOC_TYPE_SQL_DEFAULTS.report;

  return (
    <div className="collection-detail">
      <div className="collection-detail-header">
        <button type="button" className="btn btn-ghost back-btn" onClick={onBack}>
          <BackIcon />
          Collections
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

      <SqlPanel defaultSql={sqlDefault} collectionId={collection.id} />
    </div>
  );
}
