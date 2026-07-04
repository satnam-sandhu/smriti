# Smriti Architecture

**Innovation Spike 2026 � Topic 2: Turning Messy Enterprise Documents Into Usable Data**

This document explains how Smriti is built and why each major technology choice was made. It is written for judges reviewing the codebase and for the 15-minute demo architecture justification segment.

---

## Problem

Enterprises ingest large volumes of administrative documents locked in incompatible formats: multi-column PDFs, nested Excel ledgers, plain-text exports, and scanned handwritten notes. Manual re-entry is slow, error-prone, and does not scale. Smriti converts these files into a uniform, queryable data lake with live pipeline health metrics and graceful failure handling.

---

## High-Level Architecture

```
???????????????????????????????????????????????????????????????????????????
?  Presentation                                                           ?
?  ????????????????????  ????????????????????  ????????????????????????  ?
?  ? Tauri + React    ?  ? NitroChat embed  ?  ? NitroStudio / agents ?  ?
?  ? (desktop UI)     ?  ? (chat over MCP)  ?  ? (MCP tool calls)     ?  ?
?  ????????????????????  ????????????????????  ????????????????????????  ?
??????????????????????????????????????????????????????????????????????????
            ? Tauri commands      ? HTTP                  ? STDIO/HTTP
            ?                     ?                       ?
???????????????????????????????????????????????????????????????????????????
?  Orchestration                                                          ?
?  ???????????????????????????????  ????????????????????????????????????  ?
?  ? src-tauri/ (Rust)           ?  ? mcp/ (NitroStack MCP server)   ?  ?
?  ? ingest � batch � metrics    ?  ? upload_document � analytics�   ?  ?
?  ???????????????????????????????  ????????????????????????????????????  ?
???????????????????????????????????????????????????????????????????????????
                  ? subprocess                     ? smriti-bridge.ts
                  ?                                ?
???????????????????????????????????????????????????????????????????????????
?  Parser engine (Python)                                                 ?
?  parser/cli.py          � adaptive layout learning + deterministic DSL  ?
?  parser/mcp_bridge.py   � SQLite registry, metrics, DuckDB queries      ?
?  parser/connectors_cli.py � optional cloud/local folder connectors      ?
???????????????????????????????????????????????????????????????????????????
                  ?
                  ?
???????????????????????????????????????????????????????????????????????????
?  Unified workspace (data/)                                              ?
?  bronze/  silver/  gold/domain=finance/year=YYYY/month=MM/*.parquet     ?
?  smriti.db (SQLite) � quarantine/ � parser registry                     ?
???????????????????????????????????????????????????????????????????????????
                  ?
                  ? (first-time layout only)
         OpenRouter ? Gemini 2.5 Flash
```

Both the Tauri desktop app and the MCP server read and write the **same `data/` workspace**. A file ingested in the UI is visible to MCP tools and vice versa.

---

## Medallion Pipeline

| Layer | Location | Purpose |
|-------|----------|---------|
| **Bronze** | `data/bronze/` | Immutable raw blobs. Checksum, MIME type, ingest timestamp captured in SQLite. Never modified after write. |
| **Silver** | `data/silver/` | Validated JSON per document. Output of deterministic parser or first-time Gemini layout learning. Schema validated against plugin JSON Schema / Pydantic models. |
| **Gold** | `data/gold/domain={plugin}/year={y}/month={m}/` | Snappy-compressed Parquet partitions for analytics. Registered in DuckDB for instant SQL. |

**Partition convention:** `gold/domain=finance/year=2026/month=07/*.parquet`

This matches the hackathon Topic 2 output spec and keeps domain/time slicing explicit for downstream analytics.

---

## Adaptive Parser (AI Once, Deterministic Forever)

Smriti avoids writing custom regex or layout rules per document type.

```
Unknown layout  ?  Gemini 2.5 Flash (via OpenRouter)  ?  Extraction DSL
                                                          ?  Validation
                                                          ?  Parser Registry (SQLite)

Known layout    ?  Registry lookup  ?  Deterministic parser  ?  0 LLM calls
```

**Fingerprinting:** SHA-256 of `(doc_type + first_500_bytes)` plus filename prefix heuristics (`report_`, `ledger_`, `statement_`).

**Wow moment for demo:** drop an unknown annual report ? `LLM_CALL: yes` ? DSL saved. Re-drop the same file ? `LLM_CALL: no`, instant parse.

Parser logic lives in `parser/cli.py`. Registry and metrics in `parser/mcp_bridge.py`.

---

## Technology Choices & Justification

