/** Shared contract between Tauri backend, React UI, and MCP layer. */

export type ParserPath = "ai" | "deterministic";

export type FileStatus = "queued" | "processing" | "completed" | "failed";

export type ErrorCode =
  | "CORRUPT_FILE"
  | "SCHEMA_MISMATCH"
  | "PARTIAL_PARSE"
  | "UNKNOWN_LAYOUT"
  | "VALIDATION_ERROR";

export interface ProcessResult {
  fileId: string;
  fileName: string;
  status: FileStatus;
  parserPath?: ParserPath;
  silverJson?: Record<string, unknown>;
  errorCode?: ErrorCode;
  errorDetail?: string;
  accuracyPct?: number;
}

export interface PipelineFailure {
  fileName: string;
  errorCode: string;
  timestamp: string;
}

export interface PipelineMetrics {
  totalFiles: number;
  totalBytes: number;
  completed: number;
  failed: number;
  inProgress: number;
  accuracyPct: number;
  validationPassRate: number;
  aiParsed: number;
  deterministicParsed: number;
  recentFailures: PipelineFailure[];
}

export type DocType = "report" | "ledger" | "statement";

export interface Collection {
  id: string;
  name: string;
  docType: DocType;
  createdAt: string;
}

export interface CollectionSummary {
  id: string;
  name: string;
  docType: DocType;
  createdAt: string;
  totalFiles: number;
  completed: number;
  failed: number;
  inProgress: number;
}

export interface FileRecord {
  id: string;
  collectionId?: string;
  fileName: string;
  mime?: string;
  status: FileStatus;
  parserPath?: ParserPath;
  bronzePath: string;
  silverPath?: string;
  bytes: number;
  errorCode?: ErrorCode;
  errorDetail?: string;
  accuracyPct?: number;
}

export interface FileDetail {
  fileId: string;
  fileName: string;
  status: FileStatus;
  parserPath?: ParserPath;
  bronzePath: string;
  silverJson?: Record<string, unknown>;
  goldRow?: Record<string, unknown>;
  accuracyPct?: number;
  errorCode?: ErrorCode;
  errorDetail?: string;
}

export interface AnalyticsQueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
}
