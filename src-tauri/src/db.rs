use crate::models::{FileRecord, FileStatus, ParserPath, PipelineFailure, PipelineMetrics};
use rusqlite::{params, Connection};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

pub struct DbState {
    pub conn: Mutex<Connection>,
    pub workspace: PathBuf,
}

pub fn init_db(app: &tauri::AppHandle) -> Result<(), String> {
    let workspace = resolve_workspace(app);

    std::fs::create_dir_all(&workspace).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(workspace.join("bronze")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(workspace.join("silver")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(workspace.join("gold/domain=finance/year=2026/month=07"))
        .map_err(|e| e.to_string())?;
    std::fs::create_dir_all(workspace.join("quarantine")).map_err(|e| e.to_string())?;

    let db_path = workspace.join("smriti.db");
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS files (
            id TEXT PRIMARY KEY,
            file_name TEXT NOT NULL,
            status TEXT NOT NULL,
            parser_path TEXT,
            bronze_path TEXT NOT NULL,
            silver_path TEXT,
            bytes INTEGER NOT NULL,
            error_code TEXT,
            error_detail TEXT,
            accuracy_pct REAL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS failures (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id TEXT NOT NULL,
            file_name TEXT NOT NULL,
            error_code TEXT NOT NULL,
            error_detail TEXT,
            timestamp TEXT NOT NULL
        );
        ",
    )
    .map_err(|e| e.to_string())?;

    app.manage(DbState {
        conn: Mutex::new(conn),
        workspace,
    });

    Ok(())
}

pub fn with_db<T, F: FnOnce(&Connection, &PathBuf) -> Result<T, String>>(
    app: &tauri::AppHandle,
    f: F,
) -> Result<T, String> {
    let state = app.state::<DbState>();
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    f(&conn, &state.workspace)
}

pub fn insert_file(
    conn: &Connection,
    record: &FileRecord,
    created_at: &str,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO files (id, file_name, status, parser_path, bronze_path, silver_path, bytes, error_code, error_detail, accuracy_pct, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            record.id,
            record.file_name,
            status_str(&record.status),
            record.parser_path.as_ref().map(parser_path_str),
            record.bronze_path,
            record.silver_path,
            record.bytes as i64,
            record.error_code,
            record.error_detail,
            record.accuracy_pct,
            created_at,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn update_file(conn: &Connection, record: &FileRecord) -> Result<(), String> {
    conn.execute(
        "UPDATE files SET status = ?1, parser_path = ?2, silver_path = ?3, error_code = ?4, error_detail = ?5, accuracy_pct = ?6 WHERE id = ?7",
        params![
            status_str(&record.status),
            record.parser_path.as_ref().map(parser_path_str),
            record.silver_path,
            record.error_code,
            record.error_detail,
            record.accuracy_pct,
            record.id,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn list_files(conn: &Connection) -> Result<Vec<FileRecord>, String> {
    let mut stmt = conn
        .prepare("SELECT id, file_name, status, parser_path, bronze_path, silver_path, bytes, error_code, error_detail, accuracy_pct FROM files ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(FileRecord {
                id: row.get(0)?,
                file_name: row.get(1)?,
                status: parse_status(row.get::<_, String>(2)?),
                parser_path: row
                    .get::<_, Option<String>>(3)?
                    .map(|s| parse_parser_path(s)),
                bronze_path: row.get(4)?,
                silver_path: row.get(5)?,
                bytes: row.get::<_, i64>(6)? as u64,
                error_code: row.get(7)?,
                error_detail: row.get(8)?,
                accuracy_pct: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn get_file(conn: &Connection, file_id: &str) -> Result<Option<FileRecord>, String> {
    let mut stmt = conn
        .prepare("SELECT id, file_name, status, parser_path, bronze_path, silver_path, bytes, error_code, error_detail, accuracy_pct FROM files WHERE id = ?1")
        .map_err(|e| e.to_string())?;

    let mut rows = stmt
        .query(params![file_id])
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        Ok(Some(FileRecord {
            id: row.get(0).map_err(|e| e.to_string())?,
            file_name: row.get(1).map_err(|e| e.to_string())?,
            status: parse_status(row.get(2).map_err(|e| e.to_string())?),
            parser_path: row
                .get::<_, Option<String>>(3)
                .map_err(|e| e.to_string())?
                .map(parse_parser_path),
            bronze_path: row.get(4).map_err(|e| e.to_string())?,
            silver_path: row.get(5).map_err(|e| e.to_string())?,
            bytes: row.get::<_, i64>(6).map_err(|e| e.to_string())? as u64,
            error_code: row.get(7).map_err(|e| e.to_string())?,
            error_detail: row.get(8).map_err(|e| e.to_string())?,
            accuracy_pct: row.get(9).map_err(|e| e.to_string())?,
        }))
    } else {
        Ok(None)
    }
}

pub fn insert_failure(
    conn: &Connection,
    file_id: &str,
    file_name: &str,
    error_code: &str,
    error_detail: &str,
    timestamp: &str,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO failures (file_id, file_name, error_code, error_detail, timestamp) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![file_id, file_name, error_code, error_detail, timestamp],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_metrics(conn: &Connection) -> Result<PipelineMetrics, String> {
    let total_files: u32 = conn
        .query_row("SELECT COUNT(*) FROM files", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let total_bytes: u64 = conn
        .query_row("SELECT COALESCE(SUM(bytes), 0) FROM files", [], |r| {
            r.get::<_, i64>(0)
        })
        .map_err(|e| e.to_string())? as u64;
    let completed: u32 = conn
        .query_row(
            "SELECT COUNT(*) FROM files WHERE status = 'completed'",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let failed: u32 = conn
        .query_row(
            "SELECT COUNT(*) FROM files WHERE status = 'failed'",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let in_progress: u32 = conn
        .query_row(
            "SELECT COUNT(*) FROM files WHERE status IN ('queued', 'processing')",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let ai_parsed: u32 = conn
        .query_row(
            "SELECT COUNT(*) FROM files WHERE parser_path = 'ai'",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let deterministic_parsed: u32 = conn
        .query_row(
            "SELECT COUNT(*) FROM files WHERE parser_path = 'deterministic'",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let accuracy_pct: f64 = conn
        .query_row(
            "SELECT COALESCE(AVG(accuracy_pct), 0) FROM files WHERE accuracy_pct IS NOT NULL",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let validation_pass_rate: f64 = if total_files > 0 {
        (completed as f64 / total_files as f64) * 100.0
    } else {
        0.0
    };

    let mut stmt = conn
        .prepare("SELECT file_name, error_code, timestamp FROM failures ORDER BY id DESC LIMIT 10")
        .map_err(|e| e.to_string())?;
    let recent_failures = stmt
        .query_map([], |row| {
            Ok(PipelineFailure {
                file_name: row.get(0)?,
                error_code: row.get(1)?,
                timestamp: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(PipelineMetrics {
        total_files,
        total_bytes,
        completed,
        failed,
        in_progress,
        accuracy_pct,
        validation_pass_rate,
        ai_parsed,
        deterministic_parsed,
        recent_failures,
    })
}

fn status_str(status: &FileStatus) -> &'static str {
    match status {
        FileStatus::Queued => "queued",
        FileStatus::Processing => "processing",
        FileStatus::Completed => "completed",
        FileStatus::Failed => "failed",
    }
}

fn parser_path_str(path: &ParserPath) -> &'static str {
    match path {
        ParserPath::Ai => "ai",
        ParserPath::Deterministic => "deterministic",
    }
}

fn parse_status(s: String) -> FileStatus {
    match s.as_str() {
        "processing" => FileStatus::Processing,
        "completed" => FileStatus::Completed,
        "failed" => FileStatus::Failed,
        _ => FileStatus::Queued,
    }
}

fn parse_parser_path(s: String) -> ParserPath {
    if s == "deterministic" {
        ParserPath::Deterministic
    } else {
        ParserPath::Ai
    }
}

fn resolve_workspace(app: &tauri::AppHandle) -> PathBuf {
    if let Ok(env_path) = std::env::var("SMRITI_WORKSPACE") {
        return PathBuf::from(env_path);
    }

    if let Ok(cwd) = std::env::current_dir() {
        if cwd.join("parser").join("cli.py").exists() {
            return cwd.join("data");
        }
    }

    if let Ok(resource) = app.path().resource_dir() {
        let dev_root = resource.join("../../..");
        if dev_root.join("parser").join("cli.py").exists() {
            return dev_root.join("data");
        }
    }

    app.path()
        .app_data_dir()
        .map(|p| p.join("smriti-workspace"))
        .unwrap_or_else(|_| PathBuf::from("data"))
}
