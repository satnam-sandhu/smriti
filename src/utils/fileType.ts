export interface FileTypeInfo {
  label: string;
  className: string;
  isImage: boolean;
}

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp"]);

const TYPE_MAP: Record<string, Omit<FileTypeInfo, "isImage">> = {
  pdf: { label: "PDF", className: "type-pdf" },
  xlsx: { label: "XLS", className: "type-xls" },
  xls: { label: "XLS", className: "type-xls" },
  csv: { label: "CSV", className: "type-csv" },
  json: { label: "JSON", className: "type-json" },
  png: { label: "IMG", className: "type-img" },
  jpg: { label: "IMG", className: "type-img" },
  jpeg: { label: "IMG", className: "type-img" },
  gif: { label: "IMG", className: "type-img" },
  webp: { label: "IMG", className: "type-img" },
};

export function getFileTypeInfo(fileName: string): FileTypeInfo {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const mapped = TYPE_MAP[ext];
  if (mapped) {
    return { ...mapped, isImage: IMAGE_EXTENSIONS.has(ext) };
  }
  return {
    label: ext ? ext.toUpperCase() : "FILE",
    className: "type-default",
    isImage: IMAGE_EXTENSIONS.has(ext),
  };
}

export function statusIndicator(status: string): string {
  switch (status) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "processing":
      return "processing";
    default:
      return "queued";
  }
}
