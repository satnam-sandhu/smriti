import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ConnectorObject, ConnectorType } from "../../shared/types";
import { formatBytes } from "../utils/format";
import { ConnectorLogo } from "./ConnectorLogo";

interface ConnectorModalProps {
  onClose: () => void;
  /** Runs the pull + processing. Returns the number of files imported. */
  onImport: (
    connectorType: string,
    config: Record<string, string>,
    keys: string[] | null,
    prefix: string,
  ) => Promise<number>;
}

const CONNECTOR_SUBTITLES: Record<string, string> = {
  s3: "Amazon S3 bucket",
  gcs: "Google Cloud Storage",
  azure_blob: "Azure Blob container",
  gdrive: "Files, Docs & Sheets",
};

type Step = "select" | "configure";

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ConnectorModal({ onClose, onImport }: ConnectorModalProps) {
  const [step, setStep] = useState<Step>("select");
  const [types, setTypes] = useState<ConnectorType[]>([]);
  const [selectedType, setSelectedType] = useState<string>("");
  const [config, setConfig] = useState<Record<string, string>>({});
  const [objects, setObjects] = useState<ConnectorObject[] | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [browsing, setBrowsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    invoke<{ connectors: ConnectorType[] }>("list_connector_types")
      .then((res) => {
        if (!active) return;
        setTypes(res.connectors);
      })
      .catch((e) => active && setError(String(e)));
    return () => {
      active = false;
    };
  }, []);

  const activeType = useMemo(
    () => types.find((t) => t.type === selectedType) ?? null,
    [types, selectedType],
  );

  // Each connector exposes its own "prefix" config field, so import/browse
  // scoping is driven from config rather than a separate input.
  const prefix = (config.prefix ?? "").trim();

  function selectType(type: string) {
    setSelectedType(type);
    setConfig({});
    setObjects(null);
    setSelectedKeys(new Set());
    setError(null);
    setStep("configure");
  }

  function goBack() {
    setStep("select");
    setObjects(null);
    setSelectedKeys(new Set());
    setError(null);
  }

  function missingRequired(): boolean {
    if (!activeType) return true;
    return activeType.configSchema.some(
      (f) => f.required && !(config[f.name] ?? "").trim(),
    );
  }

  async function handleBrowse() {
    if (!activeType || missingRequired()) return;
    setBrowsing(true);
    setError(null);
    try {
      const res = await invoke<{ objects: ConnectorObject[] }>(
        "connector_list_objects",
        { connectorType: selectedType, config, prefix },
      );
      setObjects(res.objects);
      setSelectedKeys(new Set(res.objects.map((o) => o.key)));
    } catch (e) {
      setError(String(e));
      setObjects(null);
    } finally {
      setBrowsing(false);
    }
  }

  function toggleKey(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    if (!objects) return;
    setSelectedKeys((prev) =>
      prev.size === objects.length ? new Set() : new Set(objects.map((o) => o.key)),
    );
  }

  async function handleImport() {
    if (!activeType || missingRequired()) return;
    // If the user browsed, import exactly their selection; otherwise import
    // everything under the prefix.
    const keys = objects ? [...selectedKeys] : null;
    if (objects && keys && keys.length === 0) {
      setError("Select at least one object to import.");
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const count = await onImport(selectedType, config, keys, prefix);
      if (count === 0) {
        setError("No matching objects found.");
        return;
      }
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setImporting(false);
    }
  }

  const allSelected = objects != null && selectedKeys.size === objects.length;

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal connector-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="connector-modal-title"
      >
        {step === "select" ? (
          <>
            <h2 id="connector-modal-title" className="modal-title">
              Import from cloud
            </h2>
            <p className="modal-subtitle">
              Choose a source to pull documents from.
            </p>

            <div className="connector-list-select">
              {types.length === 0 && <span className="connector-empty">Loading sources…</span>}
              {types.map((t) => (
                <button
                  key={t.type}
                  type="button"
                  className="connector-row"
                  onClick={() => selectType(t.type)}
                >
                  <span className="connector-row-logo">
                    <ConnectorLogo type={t.type} />
                  </span>
                  <span className="connector-row-text">
                    <span className="connector-row-label">{t.label}</span>
                    <span className="connector-row-sub">{CONNECTOR_SUBTITLES[t.type] ?? "Remote source"}</span>
                  </span>
                  <span className="connector-row-chevron" aria-hidden>
                    <ChevronIcon />
                  </span>
                </button>
              ))}
            </div>

            {error && <p className="connector-error">{error}</p>}

            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <button type="button" className="connector-back-btn" onClick={goBack}>
              <BackIcon />
              Change source
            </button>

            <div className="connector-form-header">
              <span className="connector-row-logo">
                <ConnectorLogo type={selectedType} />
              </span>
              <span className="connector-row-text">
                <span className="connector-row-label">{activeType?.label}</span>
                <span className="connector-row-sub">{CONNECTOR_SUBTITLES[selectedType] ?? "Remote source"}</span>
              </span>
            </div>

            {activeType && (
              <div className="connector-config">
                {activeType.configSchema.map((f) => (
                  <label key={f.name} className="connector-field">
                    <span className="field-label">
                      {f.label}
                      {f.required && <span className="required-star"> *</span>}
                    </span>
                    <input
                      className="field-input"
                      type={f.secret ? "password" : "text"}
                      value={config[f.name] ?? ""}
                      placeholder={f.help}
                      autoComplete="off"
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, [f.name]: e.target.value }))
                      }
                    />
                  </label>
                ))}
              </div>
            )}

            <div className="connector-browse-row">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleBrowse}
                disabled={browsing || missingRequired()}
              >
                {browsing ? "Browsing…" : "Browse objects"}
              </button>
              <span className="connector-hint">
                Browse to pick specific files, or import everything under the prefix.
              </span>
            </div>

            {objects != null && (
              <div className="connector-objects">
                {objects.length === 0 ? (
                  <p className="connector-empty">No objects found under this prefix.</p>
                ) : (
                  <>
                    <label className="connector-object connector-object-head">
                      <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                      <span className="connector-object-name">
                        {selectedKeys.size} of {objects.length} selected
                      </span>
                    </label>
                    <div className="connector-object-list">
                      {objects.map((o) => (
                        <label key={o.key} className="connector-object">
                          <input
                            type="checkbox"
                            checked={selectedKeys.has(o.key)}
                            onChange={() => toggleKey(o.key)}
                          />
                          <span className="connector-object-name">{o.name}</span>
                          {o.size != null && (
                            <span className="connector-object-size">{formatBytes(o.size)}</span>
                          )}
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {error && <p className="connector-error">{error}</p>}

            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleImport}
                disabled={importing || missingRequired()}
              >
                {importing ? "Importing…" : "Import"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
