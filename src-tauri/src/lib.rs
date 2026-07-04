mod commands;
mod db;
mod models;
mod pipeline;

use tauri::Emitter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let handle = app.handle().clone();
            pipeline::init_workspace(&handle)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_collection,
            commands::list_collections,
            commands::get_collection_table,
            commands::ingest_files,
            commands::process_batch,
            commands::get_metrics,
            commands::get_file_detail,
            commands::list_files,
            commands::run_analytics_query,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

pub fn emit_metrics(app: &tauri::AppHandle) {
    if let Ok(metrics) = pipeline::get_metrics(app) {
        let _ = app.emit("metrics:update", &metrics);
        let _ = pipeline::export_metrics_json(app, &metrics);
    }
}
