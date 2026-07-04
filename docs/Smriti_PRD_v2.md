# Smriti PRD v2.1

**Enterprise Multimodal Data Ingestion Platform — Hackathon MVP (Topic 2)**

---

## Vision

Desktop-first (Tauri) enterprise multimodal ingestion platform with embedded NitroStack MCP runtime. AI learns document layouts once, generates deterministic extraction DSLs, and processes future documents without repeated LLM calls. Industry functionality is provided through plugins.

**Hackathon goal:** demonstrate a working end-to-end medallion pipeline that converts messy enterprise documents (handwritten images, complex Excel, multi-column PDFs) into partitioned Parquet analytics tables, with live pipeline health metrics and graceful failure handling.

---

## Hackathon Scope

### In Scope (MVP — 2 Days)

- Phases 0–5 only: Workspace, Acquisition, Intake, Parser Generation, Processing, Storage
- Input types: TXT, multi-column PDF, complex multi-tab Excel, handwritten/scanned images
- Drag & drop and local folder upload
- Medallion pipeline: Bronze (raw) → Silver (validated JSON) → Gold (Parquet)
- Adaptive parser: Gemini learns unknown layout → Extraction DSL → Parser Registry → deterministic re-parse
- Pipeline Health Dashboard (real-time metrics)
- Failure handling for corrupt files, schema mismatches, and partial parses
- One industry plugin with 3 document schemas — **Finance (Banking)** for hackathon demo
- Embedded NitroStack MCP runtime + NitroStudio MCP app (1 team member)
- DuckDB SQL query demo over Gold Parquet
- 15-minute live demo script (rehearsed end-to-end workflow)

### Deferred (Post-Hackathon / Production)

- Phase 6: Intelligence (embeddings, semantic search)
- Phase 8: Consumption (RAG dashboards — Topic 4)
- Qdrant vector database
- Cloud connectors: S3, Azure Blob, GCS, SharePoint, OneDrive, Google Drive
- REST API connectors, webhooks, database imports, email ingestion
- ZIP archive ingestion, nested folder watchers
- Additional input formats: XML, JSON (unless needed by demo plugin)
- Multi-plugin marketplace and plugin store UI
- PostgreSQL (use SQLite for hackathon; Postgres for production)

---

## Lifecycle

### Active Phases (Hackathon)

1. **Phase 0: Workspace & Governance** — local workspace config, security policies, synthetic/sample data policy
2. **Phase 1: Data Acquisition** — drag & drop, local folder upload
3. **Phase 2: Intake Processing** — file type detection, checksum, metadata capture, Bronze layer write
4. **Phase 3: Adaptive Parser Generation** — template identification, Gemini DSL generation, validation, registry
5. **Phase 4: Document Processing** — deterministic parser execution, Silver layer JSON output
6. **Phase 5: Storage** — Gold layer Parquet write, DuckDB registration, SQLite metadata

### Deferred Phases

- **Phase 6: Intelligence** — embeddings, semantic search (Qdrant)
- **Phase 7: Embedded NitroStack MCP Layer** — full tool surface (MVP ships core tools only)
- **Phase 8: Consumption** — query UI, export APIs, RAG integration

---

## Medallion Architecture

### Bronze Layer (Raw Archive)

- Store original ingested documents as immutable raw blobs in local object storage
- Capture: file name, MIME type, SHA-256 checksum, ingest timestamp, source path, byte size
- Never modify or delete Bronze artifacts during processing

### Silver Layer (Structured & Validated)

- Parse documents via deterministic DSL or Gemini (first-time layout learning only)
- Validate output against plugin JSON Schema / Pydantic models
- Output: one validated JSON record per logical document (or per page/section where applicable)
- Log every validation failure with field-level error detail — do not silently drop records
- Quarantine corrupt or unparseable files to a dead-letter queue with reason codes

### Gold Layer (Curated Analytics)

- Convert validated Silver JSON into compressed, partition-based Parquet files
- **Partition convention (required):** `{lake_root}/domain={domain}/year={year}/month={month}/*.parquet`
- **Example:** `data/gold/domain=finance/year=2026/month=07/batch_001.parquet`
- Register partitions in DuckDB for instant SQL analytics
- Schema evolution: new fields append as nullable columns; breaking changes require plugin version bump

---

## Data Acquisition

### Hackathon Inputs

| Type | Description |
|------|-------------|
| TXT | Plain text logs and exports |
| PDF | Multi-column financial reports, invoices, annual filings |
| Excel | Multi-tab account ledgers with nested tables |
| Images | Scanned bank statements, transaction slips (PNG, JPEG, TIFF) |
| Upload | Drag & drop (single files and folders) |

