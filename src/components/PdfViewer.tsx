import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";

GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

interface PdfViewerProps {
  filePath: string;
  className?: string;
}

export function PdfViewer({ filePath, className = "" }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [filePath]);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      setLoading(true);
      setError(null);

      try {
        const url = convertFileSrc(filePath);
        const pdf = await getDocument({ url, verbosity: 0 }).promise;
        if (cancelled) return;

        setPageCount(pdf.numPages);
        const safePage = Math.min(Math.max(page, 1), pdf.numPages);
        const pdfPage = await pdf.getPage(safePage);
        if (cancelled) return;

        const canvas = canvasRef.current;
        const wrap = wrapRef.current;
        if (!canvas || !wrap) return;

        const baseViewport = pdfPage.getViewport({ scale: 1 });
        const width = wrap.clientWidth || 480;
        const scale = width / baseViewport.width;
        const viewport = pdfPage.getViewport({ scale });

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas unavailable");

        await pdfPage.render({ canvasContext: ctx, viewport }).promise;
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setPageCount(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void render();
    return () => {
      cancelled = true;
    };
  }, [filePath, page]);

  if (error) {
    return (
      <div className={`pdf-viewer pdf-viewer-error ${className}`}>
        <p className="pdf-viewer-error-title">PDF preview unavailable</p>
        <p className="pdf-viewer-error-desc">{error}</p>
      </div>
    );
  }

  return (
    <div className={`pdf-viewer ${className}`}>
      <div ref={wrapRef} className="pdf-viewer-canvas-wrap">
        {loading && <p className="pdf-viewer-loading">Loading PDF...</p>}
        <canvas ref={canvasRef} className="pdf-viewer-canvas" />
      </div>
      {pageCount > 1 && (
        <div className="pdf-viewer-controls">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span className="pdf-viewer-page-label">
            Page {page} of {pageCount}
          </span>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={page >= pageCount || loading}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
