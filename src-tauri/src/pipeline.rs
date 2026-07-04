use crate::db::{get_file, get_metrics as db_metrics, init_db, insert_failure, insert_file, list_files, update_file, with_db};
use crate::emit_metrics;
use crate::models::{FileDetail, FileRecord, FileStatus, ParserOutput, PipelineMetrics};
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

pub fn ingest_files(app: &AppHandle, paths: Vec<String>) -> Result<Vec<String>, String> {
    let now = Utc::now().to_rfc3339();

    let ids = with_db(app, |conn, workspace| {
        let mut ids = Vec::new();
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
                file_name: file_name.clone(),
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
            ids.push(id);
        }
        Ok(ids)
    })?;

    emit_metrics(app);
    Ok(ids)
}

pub fn process_batch(app: &AppHandle) -> Result<Vec<FileRecord>, String> {
    let files = with_db(app, |conn, _| list_files(conn))?;
    let mut results = Vec::new();

    for mut record in files {
        if record.status != FileStatus::Queued {
            continue;
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

    let parser_output = call_python_parser(app, &bronze, &record.file_name)?;

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

    write_gold_parquet(app, record, &parser_output.silver_json)?;

    record.status = FileStatus::Completed;
    record.parser_path = Some(parser_output.parser_path);
    record.silver_path = Some(silver_path.to_string_lossy().to_string());
    record.accuracy_pct = parser_output.accuracy_pct;
    record.error_code = None;
    record.error_detail = None;

    Ok(record.clone())
}

fn call_python_parser(app: &AppHandle, bronze: &Path, file_name: &str) -> Result<ParserOutput, ProcessError> {
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

    let output = Command::new(python)
        .arg(&parser_script)
        .arg("--file")
        .arg(bronze)
        .arg("--expected")
        .arg(if expected.exists() { expected } else { PathBuf::from("") })
        .output()
        .map_err(|e| ProcessError {
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

    let gold_dir = workspace.join("gold/domain=finance/year=2026/month=07");
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

    let output = Command::new(python)
        .arg(&script)
        .arg("--input")
        .arg(&silver_tmp)
        .arg("--output")
        .arg(&gold_file)
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

pub fn run_analytics_query(app: &AppHandle, sql: String) -> Result<crate::models::AnalyticsQueryResult, String> {
    let project_root = resolve_project_root(app);
    let script = project_root.join("parser").join("analytics.py");
    let venv_python = project_root.join("parser").join(".venv").join("bin").join("python3");
    let python = if venv_python.exists() {
        venv_python
    } else {
        PathBuf::from("python3")
    };

    let workspace = with_db(app, |_, workspace| Ok(workspace.clone()))?;
    let gold_glob = workspace
        .join("gold/domain=finance/year=2026/month=07/*.parquet")
        .to_string_lossy()
        .to_string();

    let output = Command::new(python)
        .arg(&script)
        .arg("--sql")
        .arg(&sql)
        .arg("--gold-glob")
        .arg(&gold_glob)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    serde_json::from_slice(&output.stdout).map_err(|e| e.to_string())
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

fn _hash_file(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    Ok(hex::encode(hasher.finalize()))
}