### Demo Document Set (Minimum)

Prepare 8–10 labeled sample documents across 3 types for accuracy measurement:

- 3× scanned bank statements or transaction slips (images)
- 3× multi-tab Excel account ledgers
- 3× multi-column PDF financial reports (annual reports, P&L, balance sheet)
- 1× corrupt/truncated PDF (failure demo)
- 1× Excel with unexpected column layout (schema mismatch demo)

> All demo documents must be synthetic or publicly anonymized — no real PII/PHI in repo or live demo.

---

## Adaptive Parser Generation

```
Unknown layout  →  Gemini 2.5 Flash  →  Extraction DSL  →  Validation  →  Parser Registry
Known layout    →  Deterministic Parser (zero LLM calls)
```

- AI is invoked only when: (a) no matching template in registry, or (b) admin explicitly requests re-learning
- Registry stores: template fingerprint, DSL source, JSON Schema, creation timestamp, accuracy baseline
- Re-ingestion of same layout must demonstrate deterministic path in live demo (key differentiator)

---

## Failure Handling & Resilience

The pipeline must never crash on bad input. All failures surface on the Pipeline Health Dashboard.

### Failure Categories

| Code | Description |
|------|-------------|
| `CORRUPT_FILE` | Truncated PDF, unreadable image, password-protected Excel |
| `SCHEMA_MISMATCH` | Extracted fields don't match plugin schema (missing required, wrong types) |
| `PARTIAL_PARSE` | Some fields extracted, others failed (e.g., illegible handwriting region) |
| `UNKNOWN_LAYOUT` | No registry match and Gemini unavailable or timed out |
| `VALIDATION_ERROR` | Pydantic/JSON Schema rejection with field-level detail |

### Failure Behavior

- Write failure record to SQLite with: `file_id`, `error_code`, `error_detail`, `timestamp`
- Move source file to `quarantine/` directory with matching error metadata sidecar JSON
- Continue processing remaining files in batch — no all-or-nothing abort
- Surface failure count and recent errors on dashboard in real time
- Allow admin retry after schema update or manual template assignment

---

## Pipeline Health Dashboard

Required hackathon output. Real-time UI panel updated as files flow through the pipeline.

### Metrics (Required)

- Total files ingested (count) and total bytes ingested
- Files by type breakdown (PDF / Excel / Image / TXT)
- Processing status: queued, in-progress, completed, failed
- Layout extraction accuracy: % of expected fields successfully extracted (per document type)
- Validation pass rate: % of Silver records passing schema validation
- Validation failure rate: count and % with drill-down to field-level errors
- Processing latency: p50 and p95 end-to-end (ingest → Gold Parquet write)
- Parser path split: deterministic (registry hit) vs AI-learned (Gemini invoked)
- Recent failures table: file name, error code, timestamp, retry action

### UI Requirements

- Live updating without page refresh (WebSocket or Tauri event stream)
- Color-coded status indicators (green/yellow/red) for pass/warn/fail
- Click-through from metric to underlying file list and error detail
- Visible during 15-minute demo — judges must see metrics move in real time

---

## Accuracy & Validation

### Validation Layer

- Every plugin defines JSON Schema + Pydantic models for its document types
- Silver layer rejects records that fail validation; failures logged, not silently dropped
- Field-level confidence scores where parser supports them (especially handwriting OCR)

### Accuracy Measurement

- Maintain a labeled golden set (8–10 docs) with expected field values
- Compute extraction accuracy: `(correct fields / total expected fields) × 100` per document
- Aggregate accuracy displayed on Pipeline Health Dashboard by document type
- Demo must show side-by-side: source document → extracted JSON → Parquet row
- **Target:** ≥85% field accuracy on golden set for hackathon demo

---

## Security & Responsible Data Handling

- **Local-first processing:** files stay on disk unless admin opts into cloud Gemini API
- **Gemini API calls:** send only document content needed for layout learning; no bulk export
- **Demo data policy:** synthetic or anonymized samples only; no real PII/PHI in repo
- **Secrets:** API keys in OS keychain / `.env` excluded from git; never hardcoded
- **Workspace isolation:** each workspace has separate Bronze/Silver/Gold directories and SQLite DB
- **Audit log:** every ingest, parse, validation, and quarantine action timestamped in SQLite
- **Future (production):** encryption at rest for Bronze blobs, role-based access, vault for tokenized fields (Topic 1 integration)

---

## Architecture

```
React UI
    ↓
Tauri Commands
    ↓
Embedded NitroStack MCP Runtime
    ├ Upload
    ├ Parser
    ├ Plugin Manager
    ├ Analytics (Pipeline Dashboard)
    ├ AI Manager
    └ Storage
    ↓
SQLite | DuckDB | Local Object Storage (Bronze/Gold)
    ↓
Optional Cloud: Gemini API (layout learning only)
```

