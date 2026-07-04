use crate::db::{
    get_collection, get_file, get_metrics as db_metrics, init_db, insert_collection,
    insert_failure, insert_file, list_collections as db_list_collections,
    list_files, list_files_for_collection, update_file, with_db,
};
use crate::emit_metrics;
use crate::models::{
    AnalyticsQueryResult, Collection, CollectionSummary, FileDetail, FileRecord, FileStatus,
    ParserOutput, PipelineMetrics,
};
use chrono::Utc;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

pub fn init_workspace(app: &AppHandle) -> Result<(), String> {
    init_db(app)
}

/// Resolve the parser interpreter (project venv if present, else system python3).
fn parser_python(project_root: &Path) -> PathBuf {
    let venv_python = project_root
        .join("parser")
        .join(".venv")
        .join("bin")
        .join("python3");
    if venv_python.exists() {
        venv_python
    } else {
        PathBuf::from("python3")
    }
}

/// Run the thin connectors CLI and return its parsed JSON stdout.
fn run_connectors_cli(app: &AppHandle, args: &[&str]) -> Result<serde_json::Value, String> {
    let project_root = resolve_project_root(app);
    let script = project_root.join("parser").join("connectors_cli.py");
    let python = parser_python(&project_root);

    let output = Command::new(python)
        .arg(&script)
        .args(args)
        .output()
        .map_err(|e| format!("Failed to run connectors CLI: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let value: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| {
            let stderr = String::from_utf8_lossy(&output.stderr);
            format!("Invalid connectors output: {e}. stderr: {stderr}")
        })?;

    // The CLI reports handled errors as {"error": "..."} with a non-zero exit.
    if let Some(err) = value.get("error").and_then(|v| v.as_str()) {
        return Err(err.to_string());
    }
    if !output.status.success() {
        return Err(format!("Connectors CLI failed: {stdout}"));
    }
    Ok(value)
}

pub fn list_connector_types(app: &AppHandle) -> Result<serde_json::Value, String> {
    run_connectors_cli(app, &["list-types"])
}

pub fn connector_list_objects(
    app: &AppHandle,
    connector_type: String,
    config: serde_json::Value,
    prefix: Option<String>,
) -> Result<serde_json::Value, String> {
    let config_str = config.to_string();
    let mut args = vec!["list-objects", "--type", &connector_type, "--config", &config_str];
    let prefix_val = prefix.unwrap_or_default();
    if !prefix_val.is_empty() {
        args.push("--prefix");
        args.push(&prefix_val);
    }
    run_connectors_cli(app, &args)
}

/// Download objects from a remote connector into bronze and register each as a
/// queued FileRecord under the given collection — the connector analogue of
/// `ingest_files`. Returns the new file ids for `process_batch`.
pub fn ingest_from_connector(
    app: &AppHandle,
    collection_id: String,
    connector_type: String,
    config: serde_json::Value,
    keys: Option<Vec<String>>,
    prefix: Option<String>,
) -> Result<Vec<String>, String> {
    with_db(app, |conn, _| {
        get_collection(conn, &collection_id)?.ok_or_else(|| "Collection not found".to_string())?;
        Ok(())
    })?;

    let workspace = with_db(app, |_, workspace| Ok(workspace.clone()))?;
    let bronze_dir = workspace.join("bronze");
    fs::create_dir_all(&bronze_dir).map_err(|e| e.to_string())?;
    let bronze_str = bronze_dir.to_string_lossy().to_string();
    let config_str = config.to_string();

    let mut args = vec![
        "pull",
        "--type",
        &connector_type,
        "--config",
        &config_str,
        "--dest",
        &bronze_str,
    ];
    let prefix_val = prefix.unwrap_or_default();
    if !prefix_val.is_empty() {
        args.push("--prefix");
        args.push(&prefix_val);
    }
    let keys_json = keys.map(|k| serde_json::to_string(&k).unwrap_or_else(|_| "[]".into()));
    if let Some(ref kj) = keys_json {
        args.push("--keys");
        args.push(kj);
    }

    let result = run_connectors_cli(app, &args)?;
    let files = result
        .get("files")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let now = Utc::now().to_rfc3339();
    let (ids, queued_records) = with_db(app, |conn, _| {
        let mut ids = Vec::new();
        let mut queued_records = Vec::new();
        for item in &files {
            let id = item
                .get("documentId")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let file_name = item
                .get("filename")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();
            let bronze_path = item
                .get("bronzePath")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let bytes = item.get("bytes").and_then(|v| v.as_u64()).unwrap_or(0);
            if id.is_empty() || bronze_path.is_empty() {
                continue;
            }

            let record = FileRecord {
                id: id.clone(),
                collection_id: Some(collection_id.clone()),
                file_name: file_name.clone(),
                mime: Some(guess_mime(&file_name)),
                status: FileStatus::Queued,
                parser_path: None,
                bronze_path,
                silver_path: None,
                bytes,
                error_code: None,
                error_detail: None,
                accuracy_pct: None,
            };

            insert_file(conn, &record, &now)?;
            ids.push(id);
            queued_records.push(record);
        }
        Ok((ids, queued_records))
    })?;

    for record in queued_records {
        let _ = app.emit("file:queued", &record);
    }

    emit_metrics(app);
    let _ = app.emit("collections:updated", ());
    Ok(ids)
}

