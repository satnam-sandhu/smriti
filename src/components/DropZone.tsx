import { useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";

interface DropZoneProps {
  busy: boolean;
  processingCount: number;
  onIngest: (paths: string[]) => Promise<void>;
}

const FORMATS = ["PDF", "Excel", "CSV", "Images"];

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M12 16V4m0 0l-4 4m4-4l4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 20h16" strokeLinecap="round" />
    </svg>
  );
}

export function DropZone({ busy, processingCount, onIngest }: DropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (cancelled) return;
        const { payload } = event;
        if (payload.type === "enter" || payload.type === "over") {
          setDragOver(true);
        } else if (payload.type === "leave") {
          setDragOver(false);
        } else if (payload.type === "drop") {
          setDragOver(false);
          if (payload.paths.length > 0 && !busyRef.current) {
            void onIngest(payload.paths);
          }
        }
      })
      .then((fn) => {
        if (cancelled) {
          fn();
          return;
        }
        unlisten = fn;
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [onIngest]);

  async function handleClick() {
    if (busy) return;
    const selected = await open({ multiple: true, directory: false });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    await onIngest(paths);
  }

  const className = [
    "dropzone",
    dragOver ? "drag-over" : "",
    busy ? "processing" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={className}
      onClick={handleClick}
      onKeyDown={(e) => e.key === "Enter" && handleClick()}
      role="button"
      tabIndex={0}
      aria-busy={busy}
    >
      {busy ? (
        <div className="dropzone-busy">
          <div className="spinner" aria-hidden />
          <div className="dropzone-busy-text">
            <p>
              Processing {processingCount} document
              {processingCount !== 1 ? "s" : ""}
            </p>
            <span>Parsing, validating, and writing to Gold layer...</span>
            <div className="progress-bar">
              <div className="progress-bar-fill" />
            </div>
          </div>
        </div>
      ) : (
        <div className="dropzone-inner">
          <div className="dropzone-icon">
            <UploadIcon />
          </div>
          <div className="dropzone-text">
            <p className="dropzone-title">Drop documents to ingest</p>
            <p className="dropzone-hint">
              Drag files here or click to browse your filesystem
            </p>
            <div className="dropzone-formats">
              {FORMATS.map((f) => (
                <span key={f} className="format-chip">
                  {f}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