---

## Storage

| Layer | Technology | Purpose |
|-------|------------|---------|
| Bronze / Gold blobs | Local object storage | Raw files + Parquet partitions |
| Metadata & state | SQLite (hackathon) / PostgreSQL (production) | Registry, jobs, audit log, failures |
| Analytics | Parquet (Snappy) | Gold layer, partition-by domain/year/month |
| Query engine | DuckDB | Embedded SQL over Parquet — no separate server |
| Search (deferred) | Qdrant | Embeddings and semantic search — Phase 6 |

---

## MCP Integration

All internal modules communicate through embedded NitroStack MCP. One team member builds a NitroStudio MCP app exposing Smriti tools to external agents.

### MCP Tool Domains

- **Ingestion** — upload, batch processing
- **Parser** — template identification, DSL generation, execution
- **Storage** — layer read/write, partition listing
- **Analytics** — dashboard metrics, query execution
- **Plugins** — schema listing, plugin activation

### Minimum MCP Tools (Hackathon)

| Tool | Description |
|------|-------------|
| `upload_document` | Ingest single file into Bronze |
| `upload_folder` | Batch ingest local directory |
| `identify_template` | Match file against parser registry |
| `generate_parser` | Invoke Gemini to create DSL for unknown layout |
| `execute_parser` | Run deterministic parser on document |
| `get_pipeline_metrics` | Return dashboard metrics snapshot |
| `analytics_query` | Run DuckDB SQL against Gold Parquet |
| `list_failures` | Return quarantined files with error codes |
| `install_plugin` | Activate industry plugin schemas and validators |

---

## Plugins

Each plugin contributes: JSON Schemas, Pydantic validators, Gemini prompts, extraction DSLs, dashboard widgets, and MCP tools.

### Hackathon Plugin — **Finance (Banking)** ✓ selected

| Plugin | Document Types |
|--------|----------------|
| ~~Healthcare~~ | Medical receipts (image), clinical PDF records, patient ledger Excel |
| **Finance** | Annual report PDFs (P&L, BS, CF), account ledger Excel, bank statement images |

Demo data: `data/external/annual reports/` (18 public filing PDFs). Synthetics in `samples/good/`.

---

## 15-Minute Demo Script

| Step | Time | Action |
|------|------|--------|
| 1 | 1 min | Problem statement — messy enterprise docs, manual re-entry, incompatible formats |
| 2 | 1 min | Drop batch of 5–6 files via drag & drop — dashboard shows ingest starting |
| 3 | 2 min | Watch Pipeline Health Dashboard update live — bytes, counts, latency |
| 4 | 3 min | Show one unknown layout: Gemini learns → DSL saved to registry |
| 5 | 1 min | Re-ingest same layout: deterministic parse, zero LLM call (key wow moment) |
| 6 | 2 min | Show failure handling: corrupt PDF quarantined, schema mismatch logged |
| 7 | 2 min | Side-by-side: source doc → JSON → Parquet row with accuracy % |
| 8 | 1 min | DuckDB SQL query on Gold Parquet partition |
| 9 | 1 min | MCP tool call from NitroStudio: `upload_document` + `analytics_query` |
| 10 | 1 min | Architecture justification + security story |

---

## Evaluation Alignment

Mapping to Innovation Spike 2026 scoring criteria:

| Pillar | Weight | How Smriti Addresses It |
|--------|--------|------------------------|
| Working Prototype | 25% | End-to-end demo script; failure paths included |
| Problem Fit | 20% | Topic 2: messy docs → usable Parquet data lake |
| Technical Design | 20% | Medallion + MCP + deterministic parser registry; justify Tauri/desktop choice |
| AI Quality | 15% | Golden set accuracy metrics on dashboard; deterministic re-parse proof |
| Security | 10% | Local-first, synthetic data, keychain secrets, audit log |
| UX & Demo | 10% | Live dashboard, side-by-side extraction view, rehearsed 15-min flow |

---

## Differentiators

- **Desktop-first** — local files, air-gapped option, no cloud dependency for core pipeline
- **Embedded MCP** — every capability exposed as tool; NitroStudio app for agent integration
- **AI once, deterministic forever** — learn layout once, never pay LLM cost again for same template
- **Plugin architecture** — industry schemas without forking core engine
- **Medallion data lake** — Bronze/Silver/Gold with partitioned Parquet and DuckDB analytics
- **Graceful failure handling** — corrupt files and schema mismatches never crash the pipeline