pub fn create_collection(
    app: &AppHandle,
    name: String,
    doc_type: String,
) -> Result<Collection, String> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let collection = Collection {
        id: id.clone(),
        name: name.trim().to_string(),
        doc_type,
        created_at: now,
    };

    with_db(app, |conn, workspace| {
        insert_collection(conn, &collection)?;
        let gold_dir = collection_gold_dir(workspace, &id);
        fs::create_dir_all(&gold_dir).map_err(|e| e.to_string())?;
        Ok(())
    })?;

    let _ = app.emit("collections:updated", ());
    Ok(collection)
}

pub fn list_all_collections(app: &AppHandle) -> Result<Vec<CollectionSummary>, String> {
    with_db(app, |conn, _| db_list_collections(conn))
}

pub fn get_collection_table(
    app: &AppHandle,
    collection_id: String,
) -> Result<AnalyticsQueryResult, String> {
    let workspace = with_db(app, |_, workspace| Ok(workspace.clone()))?;
    let gold_dir = collection_gold_dir(&workspace, &collection_id);

    if !gold_glob_has_files(&gold_dir) {
        return build_table_from_silver(app, &collection_id);
    }

    let gold_glob = collection_gold_glob(&workspace, &collection_id);
    let sql = format!("SELECT * FROM read_parquet('{gold_glob}')");
    run_duckdb_query(app, &sql, &gold_glob)
}

pub fn ingest_files(
    app: &AppHandle,
    collection_id: String,
    paths: Vec<String>,
) -> Result<Vec<String>, String> {
    with_db(app, |conn, _| {
        get_collection(conn, &collection_id)?.ok_or_else(|| "Collection not found".to_string())?;
        Ok(())
    })?;

    let now = Utc::now().to_rfc3339();

    let (ids, queued_records) = with_db(app, |conn, workspace| {
        let mut ids = Vec::new();
        let mut queued_records = Vec::new();
        for path in paths {
            let src = PathBuf::from(&path);
            if !src.exists() {
                continue;
            }

            let file_name = src
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string();
            let bytes = fs::metadata(&src).map_err(|e| e.to_string())?.len();
            let id = Uuid::new_v4().to_string();
            let bronze_path = workspace.join("bronze").join(format!("{}_{}", id, file_name));

            fs::copy(&src, &bronze_path).map_err(|e| e.to_string())?;

            let record = FileRecord {
                id: id.clone(),
                collection_id: Some(collection_id.clone()),
                file_name: file_name.clone(),
                mime: Some(guess_mime(&file_name)),
                status: FileStatus::Queued,
                parser_path: None,
                bronze_path: bronze_path.to_string_lossy().to_string(),
                silver_path: None,
                bytes,
                error_code: None,
                error_detail: None,
                accuracy_pct: None,
            };

            insert_file(conn, &record, &now)?;
            ids.push(id.clone());
            queued_records.push(record);
        }
        Ok((ids, queued_records))
    })?;

    for record in queued_records {
        let _ = app.emit("file:queued", &record);
    }

    emit_metrics(app);
    let _ = app.emit("collections:updated", ());
    Ok(ids)
}

