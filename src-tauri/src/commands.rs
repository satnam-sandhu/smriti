use crate::models::{AnalyticsQueryResult, FileDetail, FileRecord, PipelineMetrics};
use crate::pipeline;

#[tauri::command]
pub async fn ingest_files(
    app: tauri::AppHandle,
    paths: Vec<String>,
) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || pipeline::ingest_files(&app, paths))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn process_batch(app: tauri::AppHandle) -> Result<Vec<FileRecord>, String> {
    tauri::async_runtime::spawn_blocking(move || pipeline::process_batch(&app))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_metrics(app: tauri::AppHandle) -> Result<PipelineMetrics, String> {
    tauri::async_runtime::spawn_blocking(move || pipeline::get_metrics(&app))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_file_detail(
    app: tauri::AppHandle,
    file_id: String,
) -> Result<Option<FileDetail>, String> {
    tauri::async_runtime::spawn_blocking(move || pipeline::get_file_detail(&app, file_id))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn list_files(app: tauri::AppHandle) -> Result<Vec<FileRecord>, String> {
    tauri::async_runtime::spawn_blocking(move || pipeline::list_all_files(&app))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn run_analytics_query(
    app: tauri::AppHandle,
    sql: String,
) -> Result<AnalyticsQueryResult, String> {
    tauri::async_runtime::spawn_blocking(move || pipeline::run_analytics_query(&app, sql))
        .await
        .map_err(|e| e.to_string())?
}
