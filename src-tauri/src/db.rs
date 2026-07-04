use crate::models::{
    Collection, CollectionSummary, ErrorBreakdown, FileRecord, FileStatus, ParserPath,
    PipelineActivity, PipelineDayStat, PipelineFailure, PipelineMetrics, PipelineStats,
};
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
    let workspace = canonicalize_dir(&workspace);

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
        CREATE TABLE IF NOT EXISTS collections (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            doc_type TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        ",
    )
    .map_err(|e| e.to_string())?;

    migrate_files_schema(&conn)?;

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
        "INSERT INTO files (id, collection_id, file_name, mime, status, parser_path, bronze_path, silver_path, bytes, error_code, error_detail, accuracy_pct, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![
            record.id,
            record.collection_id,
            record.file_name,
            record.mime,
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
        "UPDATE files SET status = ?1, parser_path = ?2, silver_path = ?3, error_code = ?4, error_detail = ?5, accuracy_pct = ?6, prompt_tokens = ?7, completion_tokens = ?8, ai_cost_usd = ?9 WHERE id = ?10",
        params![
            status_str(&record.status),
            record.parser_path.as_ref().map(parser_path_str),
            record.silver_path,
            record.error_code,
            record.error_detail,
            record.accuracy_pct,
            record.prompt_tokens,
            record.completion_tokens,
            record.ai_cost_usd,
            record.id,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn list_files(conn: &Connection) -> Result<Vec<FileRecord>, String> {
    let mut stmt = conn
        .prepare("SELECT id, collection_id, file_name, mime, status, parser_path, bronze_path, silver_path, bytes, error_code, error_detail, accuracy_pct, prompt_tokens, completion_tokens, ai_cost_usd FROM files ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(FileRecord {
                id: row.get(0)?,
                collection_id: row.get(1)?,
                file_name: row.get(2)?,
                mime: row.get(3)?,
                status: parse_status(row.get::<_, String>(4)?),
                parser_path: row
                    .get::<_, Option<String>>(5)?
                    .map(|s| parse_parser_path(s)),
                bronze_path: row.get(6)?,
                silver_path: row.get(7)?,
                bytes: row.get::<_, i64>(8)? as u64,
                error_code: row.get(9)?,
                error_detail: row.get(10)?,
                accuracy_pct: row.get(11)?,
                prompt_tokens: row.get(12).ok(),
                completion_tokens: row.get(13).ok(),
                ai_cost_usd: row.get(14).ok(),
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn get_file(conn: &Connection, file_id: &str) -> Result<Option<FileRecord>, String> {
    let mut stmt = conn
        .prepare("SELECT id, collection_id, file_name, mime, status, parser_path, bronze_path, silver_path, bytes, error_code, error_detail, accuracy_pct, prompt_tokens, completion_tokens, ai_cost_usd FROM files WHERE id = ?1")
        .map_err(|e| e.to_string())?;

    let mut rows = stmt
        .query(params![file_id])
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        Ok(Some(FileRecord {
            id: row.get(0).map_err(|e| e.to_string())?,
            collection_id: row.get(1).map_err(|e| e.to_string())?,
            file_name: row.get(2).map_err(|e| e.to_string())?,
            mime: row.get(3).map_err(|e| e.to_string())?,
            status: parse_status(row.get(4).map_err(|e| e.to_string())?),
            parser_path: row
                .get::<_, Option<String>>(5)
                .map_err(|e| e.to_string())?
                .map(parse_parser_path),
            bronze_path: row.get(6).map_err(|e| e.to_string())?,
            silver_path: row.get(7).map_err(|e| e.to_string())?,
            bytes: row.get::<_, i64>(8).map_err(|e| e.to_string())? as u64,
            error_code: row.get(9).map_err(|e| e.to_string())?,
            error_detail: row.get(10).map_err(|e| e.to_string())?,
            accuracy_pct: row.get(11).map_err(|e| e.to_string())?,
            prompt_tokens: row.get(12).ok(),
            completion_tokens: row.get(13).ok(),
            ai_cost_usd: row.get(14).ok(),
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
    let unreviewed_failed: u32 = conn
        .query_row(
            "SELECT COUNT(*) FROM files WHERE status = 'failed' AND reviewed_at IS NULL",
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
        unreviewed_failed,
        in_progress,
        accuracy_pct,
        validation_pass_rate,
        ai_parsed,
        deterministic_parsed,
        recent_failures,
    })
}

fn migrate_files_schema(conn: &Connection) -> Result<(), String> {
    let has_mime: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('files') WHERE name = 'mime'",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    if has_mime == 0 {
        conn.execute("ALTER TABLE files ADD COLUMN mime TEXT", [])
            .map_err(|e| e.to_string())?;
    }

    let has_collection: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('files') WHERE name = 'collection_id'",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    if has_collection == 0 {
        conn.execute("ALTER TABLE files ADD COLUMN collection_id TEXT", [])
            .map_err(|e| e.to_string())?;
    }

    let has_reviewed_at: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('files') WHERE name = 'reviewed_at'",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    if has_reviewed_at == 0 {
        conn.execute("ALTER TABLE files ADD COLUMN reviewed_at TEXT", [])
            .map_err(|e| e.to_string())?;
    }

    let has_prompt_tokens: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('files') WHERE name = 'prompt_tokens'",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    if has_prompt_tokens == 0 {
        conn.execute("ALTER TABLE files ADD COLUMN prompt_tokens INTEGER DEFAULT 0", [])
            .map_err(|e| e.to_string())?;
        conn.execute("ALTER TABLE files ADD COLUMN completion_tokens INTEGER DEFAULT 0", [])
            .map_err(|e| e.to_string())?;
        conn.execute("ALTER TABLE files ADD COLUMN ai_cost_usd REAL DEFAULT 0", [])
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

pub fn insert_collection(conn: &Connection, collection: &Collection) -> Result<(), String> {
    conn.execute(
        "INSERT INTO collections (id, name, doc_type, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![
            collection.id,
            collection.name,
            collection.doc_type,
            collection.created_at,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_collection(conn: &Connection, id: &str) -> Result<Option<Collection>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, doc_type, created_at FROM collections WHERE id = ?1")
        .map_err(|e| e.to_string())?;

    let mut rows = stmt.query(params![id]).map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        Ok(Some(Collection {
            id: row.get(0).map_err(|e| e.to_string())?,
            name: row.get(1).map_err(|e| e.to_string())?,
            doc_type: row.get(2).map_err(|e| e.to_string())?,
            created_at: row.get(3).map_err(|e| e.to_string())?,
        }))
    } else {
        Ok(None)
    }
}

pub fn list_collections(conn: &Connection) -> Result<Vec<CollectionSummary>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT c.id, c.name, c.doc_type, c.created_at,
                    COUNT(f.id) as total,
                    SUM(CASE WHEN f.status = 'completed' THEN 1 ELSE 0 END) as completed,
                    SUM(CASE WHEN f.status = 'failed' THEN 1 ELSE 0 END) as failed,
                    SUM(CASE WHEN f.status IN ('queued', 'processing') THEN 1 ELSE 0 END) as in_progress
             FROM collections c
             LEFT JOIN files f ON f.collection_id = c.id
             GROUP BY c.id
             ORDER BY c.created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(CollectionSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                doc_type: row.get(2)?,
                created_at: row.get(3)?,
                total_files: row.get::<_, i64>(4)? as u32,
                completed: row.get::<_, i64>(5)? as u32,
                failed: row.get::<_, i64>(6)? as u32,
                in_progress: row.get::<_, i64>(7)? as u32,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn list_files_for_collection(
    conn: &Connection,
    collection_id: &str,
) -> Result<Vec<FileRecord>, String> {
    let mut stmt = conn
        .prepare("SELECT id, collection_id, file_name, mime, status, parser_path, bronze_path, silver_path, bytes, error_code, error_detail, accuracy_pct, prompt_tokens, completion_tokens, ai_cost_usd FROM files WHERE collection_id = ?1 ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![collection_id], |row| {
            Ok(FileRecord {
                id: row.get(0)?,
                collection_id: row.get(1)?,
                file_name: row.get(2)?,
                mime: row.get(3)?,
                status: parse_status(row.get::<_, String>(4)?),
                parser_path: row
                    .get::<_, Option<String>>(5)?
                    .map(|s| parse_parser_path(s)),
                bronze_path: row.get(6)?,
                silver_path: row.get(7)?,
                bytes: row.get::<_, i64>(8)? as u64,
                error_code: row.get(9)?,
                error_detail: row.get(10)?,
                accuracy_pct: row.get(11)?,
                prompt_tokens: row.get(12).ok(),
                completion_tokens: row.get(13).ok(),
                ai_cost_usd: row.get(14).ok(),
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn list_failed_files(
    conn: &Connection,
) -> Result<Vec<(FileRecord, Option<String>, String, Option<String>)>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT f.id, f.collection_id, f.file_name, f.mime, f.status, f.parser_path,
                    f.bronze_path, f.silver_path, f.bytes, f.error_code, f.error_detail, f.accuracy_pct,
                    f.prompt_tokens, f.completion_tokens, f.ai_cost_usd,
                    c.name,
                    COALESCE(
                      (SELECT timestamp FROM failures WHERE file_id = f.id ORDER BY id DESC LIMIT 1),
                      ''
                    ) as failed_at,
                    f.reviewed_at
             FROM files f
             LEFT JOIN collections c ON f.collection_id = c.id
             WHERE f.status = 'failed'
             ORDER BY f.reviewed_at IS NOT NULL, failed_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                FileRecord {
                    id: row.get(0)?,
                    collection_id: row.get(1)?,
                    file_name: row.get(2)?,
                    mime: row.get(3)?,
                    status: parse_status(row.get::<_, String>(4)?),
                    parser_path: row
                        .get::<_, Option<String>>(5)?
                        .map(|s| parse_parser_path(s)),
                    bronze_path: row.get(6)?,
                    silver_path: row.get(7)?,
                    bytes: row.get::<_, i64>(8)? as u64,
                    error_code: row.get(9)?,
                    error_detail: row.get(10)?,
                    accuracy_pct: row.get(11)?,
                    prompt_tokens: row.get(12).ok(),
                    completion_tokens: row.get(13).ok(),
                    ai_cost_usd: row.get(14).ok(),
                },
                row.get::<_, Option<String>>(15)?,
                row.get::<_, String>(16)?,
                row.get::<_, Option<String>>(17)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn mark_file_reviewed(
    conn: &Connection,
    file_id: &str,
    reviewed_at: &str,
) -> Result<(), String> {
    let updated = conn
        .execute(
            "UPDATE files SET reviewed_at = ?1 WHERE id = ?2 AND status = 'failed'",
            params![reviewed_at, file_id],
        )
        .map_err(|e| e.to_string())?;
    if updated == 0 {
        return Err("Failed file not found".into());
    }
    Ok(())
}

pub fn get_pipeline_stats(
    conn: &Connection,
    start_date: Option<&str>,
    end_date: Option<&str>,
    activity_page: u32,
    activity_page_size: u32,
    failures_page: u32,
    failures_page_size: u32,
) -> Result<PipelineStats, String> {
    let date_clause = "AND (?1 IS NULL OR date(created_at) >= date(?1)) AND (?2 IS NULL OR date(created_at) <= date(?2))";
    let failure_date_clause =
        "AND (?1 IS NULL OR date(timestamp) >= date(?1)) AND (?2 IS NULL OR date(timestamp) <= date(?2))";

    let count_query = |extra: &str| -> String {
        format!("SELECT COUNT(*) FROM files WHERE 1=1 {date_clause} {extra}")
    };

    let total_files: u32 = conn
        .query_row(&count_query(""), params![start_date, end_date], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let total_bytes: u64 = conn
        .query_row(
            &format!("SELECT COALESCE(SUM(bytes), 0) FROM files WHERE 1=1 {date_clause}"),
            params![start_date, end_date],
            |r| r.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())? as u64;
    let completed: u32 = conn
        .query_row(
            &count_query("AND status = 'completed'"),
            params![start_date, end_date],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let failed: u32 = conn
        .query_row(
            &count_query("AND status = 'failed'"),
            params![start_date, end_date],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let in_progress: u32 = conn
        .query_row(
            &count_query("AND status IN ('queued', 'processing')"),
            params![start_date, end_date],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let ai_parsed: u32 = conn
        .query_row(
            &count_query("AND parser_path = 'ai'"),
            params![start_date, end_date],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let deterministic_parsed: u32 = conn
        .query_row(
            &count_query("AND parser_path = 'deterministic'"),
            params![start_date, end_date],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let llm_calls: u32 = conn
        .query_row(
            &count_query("AND COALESCE(prompt_tokens, 0) > 0"),
            params![start_date, end_date],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let accuracy_pct: f64 = conn
        .query_row(
            &format!(
                "SELECT COALESCE(AVG(accuracy_pct), 0) FROM files WHERE accuracy_pct IS NOT NULL {date_clause}"
            ),
            params![start_date, end_date],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let prompt_tokens: u32 = conn
        .query_row(
            &format!(
                "SELECT COALESCE(SUM(prompt_tokens), 0) FROM files WHERE 1=1 {date_clause}"
            ),
            params![start_date, end_date],
            |r| r.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())? as u32;
    let completion_tokens: u32 = conn
        .query_row(
            &format!(
                "SELECT COALESCE(SUM(completion_tokens), 0) FROM files WHERE 1=1 {date_clause}"
            ),
            params![start_date, end_date],
            |r| r.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())? as u32;
    let ai_cost_usd: f64 = conn
        .query_row(
            &format!("SELECT COALESCE(SUM(ai_cost_usd), 0) FROM files WHERE 1=1 {date_clause}"),
            params![start_date, end_date],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let validation_pass_rate: f64 = if total_files > 0 {
        (completed as f64 / total_files as f64) * 100.0
    } else {
        0.0
    };

    let activity_page = activity_page.max(1);
    let activity_page_size = activity_page_size.clamp(1, 100);
    let failures_page = failures_page.max(1);
    let failures_page_size = failures_page_size.clamp(1, 100);
    let activity_offset = (activity_page - 1) * activity_page_size;
    let failures_offset = (failures_page - 1) * failures_page_size;

    let activity_total: u32 = conn
        .query_row(
            &format!("SELECT COUNT(*) FROM files WHERE 1=1 {date_clause}"),
            params![start_date, end_date],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    let mut activity_stmt = conn
        .prepare(&format!(
            "SELECT id, file_name, status, parser_path, COALESCE(prompt_tokens, 0), COALESCE(completion_tokens, 0),
                    COALESCE(ai_cost_usd, 0), bytes, created_at, error_code
             FROM files WHERE 1=1 {date_clause}
             ORDER BY created_at DESC LIMIT ?3 OFFSET ?4"
        ))
        .map_err(|e| e.to_string())?;
    let activity = activity_stmt
        .query_map(
            params![start_date, end_date, activity_page_size, activity_offset],
            |row| {
                Ok(PipelineActivity {
                    file_id: row.get(0)?,
                    file_name: row.get(1)?,
                    status: parse_status(row.get::<_, String>(2)?),
                    parser_path: row
                        .get::<_, Option<String>>(3)?
                        .map(|s| parse_parser_path(s)),
                    prompt_tokens: row.get::<_, i64>(4)? as u32,
                    completion_tokens: row.get::<_, i64>(5)? as u32,
                    ai_cost_usd: row.get(6)?,
                    bytes: row.get::<_, i64>(7)? as u64,
                    created_at: row.get(8)?,
                    error_code: row.get(9)?,
                })
            },
        )
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut daily_stmt = conn
        .prepare(&format!(
            "SELECT date(created_at) as day,
                    COUNT(*) as ingested,
                    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
                    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
                    COALESCE(SUM(prompt_tokens), 0) as tokens,
                    COALESCE(SUM(ai_cost_usd), 0) as cost
             FROM files WHERE 1=1 {date_clause}
             GROUP BY day
             ORDER BY day DESC
             LIMIT 14"
        ))
        .map_err(|e| e.to_string())?;
    let daily_stats = daily_stmt
        .query_map(params![start_date, end_date], |row| {
            Ok(PipelineDayStat {
                date: row.get(0)?,
                ingested: row.get::<_, i64>(1)? as u32,
                completed: row.get::<_, i64>(2)? as u32,
                failed: row.get::<_, i64>(3)? as u32,
                tokens: row.get::<_, i64>(4)? as u32,
                cost_usd: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect::<Vec<_>>();

    let mut errors_stmt = conn
        .prepare(&format!(
            "SELECT error_code, COUNT(*) as cnt FROM failures WHERE 1=1 {failure_date_clause}
             GROUP BY error_code ORDER BY cnt DESC LIMIT 8"
        ))
        .map_err(|e| e.to_string())?;
    let errors_by_code = errors_stmt
        .query_map(params![start_date, end_date], |row| {
            Ok(ErrorBreakdown {
                error_code: row.get(0)?,
                count: row.get::<_, i64>(1)? as u32,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let failures_total: u32 = conn
        .query_row(
            &format!("SELECT COUNT(*) FROM failures WHERE 1=1 {failure_date_clause}"),
            params![start_date, end_date],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    let mut failures_stmt = conn
        .prepare(&format!(
            "SELECT file_name, error_code, timestamp FROM failures WHERE 1=1 {failure_date_clause}
             ORDER BY id DESC LIMIT ?3 OFFSET ?4"
        ))
        .map_err(|e| e.to_string())?;
    let recent_failures = failures_stmt
        .query_map(
            params![start_date, end_date, failures_page_size, failures_offset],
            |row| {
                Ok(PipelineFailure {
                    file_name: row.get(0)?,
                    error_code: row.get(1)?,
                    timestamp: row.get(2)?,
                })
            },
        )
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(PipelineStats {
        start_date: start_date.map(|s| s.to_string()),
        end_date: end_date.map(|s| s.to_string()),
        total_files,
        total_bytes,
        completed,
        failed,
        in_progress,
        ai_parsed,
        deterministic_parsed,
        llm_calls,
        accuracy_pct,
        validation_pass_rate,
        prompt_tokens,
        completion_tokens,
        total_tokens: prompt_tokens + completion_tokens,
        ai_cost_usd,
        activity,
        activity_total,
        activity_page,
        activity_page_size,
        daily_stats,
        errors_by_code,
        recent_failures,
        failures_total,
        failures_page,
        failures_page_size,
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

fn canonicalize_dir(path: &PathBuf) -> PathBuf {
    if path.exists() {
        return std::fs::canonicalize(path).unwrap_or_else(|_| path.clone());
    }
    if let Some(parent) = path.parent() {
        if parent.exists() {
            if let Ok(canon_parent) = std::fs::canonicalize(parent) {
                if let Some(name) = path.file_name() {
                    return canon_parent.join(name);
                }
            }
        }
    }
    path.clone()
}
