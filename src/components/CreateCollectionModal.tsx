import { useState } from "react";
import type { DocType } from "../../shared/types";

const DOC_TYPES: { value: DocType; label: string; hint: string }[] = [
  { value: "report", label: "Financial Report", hint: "PDF annual reports, P&L, balance sheets" },
  { value: "ledger", label: "Account Ledger", hint: "Excel spreadsheets with transactions" },
  { value: "statement", label: "Bank Statement", hint: "Scanned or photographed statements" },
];

interface CreateCollectionModalProps {
  onClose: () => void;
  onCreate: (name: string, docType: DocType) => Promise<void>;
}

export function CreateCollectionModal({
  onClose,
  onCreate,
}: CreateCollectionModalProps) {
  const [name, setName] = useState("");
  const [docType, setDocType] = useState<DocType>("report");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onCreate(name.trim(), docType);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="create-collection-title"
      >
        <h2 id="create-collection-title" className="modal-title">
          New Collection
        </h2>
        <p className="modal-subtitle">
          Choose a schema type — all documents in this collection will extract
          the same fields
        </p>

        <form onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="collection-name">
            Name
          </label>
          <input
            id="collection-name"
            className="field-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Annual Reports FY25"
            autoFocus
          />

          <span className="field-label">Schema type</span>
          <div className="schema-options">
            {DOC_TYPES.map((opt) => (
              <label
                key={opt.value}
                className={`schema-option${docType === opt.value ? " selected" : ""}`}
              >
                <input
                  type="radio"
                  name="docType"
                  value={opt.value}
                  checked={docType === opt.value}
                  onChange={() => setDocType(opt.value)}
                />
                <span className="schema-option-label">{opt.label}</span>
                <span className="schema-option-hint">{opt.hint}</span>
              </label>
            ))}
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!name.trim() || busy}
            >
              {busy ? "Creating…" : "Create Collection"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