pub fn process_batch(
    app: &AppHandle,
    file_ids: Option<Vec<String>>,
) -> Result<Vec<FileRecord>, String> {
    let files = with_db(app, |conn, _| list_files(conn))?;
    let mut results = Vec::new();
    let id_filter = file_ids.map(|ids| ids.into_iter().collect::<std::collections::HashSet<_>>());

    for mut record in files {
        if record.status != FileStatus::Queued {
            continue;
        }
        if let Some(ref allowed) = id_filter {
            if !allowed.contains(&record.id) {
                continue;
            }
        }

        record.status = FileStatus::Processing;
        with_db(app, |conn, _| update_file(conn, &record))?;
        let _ = app.emit("file:processing", &record);

        match process_single_file(app, &mut record) {
            Ok(updated) => {
                record = updated;
                let _ = app.emit("file:completed", &record);
            }
            Err(err) => {
                record.status = FileStatus::Failed;
                record.error_code = Some(err.code.clone());
                record.error_detail = Some(err.detail.clone());
                with_db(app, |conn, workspace| {
                    update_file(conn, &record)?;
                    let ts = Utc::now().to_rfc3339();
                    insert_failure(conn, &record.id, &record.file_name, &err.code, &err.detail, &ts)?;
                    quarantine_file(workspace, &record)?;
                    Ok(())
                })?;
                let _ = app.emit("file:failed", &record);
            }
        }

        with_db(app, |conn, _| update_file(conn, &record))?;
        results.push(record);
        emit_metrics(app);
        let _ = app.emit("collections:updated", ());
    }

    Ok(results)
}

struct ProcessError {
    code: String,
    detail: String,
}

fn process_single_file(app: &AppHandle, record: &mut FileRecord) -> Result<FileRecord, ProcessError> {
    let bronze = PathBuf::from(&record.bronze_path);

    if is_likely_corrupt(&bronze) {
        return Err(ProcessError {
            code: "CORRUPT_FILE".into(),
            detail: "File appears truncated or unreadable".into(),
        });
    }

    let doc_type = record
        .collection_id
        .as_ref()
        .and_then(|cid| {
            with_db(app, |conn, _| get_collection(conn, cid))
                .ok()
                .flatten()
                .map(|c| c.doc_type)
        });

    let parser_output = call_python_parser(app, &bronze, &record.file_name, doc_type.as_deref())?;

    if let Some(code) = &parser_output.error_code {
        return Err(ProcessError {
            code: code.clone(),
            detail: parser_output
                .error_detail
                .clone()
                .unwrap_or_else(|| "Parser returned error".into()),
        });
    }

    let workspace = with_db(app, |_, workspace| Ok(workspace.clone())).map_err(|e| ProcessError {
        code: "UNKNOWN_LAYOUT".into(),
        detail: e,
    })?;

    let silver_path = workspace
        .join("silver")
        .join(format!("{}.json", record.id));
    fs::write(
        &silver_path,
        serde_json::to_string_pretty(&parser_output.silver_json).map_err(|e| ProcessError {
            code: "VALIDATION_ERROR".into(),
            detail: e.to_string(),
        })?,
    )
    .map_err(|e| ProcessError {
        code: "VALIDATION_ERROR".into(),
        detail: e.to_string(),
    })?;

    write_gold_parquet(app, record, &parser_output.silver_json, &parser_output.parser_path)?;

    record.status = FileStatus::Completed;
    record.parser_path = Some(parser_output.parser_path);
    record.silver_path = Some(silver_path.to_string_lossy().to_string());
    record.accuracy_pct = parser_output.accuracy_pct;
    record.error_code = None;
    record.error_detail = None;

    Ok(record.clone())
}