| Choice | Why |
|--------|-----|
| **Tauri (Rust + React)** | Desktop-first: local files stay on disk, no server required for core pipeline. Rust handles file I/O, checksums, and subprocess orchestration reliably. React reuses web UI skills. Fits enterprise air-gapped / local-first security story. |
| **Python parser** | Best ecosystem for PDF/Excel/image extraction (PyMuPDF, openpyxl, Pillow). Team can iterate DSL generation quickly. Invoked as subprocess from Rust and MCP � clear separation of concerns. |
| **SQLite** | Zero-config metadata store for hackathon MVP: file registry, job queue, audit log, failure records, parser registry. Production path: PostgreSQL. |
| **Parquet + DuckDB** | Gold layer matches big-data convention (partitioned columnar storage). DuckDB embeds in-process � no separate analytics server. Judges can run SQL with `analytics_query` MCP tool or Tauri command. |
| **OpenRouter + Gemini 2.5 Flash** | Multimodal layout understanding for unknown PDFs/images. Called only on first sight of a template � not on every document. Aligns with playbook guidance to use unified multimodal parsing instead of per-doc regex. |
| **NitroStack MCP** | Every pipeline capability exposed as MCP tools (`upload_document`, `analytics_query`, etc.). External agents and NitroChat can drive the same pipeline as the desktop UI. Required hackathon encouragement: MCP application via NitroStudio. |
| **NitroChat** | Conversational front-end over deployed MCP � demo Topic 2 ingestion + analytics without opening the desktop app. |

**What we deliberately deferred:** cloud connectors (S3, SharePoint), vector search (Qdrant), PostgreSQL, multi-plugin marketplace UI. Scoped out to ship a working end-to-end MVP in two days.

---

## Module Map

| Path | Role |
|------|------|
| `src/` | React UI � drop zone, pipeline dashboard, collection detail, side-by-side extraction view |
| `src-tauri/` | Rust � Tauri commands, SQLite, Bronze write, batch orchestration, Python subprocess calls |
| `parser/` | Python � adaptive parser, DSL registry, validation, DuckDB bridge |
| `mcp/` | NitroStack MCP server � PRD tool surface for agents and NitroChat |
| `nitrochat/` | Branded chat UI pointing at Smriti MCP |
| `shared/types.ts` | API contract between UI, Tauri, and docs |
| `shared/constants.ts` | Active plugin, Gold partition paths, MCP/NitroChat URLs |
| `samples/` | Synthetic demo files + golden expected JSON (always in repo) |
| `data/` | Runtime workspace (gitignored � populate from Google Drive or `samples/`) |

---

## MCP Tool Surface

All tools implemented in `mcp/src/modules/document-intelligence/`.

| Tool | Maps to |
|------|---------|
| `upload_document` | Bronze ingest + parse single file |
| `upload_folder` | Batch ingest |
| `identify_template` | Registry fingerprint match |
| `generate_parser` | Gemini DSL generation |
| `execute_parser` | Deterministic re-parse |
| `get_pipeline_metrics` | Dashboard metrics from SQLite |
| `analytics_query` | DuckDB SQL on Gold Parquet |
| `list_failures` | Quarantined files + error codes |
| `install_plugin` | Activate finance/healthcare schemas |

See [mcp/README.md](../mcp/README.md) for full tool list and example calls.

---

## Failure Handling

| Scenario | Behavior |
|----------|----------|
| Corrupt / truncated PDF | Quarantined to `data/quarantine/` with error code; pipeline continues |
| Schema mismatch | Validation failure logged field-by-field in SQLite; file marked failed, not silently dropped |
| Unknown layout | Gemini learns DSL once; if validation fails, failure recorded with reason |
| Partial parse | Silver JSON written with available fields; accuracy % shown in UI |

Corrupt demo file: `samples/bad/corrupt_test.pdf`

---

## Security & Data Handling

- **Local-first:** Bronze/Silver/Gold and SQLite live under `data/` on disk. No bulk export to cloud unless OpenRouter is configured for layout learning.
- **Secrets:** API keys in `.env` (gitignored). Never hardcoded.
- **Demo data:** Repo ships synthetics in `samples/`. Full banking demo PDFs distributed via [Google Drive](https://drive.google.com/drive/folders/1MY6dU7JDuIlIASu5qzaHghZfMXchVSr9?usp=share_link) � public annual reports only, no private PII/PHI.
- **Audit trail:** Every ingest, parse, validation, and quarantine action timestamped in SQLite.
- **Production path:** encryption at rest for Bronze blobs, RBAC, vault integration (Topic 1 pseudonymization).

## Running Locally (Judges)

```bash
git clone git@github.com:satnam-sandhu/smriti.git && cd smriti
bash scripts/setup.sh
cp .env.example .env          # add OPENROUTER_API_KEY for layout learning
# Optional: download demo PDFs from Google Drive ? data/external/annual reports/

npm run dev                   # desktop app
npm run dev:mcp:http          # MCP on :3000
parser/.venv/bin/python3 parser/cli.py --file samples/good/report_01.pdf
```

Without OpenRouter key: pre-seeded templates in the parser registry still parse deterministically. Unknown layouts require a key for the first-learn step.
