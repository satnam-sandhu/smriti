use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ParserPath {
    Ai,
    Deterministic,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum FileStatus {
    Queued,
    Processing,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineFailure {
    pub file_name: String,
    pub error_code: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PipelineMetrics {
    pub total_files: u32,
    pub total_bytes: u64,
    pub completed: u32,
    pub failed: u32,
    pub unreviewed_failed: u32,
    pub in_progress: u32,
    pub accuracy_pct: f64,
    pub validation_pass_rate: f64,
    pub ai_parsed: u32,
    pub deterministic_parsed: u32,
    pub recent_failures: Vec<PipelineFailure>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    pub id: String,
    pub name: String,
    pub doc_type: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionSummary {
    pub id: String,
    pub name: String,
    pub doc_type: String,
    pub created_at: String,
    pub total_files: u32,
    pub completed: u32,
    pub failed: u32,
    pub in_progress: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileRecord {
    pub id: String,
    pub collection_id: Option<String>,
    pub file_name: String,
    pub mime: Option<String>,
    pub status: FileStatus,
    pub parser_path: Option<ParserPath>,
    pub bronze_path: String,
    pub silver_path: Option<String>,
    pub bytes: u64,
    pub error_code: Option<String>,
    pub error_detail: Option<String>,
    pub accuracy_pct: Option<f64>,
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
    pub ai_cost_usd: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDetail {
    pub file_id: String,
    pub file_name: String,
    pub status: FileStatus,
    pub parser_path: Option<ParserPath>,
    pub bronze_path: String,
    pub silver_json: Option<serde_json::Value>,
    pub gold_row: Option<serde_json::Value>,
    pub accuracy_pct: Option<f64>,
    pub error_code: Option<String>,
    pub error_detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FailedFileReview {
    pub file_id: String,
    pub file_name: String,
    pub collection_id: Option<String>,
    pub collection_name: Option<String>,
    pub error_code: String,
    pub error_detail: Option<String>,
    pub timestamp: String,
    pub quarantine_path: String,
    pub mime: Option<String>,
    pub bytes: u64,
    pub sidecar_json: Option<serde_json::Value>,
    pub reviewed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyticsQueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
    pub cost_usd: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParserOutput {
    pub parser_path: ParserPath,
    pub silver_json: serde_json::Value,
    pub accuracy_pct: Option<f64>,
    pub error_code: Option<String>,
    pub error_detail: Option<String>,
    pub ai_usage: Option<AiUsage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineActivity {
    pub file_id: String,
    pub file_name: String,
    pub status: FileStatus,
    pub parser_path: Option<ParserPath>,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub ai_cost_usd: f64,
    pub bytes: u64,
    pub created_at: String,
    pub error_code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineDayStat {
    pub date: String,
    pub ingested: u32,
    pub completed: u32,
    pub failed: u32,
    pub tokens: u32,
    pub cost_usd: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorBreakdown {
    pub error_code: String,
    pub count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineStats {
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub total_files: u32,
    pub total_bytes: u64,
    pub completed: u32,
    pub failed: u32,
    pub in_progress: u32,
    pub ai_parsed: u32,
    pub deterministic_parsed: u32,
    pub llm_calls: u32,
    pub accuracy_pct: f64,
    pub validation_pass_rate: f64,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
    pub ai_cost_usd: f64,
    pub activity: Vec<PipelineActivity>,
    pub activity_total: u32,
    pub activity_page: u32,
    pub activity_page_size: u32,
    pub daily_stats: Vec<PipelineDayStat>,
    pub errors_by_code: Vec<ErrorBreakdown>,
    pub recent_failures: Vec<PipelineFailure>,
    pub failures_total: u32,
    pub failures_page: u32,
    pub failures_page_size: u32,
}