fn call_python_parser(
    app: &AppHandle,
    bronze: &Path,
    file_name: &str,
    doc_type: Option<&str>,
) -> Result<ParserOutput, ProcessError> {
    let project_root = resolve_project_root(app);
    let parser_script = project_root.join("parser").join("cli.py");
    let venv_python = project_root.join("parser").join(".venv").join("bin").join("python3");
    let python = if venv_python.exists() {
        venv_python
    } else {
        PathBuf::from("python3")
    };

    let expected = project_root
        .join("samples")
        .join("expected")
        .join(format!("{}.json", Path::new(file_name).file_stem().unwrap_or_default().to_string_lossy()));

    let mut cmd = Command::new(python);
    cmd.arg(&parser_script)
        .arg("--file")
        .arg(bronze)
        .arg("--expected")
        .arg(if expected.exists() { expected } else { PathBuf::from("") });

    if let Some(dt) = doc_type {
        cmd.arg("--doc-type").arg(dt);
    }

    let output = cmd.output().map_err(|e| ProcessError {
            code: "UNKNOWN_LAYOUT".into(),
            detail: format!("Failed to run parser: {e}"),
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(ProcessError {
            code: "UNKNOWN_LAYOUT".into(),
            detail: stderr.to_string(),
        });
    }

    serde_json::from_slice(&output.stdout).map_err(|e| ProcessError {
        code: "VALIDATION_ERROR".into(),
        detail: format!("Invalid parser output: {e}"),
    })
}

fn write_gold_parquet(
    app: &AppHandle,
    record: &FileRecord,
    silver_json: &serde_json::Value,
    parser_path: &crate::models::ParserPath,
) -> Result<(), ProcessError> {
    let project_root = resolve_project_root(app);
    let script = project_root.join("parser").join("write_parquet.py");
    let venv_python = project_root.join("parser").join(".venv").join("bin").join("python3");
    let python = if venv_python.exists() {
        venv_python
    } else {
        PathBuf::from("python3")
    };

    let workspace = with_db(app, |_, workspace| Ok(workspace.clone())).map_err(|e| ProcessError {
        code: "VALIDATION_ERROR".into(),
        detail: e,
    })?;

    let collection_id = record.collection_id.as_ref().ok_or_else(|| ProcessError {
        code: "VALIDATION_ERROR".into(),
        detail: "File missing collection_id".into(),
    })?;

    let gold_dir = collection_gold_dir(&workspace, collection_id);
    fs::create_dir_all(&gold_dir).map_err(|e| ProcessError {
        code: "VALIDATION_ERROR".into(),
        detail: e.to_string(),
    })?;

    let gold_file = gold_dir.join(format!("{}.parquet", record.id));
    let silver_tmp = workspace.join("silver").join(format!("{}.tmp.json", record.id));
    fs::write(&silver_tmp, silver_json.to_string()).map_err(|e| ProcessError {
        code: "VALIDATION_ERROR".into(),
        detail: e.to_string(),
    })?;

    let meta = serde_json::json!({
        "_file_id": record.id,
        "_file_name": record.file_name,
        "_parser_path": match parser_path {
            crate::models::ParserPath::Ai => "ai",
            crate::models::ParserPath::Deterministic => "deterministic",
        },
        "_status": "completed",
    });

    let output = Command::new(python)
        .arg(&script)
        .arg("--input")
        .arg(&silver_tmp)
        .arg("--output")
        .arg(&gold_file)
        .arg("--meta")
        .arg(meta.to_string())
        .output()
        .map_err(|e| ProcessError {
            code: "VALIDATION_ERROR".into(),
            detail: e.to_string(),
        })?;

    let _ = fs::remove_file(silver_tmp);

    if !output.status.success() {
        return Err(ProcessError {
            code: "VALIDATION_ERROR".into(),
            detail: String::from_utf8_lossy(&output.stderr).to_string(),
        });
    }

    let _ = register_collection_duckdb(app, collection_id);

    Ok(())
}

fn is_likely_corrupt(path: &Path) -> bool {
    if let Ok(meta) = fs::metadata(path) {
        if meta.len() < 100 {
            return true;
        }
    }

    if path.extension().and_then(|e| e.to_str()) == Some("pdf") {
        if let Ok(bytes) = fs::read(path) {
            if bytes.len() < 5 || !bytes.starts_with(b"%PDF-") {
                return true;
            }
        }
    }

    false
}

fn quarantine_file(workspace: &PathBuf, record: &FileRecord) -> Result<(), String> {
    let src = PathBuf::from(&record.bronze_path);
    if !src.exists() {
        return Ok(());
    }
    let dest = workspace
        .join("quarantine")
        .join(format!("{}_{}", record.id, record.file_name));
    fs::rename(&src, &dest).map_err(|e| e.to_string())?;

    let sidecar = dest.with_extension("error.json");
    let payload = serde_json::json!({
        "fileId": record.id,
        "errorCode": record.error_code,
        "errorDetail": record.error_detail,
    });
    fs::write(sidecar, payload.to_string()).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_metrics(app: &AppHandle) -> Result<PipelineMetrics, String> {
    with_db(app, |conn, _| db_metrics(conn))
}

pub fn export_metrics_json(app: &AppHandle, metrics: &PipelineMetrics) -> Result<(), String> {
    let workspace = with_db(app, |_, workspace| Ok(workspace.clone()))?;
    let metrics_path = workspace.join("metrics.json");
    let json = serde_json::to_string_pretty(metrics).map_err(|e| e.to_string())?;
    fs::write(metrics_path, json).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_file_detail(app: &AppHandle, file_id: String) -> Result<Option<FileDetail>, String> {
    with_db(app, |conn, _| {
        let record = get_file(conn, &file_id)?;
        let Some(record) = record else {
            return Ok(None);
        };

        let silver_json = record
            .silver_path
            .as_ref()
            .and_then(|p| fs::read_to_string(p).ok())
            .and_then(|s| serde_json::from_str(&s).ok());

        Ok(Some(FileDetail {
            file_id: record.id,
            file_name: record.file_name,
            status: record.status,
            parser_path: record.parser_path,
            bronze_path: record.bronze_path,
            silver_json: silver_json.clone(),
            gold_row: silver_json,
            accuracy_pct: record.accuracy_pct,
            error_code: record.error_code,
            error_detail: record.error_detail,
        }))
    })
}

pub fn list_all_files(app: &AppHandle) -> Result<Vec<FileRecord>, String> {
    with_db(app, |conn, _| list_files(conn))
}

pub fn run_analytics_query(app: &AppHandle, sql: String) -> Result<AnalyticsQueryResult, String> {
    let workspace = with_db(app, |_, workspace| Ok(workspace.clone()))?;
    let gold_glob = workspace
        .join("gold/collections/*/*.parquet")
        .to_string_lossy()
        .to_string();
    run_duckdb_query(app, &sql, &gold_glob)
}

fn run_duckdb_query(
    app: &AppHandle,
    sql: &str,
    gold_glob: &str,
) -> Result<AnalyticsQueryResult, String> {
    let project_root = resolve_project_root(app);
    let script = project_root.join("parser").join("analytics.py");
    let venv_python = project_root.join("parser").join(".venv").join("bin").join("python3");
    let python = if venv_python.exists() {
        venv_python
    } else {
        PathBuf::from("python3")
    };

    let workspace = with_db(app, |_, workspace| Ok(workspace.clone()))?;
    let db_path = workspace.join("analytics.duckdb");

    let output = Command::new(python)
        .arg(&script)
        .arg("--sql")
        .arg(sql)
        .arg("--gold-glob")
        .arg(gold_glob)
        .arg("--db-path")
        .arg(&db_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    serde_json::from_slice(&output.stdout).map_err(|e| e.to_string())
}

fn build_table_from_silver(
    app: &AppHandle,
    collection_id: &str,
) -> Result<AnalyticsQueryResult, String> {
    let files = with_db(app, |conn, _| list_files_for_collection(conn, collection_id))?;
    let mut rows: Vec<serde_json::Value> = Vec::new();
    let mut columns: Vec<String> = Vec::new();

    for file in files {
        if file.status != FileStatus::Completed {
            continue;
        }
        let Some(silver_path) = file.silver_path else {
            continue;
        };
        let silver: serde_json::Value = fs::read_to_string(&silver_path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or(serde_json::json!({}));

        let mut row = match silver {
            serde_json::Value::Object(map) => serde_json::Value::Object(map),
            other => serde_json::json!({ "value": other }),
        };

        if let serde_json::Value::Object(ref mut map) = row {
            map.insert("_file_id".into(), serde_json::json!(file.id));
            map.insert("_file_name".into(), serde_json::json!(file.file_name));
            map.insert(
                "_parser_path".into(),
                serde_json::json!(file.parser_path.as_ref().map(|p| match p {
                    crate::models::ParserPath::Ai => "ai",
                    crate::models::ParserPath::Deterministic => "deterministic",
                }).unwrap_or("")),
            );
            map.insert("_status".into(), serde_json::json!("completed"));

            for key in map.keys() {
                if !columns.contains(key) {
                    columns.push(key.clone());
                }
            }
        }
        rows.push(row);
    }

    columns.sort();

    Ok(AnalyticsQueryResult { columns, rows })
}

fn collection_gold_dir(workspace: &PathBuf, collection_id: &str) -> PathBuf {
    workspace
        .join("gold")
        .join("collections")
        .join(collection_id)
}

fn collection_gold_glob(workspace: &PathBuf, collection_id: &str) -> String {
    collection_gold_dir(workspace, collection_id)
        .join("*.parquet")
        .to_string_lossy()
        .to_string()
}

fn gold_glob_has_files(gold_dir: &Path) -> bool {
    fs::read_dir(gold_dir)
        .ok()
        .map(|entries| {
            entries.filter_map(|e| e.ok()).any(|e| {
                e.path()
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .map(|ext| ext.eq_ignore_ascii_case("parquet"))
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false)
}

fn register_collection_duckdb(app: &AppHandle, collection_id: &str) -> Result<(), String> {
    let project_root = resolve_project_root(app);
    let script = project_root.join("parser").join("analytics.py");
    let venv_python = project_root.join("parser").join(".venv").join("bin").join("python3");
    let python = if venv_python.exists() {
        venv_python
    } else {
        PathBuf::from("python3")
    };

    let workspace = with_db(app, |_, workspace| Ok(workspace.clone()))?;
    let gold_glob = collection_gold_glob(&workspace, collection_id);
    let db_path = workspace.join("analytics.duckdb");
    let view_name = format!("collection_{}", collection_id.replace('-', "_"));

    let output = Command::new(python)
        .arg(&script)
        .arg("--register")
        .arg("--gold-glob")
        .arg(&gold_glob)
        .arg("--db-path")
        .arg(&db_path)
        .arg("--view-name")
        .arg(&view_name)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(())
}

fn resolve_project_root(app: &AppHandle) -> PathBuf {
    if let Ok(cwd) = std::env::current_dir() {
        if cwd.join("parser").join("cli.py").exists() {
            return cwd;
        }
    }

    if let Ok(resource) = app.path().resource_dir() {
        let dev_root = resource.join("../../..");
        if dev_root.join("parser").join("cli.py").exists() {
            return dev_root;
        }
    }

    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn guess_mime(file_name: &str) -> String {
    match Path::new(file_name)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .as_deref()
    {
        Some("pdf") => "application/pdf",
        Some("xlsx") => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        Some("xls") => "application/vnd.ms-excel",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("json") => "application/json",
        _ => "application/octet-stream",
    }
    .to_string()
}

fn _hash_file(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    Ok(hex::encode(hasher.finalize()))
}
