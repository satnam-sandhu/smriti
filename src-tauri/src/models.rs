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
    pub in_progress: u32,
    pub accuracy_pct: f64,
    pub validation_pass_rate: f64,
    pub ai_parsed: u32,
    pub deterministic_parsed: u32,
    pub recent_failures: Vec<PipelineFailure>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileRecord {
    pub id: String,
    pub file_name: String,
    pub status: FileStatus,
    pub parser_path: Option<ParserPath>,
    pub bronze_path: String,
    pub silver_path: Option<String>,
    pub bytes: u64,
    pub error_code: Option<String>,
    pub error_detail: Option<String>,
    pub accuracy_pct: Option<f64>,
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
pub struct AnalyticsQueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParserOutput {
    pub parser_path: ParserPath,
    pub silver_json: serde_json::Value,
    pub accuracy_pct: Option<f64>,
    pub error_code: Option<String>,
    pub error_detail: Option<String>,
}
