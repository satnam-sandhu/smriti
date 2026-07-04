import { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { PdfViewer } from "./PdfViewer";
import { getFileTypeInfo } from "../utils/fileType";

interface DocumentPreviewProps {
  filePath: string;
  fileName: string;
  className?: string;
}

export function DocumentPreview({
  filePath,
  fileName,
  className = "",
}: DocumentPreviewProps) {
  const [imgError, setImgError] = useState(false);
  const typeInfo = getFileTypeInfo(fileName);
  const isPdf = typeInfo.className === "type-pdf";
  const showImage = typeInfo.isImage && filePath && !imgError;

  if (isPdf && filePath) {
    return <PdfViewer filePath={filePath} className={className} />;
  }

  if (showImage) {
    return (
      <img
        src={convertFileSrc(filePath)}
        alt={fileName}
        className={`review-preview-image ${className}`}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div className={`review-preview-icon-wrap ${className}`}>
      <span className={`file-type-icon large ${typeInfo.className}`}>
        {typeInfo.label}
      </span>
    </div>
  );
}
