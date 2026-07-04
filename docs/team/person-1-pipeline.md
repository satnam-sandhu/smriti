# Person 1 — Pipeline & Storage (Full Stack · Critical Path)

**You own:** the app runs end-to-end on demo day. If nothing else works, your path must work.

**Time:** 2:00 PM → 6:00 PM demo  
**Wow moments you enable:** #3 (JSON → Parquet), #4 (failure doesn't crash batch)

---

## Your stack

- Tauri (Rust) commands + Python or Node sidecar for processing (pick what team knows fastest)
- SQLite (metadata, jobs, failures)
- Local folders: `bronze/`, `silver/`, `gold/`, `quarantine/`
- DuckDB + Parquet (Gold layer)

---

## Hour-by-hour

### 2:00–2:30 — Scaffold + contract

- [ ] Init Tauri + React if not done (`pnpm create tauri-app` or use existing repo)
- [ ] Create folder layout:
  ```
  data/
    bronze/
    silver/
    gold/domain=healthcare/year=2026/month=07/
    quarantine/
  smriti.db   (SQLite)
  ```
- [ ] Share this TypeScript type with team (paste in Slack, don't debate):

```ts
export type ParserPath = "ai" | "deterministic";

export type ProcessResult = {
  fileId: string;
  fileName: string;
  status: "completed" | "failed" | "processing" | "queued";
  parserPath?: ParserPath;
  silverJson?: Record<string, unknown>;
  errorCode?: "CORRUPT_FILE" | "SCHEMA_MISMATCH" | "VALIDATION_ERROR" | "UNKNOWN_LAYOUT";
  errorDetail?: string;
};

export type PipelineMetrics = {
  totalFiles: number;
  totalBytes: number;
  completed: number;
  failed: number;
  inProgress: number;
  accuracyPct: number;       // Person 2 fills logic; you aggregate
  validationPassRate: number;
  aiParsed: number;
  deterministicParsed: number;
  recentFailures: Array<{ fileName: string; errorCode: string; timestamp: string }>;
};
```

- [ ] SQLite tables (minimum):
  - `files` — id, name, path, mime, bytes, status, parser_path, created_at
  - `failures` — file_id, error_code, error_detail, timestamp

### 2:30–3:30 — Ingest + Bronze

- [ ] Tauri command: `ingest_files(paths: string[])` → copy to bronze, insert SQLite, emit `file:queued`
- [ ] Tauri command: `process_batch()` → loop files, never throw on single failure
- [ ] On corrupt/unreadable file → move to `quarantine/`, write failure row, **continue batch**

### 3:30–4:30 — Silver + Gold (happy path)

- [ ] Call Person 2's parse function per file:
  - Input: bronze file path
  - Output: `{ json, parserPath }` or `{ errorCode, errorDetail }`
- [ ] Write `silver/{fileId}.json`
- [ ] Convert JSON → Parquet append to gold partition
- [ ] Register Parquet in DuckDB (in-memory or file-backed)
- [ ] Emit Tauri events: `file:completed`, `file:failed`, `metrics:update`

### 4:30–5:15 — Commands for UI + demo

- [ ] `get_metrics()` → `PipelineMetrics`
- [ ] `get_file_detail(fileId)` → bronze path + silver JSON + gold row preview
- [ ] `run_analytics_query(sql: string)` → `{ columns, rows }` for demo SQL:
  ```sql
  SELECT * FROM read_parquet('data/gold/domain=healthcare/year=2026/month=07/*.parquet') LIMIT 5;
  ```
- [ ] `list_files()` → all files with status for side-by-side viewer

### 5:15–5:45 — Integration + failure test

- [ ] Test with Person 4's sample docs (full batch including corrupt PDF)
- [ ] Verify: 1 failure → quarantine, rest complete
- [ ] Verify: re-ingest same PDF → Person 2 returns `deterministic`

### 5:45–6:00 — Demo standby

- [ ] App builds and opens cleanly
- [ ] Pre-run batch once before judges; don't start cold
- [ ] Stay on call — you fix pipeline blockers only

---

## Tauri commands checklist

| Command | Priority | Owner |
|---------|----------|-------|
| `ingest_files` | P0 | You |
| `process_batch` | P0 | You |
| `get_metrics` | P0 | You |
| `get_file_detail` | P0 | You |
| `list_files` | P1 | You |
| `run_analytics_query` | P1 | You |

---

## Do NOT build

- Cloud connectors, auth, Postgres, Qdrant
- Parser logic (Person 2)
- UI (Person 3)
- Sample docs (Person 4)

---

## Done by 6 PM

- [ ] Drop 5+ files → ≥4 succeed, ≥1 quarantined
- [ ] Parquet file exists on disk
- [ ] DuckDB query returns rows live
- [ ] Dashboard gets live metrics via events
- [ ] Re-ingest shows `deterministic` parser path

---

## If blocked

| Blocker | Fallback |
|---------|----------|
| Parquet conversion hard | Write JSON lines to gold folder; DuckDB reads JSON for demo |
| Tauri-Rust slow | Shell out to Python script for process_batch |
| DuckDB won't bind | Run query via Python subprocess, return JSON to UI |
