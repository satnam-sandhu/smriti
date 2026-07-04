import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ConnectorField, ConnectorType } from "../../shared/types";
import { ConnectorLogo } from "./ConnectorLogo";

interface ExportModalProps {
  onClose: () => void;
}

const CLOUD_SUBTITLES: Record<string, string> = {
  s3: "Amazon S3 bucket",
  gcs: "Google Cloud Storage",
  azure_blob: "Azure Blob container",
  gdrive: "Google Drive folder",
};

const DATABASE_DESTINATIONS: ConnectorType[] = [
  {
    type: "postgres",
    label: "PostgreSQL",
    configSchema: [
      { name: "host", label: "Host", required: true, secret: false, help: "db.example.com" },
      { name: "port", label: "Port", required: false, secret: false, help: "5432" },
      { name: "database", label: "Database", required: true, secret: false, help: "analytics" },
      { name: "schema", label: "Schema", required: false, secret: false, help: "public" },
      { name: "table", label: "Table", required: true, secret: false, help: "extracted_data" },
      { name: "username", label: "Username", required: true, secret: false, help: "" },
      { name: "password", label: "Password", required: true, secret: true, help: "" },
    ],
  },
  {
    type: "mysql",
    label: "MySQL",
    configSchema: [
      { name: "host", label: "Host", required: true, secret: false, help: "db.example.com" },
      { name: "port", label: "Port", required: false, secret: false, help: "3306" },
      { name: "database", label: "Database", required: true, secret: false, help: "analytics" },
      { name: "table", label: "Table", required: true, secret: false, help: "extracted_data" },
      { name: "username", label: "Username", required: true, secret: false, help: "" },
      { name: "password", label: "Password", required: true, secret: true, help: "" },
    ],
  },
];

const EXPORT_FORMATS = [
  { value: "parquet", label: "Parquet", hint: "Columnar, best for analytics pipelines" },
  { value: "csv", label: "CSV", hint: "Universal spreadsheet format" },
  { value: "json", label: "JSON", hint: "Row-oriented JSON lines" },
] as const;

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

function destinationSubtitle(type: string): string {
  if (type === "postgres" || type === "mysql") return "External relational database";
  return CLOUD_SUBTITLES[type] ?? "Remote destination";
}

export function ExportModal({ onClose }: ExportModalProps) {
  const [step, setStep] = useState<Step>("select");
  const [cloudTypes, setCloudTypes] = useState<ConnectorType[]>([]);
  const [selectedType, setSelectedType] = useState<string>("");
  const [config, setConfig] = useState<Record<string, string>>({});
  const [format, setFormat] = useState<(typeof EXPORT_FORMATS)[number]["value"]>("parquet");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    invoke<{ connectors: ConnectorType[] }>("list_connector_types")
      .then((res) => {
        if (!active) return;
        setCloudTypes(res.connectors);
      })
      .catch((e) => active && setError(String(e)));
    return () => {
      active = false;
    };
  }, []);

  const destinations = useMemo(
    () => [...cloudTypes, ...DATABASE_DESTINATIONS],
    [cloudTypes],
  );

  const activeDestination = useMemo(
    () => destinations.find((d) => d.type === selectedType) ?? null,
    [destinations, selectedType],
  );

  function selectType(type: string) {
    setSelectedType(type);
    setConfig({});
    setFormat("parquet");
    setError(null);
    setStep("configure");
  }

  function goBack() {
    setStep("select");
    setError(null);
  }

  function missingRequired(schema: ConnectorField[]): boolean {
    return schema.some((f) => f.required && !(config[f.name] ?? "").trim());
  }

  function handleExport() {
    if (!activeDestination || missingRequired(activeDestination.configSchema)) return;
    setError("Export is not available yet — destination wiring comes next.");
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal connector-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="export-modal-title"
      >
        {step === "select" ? (
          <>
            <h2 id="export-modal-title" className="modal-title">
              Export data
            </h2>
            <p className="modal-subtitle">
              Choose a destination to push extracted data to.
            </p>

            <div className="connector-list-select">
              {destinations.length === 0 && (
                <span className="connector-empty">Loading destinations…</span>
              )}
              {destinations.map((d) => (
                <button
                  key={d.type}
                  type="button"
                  className="connector-row"
                  onClick={() => selectType(d.type)}
                >
                  <span className="connector-row-logo">
                    <ConnectorLogo type={d.type} />
                  </span>
                  <span className="connector-row-text">
                    <span className="connector-row-label">{d.label}</span>
                    <span className="connector-row-sub">{destinationSubtitle(d.type)}</span>
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
              Change destination
            </button>

            <div className="connector-form-header">
              <span className="connector-row-logo">
                <ConnectorLogo type={selectedType} />
              </span>
              <span className="connector-row-text">
                <span className="connector-row-label">{activeDestination?.label}</span>
                <span className="connector-row-sub">{destinationSubtitle(selectedType)}</span>
              </span>
            </div>

            <div className="export-format-row">
              <span className="field-label">Export format</span>
              <div className="export-format-options">
                {EXPORT_FORMATS.map((f) => (
                  <label key={f.value} className="export-format-option">
                    <input
                      type="radio"
                      name="export-format"
                      value={f.value}
                      checked={format === f.value}
                      onChange={() => setFormat(f.value)}
                    />
                    <span className="export-format-label">{f.label}</span>
                    <span className="export-format-hint">{f.hint}</span>
                  </label>
                ))}
              </div>
            </div>

            {activeDestination && (
              <div className="connector-config">
                {activeDestination.configSchema.map((f) => (
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

            {error && <p className="connector-error">{error}</p>}

            <p className="export-coming-soon">
              Export wiring is UI-only for now — pick a destination and format to preview the flow.
            </p>

            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleExport}
                disabled={!activeDestination || missingRequired(activeDestination.configSchema)}
              >
                Export
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
