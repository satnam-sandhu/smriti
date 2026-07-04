import type { CollectionSummary, DocType } from "../../shared/types";

const DOC_TYPE_LABELS: Record<DocType, string> = {
  report: "Financial Report",
  ledger: "Account Ledger",
  statement: "Bank Statement",
};

interface CollectionListProps {
  collections: CollectionSummary[];
  loading: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
}

export function CollectionList({
  collections,
  loading,
  onSelect,
  onCreate,
}: CollectionListProps) {
  return (
    <div className="collections-page">
      <div className="collections-header">
        <div>
          <h2 className="collections-title">Collections</h2>
          <p className="collections-subtitle">
            Group documents and view extracted data as a table
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={onCreate}>
          New Collection
        </button>
      </div>

      {loading ? (
        <div className="empty-state">
          <p className="empty-state-title">Loading collections…</p>
        </div>
      ) : collections.length === 0 ? (
        <div className="empty-state collections-empty">
          <p className="empty-state-title">No collections yet</p>
          <p className="empty-state-desc">
            Create a collection, pick a schema, then drop documents into it
          </p>
          <button type="button" className="btn btn-primary" onClick={onCreate}>
            Create your first collection
          </button>
        </div>
      ) : (
        <div className="collection-grid">
          {collections.map((c) => (
            <button
              key={c.id}
              type="button"
              className="collection-card"
              onClick={() => onSelect(c.id)}
            >
              <div className="collection-card-top">
                <span className={`doc-type-badge ${c.docType}`}>
                  {DOC_TYPE_LABELS[c.docType as DocType] ?? c.docType}
                </span>
                {c.inProgress > 0 && (
                  <span className="badge processing">processing</span>
                )}
              </div>
              <h3 className="collection-card-name">{c.name}</h3>
              <div className="collection-card-stats">
                <span>
                  <strong>{c.completed}</strong> rows
                </span>
                {c.failed > 0 && (
                  <span className="stat-failed">
                    <strong>{c.failed}</strong> failed
                  </span>
                )}
                <span className="stat-muted">
                  {c.totalFiles} file{c.totalFiles !== 1 ? "s" : ""}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
