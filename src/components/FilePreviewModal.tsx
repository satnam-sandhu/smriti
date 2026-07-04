import { DocumentPreview } from "./DocumentPreview";

interface FilePreviewModalProps {
  fileName: string;
  filePath: string;
  onClose: () => void;
}

export function FilePreviewModal({
  fileName,
  filePath,
  onClose,
}: FilePreviewModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal file-preview-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="file-preview-title"
      >
        <div className="file-preview-header">
          <div>
            <h2 id="file-preview-title" className="modal-title">
              {fileName}
            </h2>
            <p className="modal-subtitle">Source document preview</p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <DocumentPreview filePath={filePath} fileName={fileName} />
      </div>
    </div>
  );
}
