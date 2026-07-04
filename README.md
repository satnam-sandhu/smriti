# Smriti

Enterprise multimodal document ingestion — Hackathon MVP (Topic 2).

**Bronze → Silver → Gold** medallion pipeline with adaptive parser (AI once, deterministic forever).

**Demo plugin:** Finance (Banking) — annual reports, ledgers, bank statements.

## Quick start

```bash
bash scripts/setup.sh
cp .env.example .env   # add OPENROUTER_API_KEY
npm run dev            # Smriti desktop app
npm run dev:mcp        # NitroStack MCP (Person 4)
```

## Repo structure

```
smriti/
├── src/                 # React UI (Person 3)
├── src-tauri/           # Tauri/Rust pipeline (Person 1)
├── parser/              # Python parser + OpenRouter DSL (Person 2)
├── mcp/                 # NitroStack MCP server (Person 4)
├── shared/types.ts      # API contract — all team reads this
├── samples/             # Synthetics + expected JSON (Person 4)
├── data/external/       # Real demo PDFs — annual reports (banking)
├── docs/                # PRD + team task files
└── scripts/setup.sh
```

## Tauri commands (API contract)

| Command | Description |
|---------|-------------|
| `ingest_files` | Copy files to Bronze, queue in SQLite |
| `process_batch` | Parse all queued files → Silver → Gold |
| `get_metrics` | Pipeline dashboard metrics |
| `get_file_detail` | Side-by-side extraction view data |
| `list_files` | All files with status |
| `run_analytics_query` | DuckDB SQL on Gold Parquet |

## MCP tools

| Tool | Description |
|------|-------------|
| `upload_document` | Ingest + parse single file |
| `get_pipeline_metrics` | Metrics snapshot |
| `analytics_query` | DuckDB SQL query |

Connect via [NitroStudio](https://nitrostack.ai/studio) → open `mcp/` folder.

## Team assignments

See `docs/team/person-*.md` for hour-by-hour tasks.

## Parser CLI (standalone test)

```bash
# Synthetic dev file
parser/.venv/bin/python3 parser/cli.py --file samples/good/report_01.pdf

# Real banking demo PDF
parser/.venv/bin/python3 parser/cli.py --file "data/external/annual reports/PL.pdf"
```

Second run on same file → `LLM_CALL: no` (deterministic).
