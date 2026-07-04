use crate::models::{
    AnalyticsQueryResult, Collection, CollectionSummary, FileDetail, FileRecord, PipelineMetrics,
    PipelineStats,
};
use crate::pipeline;

#[tauri::command]
pub async fn list_failed_reviews(
    app: tauri::AppHandle,
) -> Result<Vec<crate::models::FailedFileReview>, String> {
    tauri::async_runtime::spawn_blocking(move || pipeline::list_failed_reviews(&app))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_failed_review(
    app: tauri::AppHandle,
    file_id: String,
) -> Result<Option<crate::models::FailedFileReview>, String> {
    tauri::async_runtime::spawn_blocking(move || pipeline::get_failed_review(&app, file_id))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn mark_failed_review(
    app: tauri::AppHandle,
    file_id: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || pipeline::mark_failed_review(&app, file_id))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn create_collection(
    app: tauri::AppHandle,
    name: String,
    doc_type: String,
) -> Result<Collection, String> {
    tauri::async_runtime::spawn_blocking(move || pipeline::create_collection(&app, name, doc_type))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn list_collections(app: tauri::AppHandle) -> Result<Vec<CollectionSummary>, String> {
    tauri::async_runtime::spawn_blocking(move || pipeline::list_all_collections(&app))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_collection_table(
    app: tauri::AppHandle,
    collection_id: String,
) -> Result<AnalyticsQueryResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        pipeline::get_collection_table(&app, collection_id)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn ingest_files(
    app: tauri::AppHandle,
    collection_id: String,
    paths: Vec<String>,
) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        pipeline::ingest_files(&app, collection_id, paths)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn list_connector_types(
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || pipeline::list_connector_types(&app))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn connector_list_objects(
    app: tauri::AppHandle,
    connector_type: String,
    config: serde_json::Value,
    prefix: Option<String>,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        pipeline::connector_list_objects(&app, connector_type, config, prefix)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn ingest_from_connector(
    app: tauri::AppHandle,
    collection_id: String,
    connector_type: String,
    config: serde_json::Value,
    keys: Option<Vec<String>>,
    prefix: Option<String>,
) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        pipeline::ingest_from_connector(&app, collection_id, connector_type, config, keys, prefix)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn process_batch(
    app: tauri::AppHandle,
    file_ids: Option<Vec<String>>,
) -> Result<Vec<FileRecord>, String> {
    tauri::async_runtime::spawn_blocking(move || pipeline::process_batch(&app, file_ids))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_pipeline_stats(
    app: tauri::AppHandle,
    start_date: Option<String>,
    end_date: Option<String>,
    activity_page: Option<u32>,
    activity_page_size: Option<u32>,
    failures_page: Option<u32>,
    failures_page_size: Option<u32>,
) -> Result<PipelineStats, String> {
    tauri::async_runtime::spawn_blocking(move || {
        pipeline::get_pipeline_stats(
            &app,
            start_date,
            end_date,
            activity_page,
            activity_page_size,
            failures_page,
            failures_page_size,
        )
    })
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
    collection_id: Option<String>,
) -> Result<AnalyticsQueryResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        pipeline::run_analytics_query(&app, sql, collection_id)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn get_smriti_root(app: tauri::AppHandle) -> Result<String, String> {
    Ok(crate::db::resolve_smriti_root(&app).to_string_lossy().to_string())
}

#[tauri::command]
pub async fn mcp_list_tools(server_url: String) -> Result<Vec<crate::mcp::McpTool>, String> {
    crate::mcp::list_tools(&server_url).await
}

#[tauri::command]
pub async fn mcp_call_tool(
    server_url: String,
    name: String,
    args: serde_json::Value,
) -> Result<String, String> {
    crate::mcp::call_tool(&server_url, &name, args).await
}
