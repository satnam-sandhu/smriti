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
  unreviewedFailed: number;
  inProgress: number;
  accuracyPct: number;
  validationPassRate: number;
  aiParsed: number;
  deterministicParsed: number;
  recentFailures: PipelineFailure[];
}

export interface PipelineActivity {
  fileId: string;
  fileName: string;
  status: FileStatus;
  parserPath?: ParserPath;
  promptTokens: number;
  completionTokens: number;
  aiCostUsd: number;
  bytes: number;
  createdAt: string;
  errorCode?: string;
}

export interface PipelineDayStat {
  date: string;
  ingested: number;
  completed: number;
  failed: number;
  tokens: number;
  costUsd: number;
}

export interface ErrorBreakdown {
  errorCode: string;
  count: number;
}

export interface PipelineStats {
  startDate?: string;
  endDate?: string;
  totalFiles: number;
  totalBytes: number;
  completed: number;
  failed: number;
  inProgress: number;
  aiParsed: number;
  deterministicParsed: number;
  llmCalls: number;
  accuracyPct: number;
  validationPassRate: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  aiCostUsd: number;
  activity: PipelineActivity[];
  activityTotal: number;
  activityPage: number;
  activityPageSize: number;
  dailyStats: PipelineDayStat[];
  errorsByCode: ErrorBreakdown[];
  recentFailures: PipelineFailure[];
  failuresTotal: number;
  failuresPage: number;
  failuresPageSize: number;
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

export interface FailedFileReview {
  fileId: string;
  fileName: string;
  collectionId?: string;
  collectionName?: string;
  errorCode: string;
  errorDetail?: string;
  timestamp: string;
  quarantinePath: string;
  mime?: string;
  bytes: number;
  sidecarJson?: Record<string, unknown>;
  reviewedAt?: string;
}

export interface AnalyticsQueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
}

/** A single config field a connector needs (rendered dynamically in the UI). */
export interface ConnectorField {
  name: string;
  label: string;
  required: boolean;
  secret: boolean;
  help: string;
}

/** A registered remote data-source connector (S3, GCS, Azure Blob, …). */
export interface ConnectorType {
  type: string;
  label: string;
  configSchema: ConnectorField[];
}

/** An object discovered on a remote source. */
export interface ConnectorObject {
  key: string;
  name: string;
  uri: string;
  size?: number | null;
}
