# Smriti

Enterprise multimodal document ingestion — Hackathon MVP (Topic 2).

**Bronze → Silver → Gold** medallion pipeline with adaptive parser (AI once, deterministic forever).

**Demo plugin:** Finance (Banking) — annual reports, ledgers, bank statements.

## Live demo

| Service | URL |
|---------|-----|
| **NitroChat (embed)** | https://nitrochat-yyy-6a3e700a-hemants-org-9744dc11.staging.nitrocloud.ai/embed |
| **MCP server** | https://atlas-mcp-6a47d4fa-biliings-org-7cb21717.dev.nitrocloud.ai |

In [NitroStudio](https://nitrostack.ai/studio), point the chatbot’s MCP server URL at the MCP link above if tools don’t load in chat.

## Quick start

```bash
bash scripts/setup.sh
cp .env.example .env   # add OPENROUTER_API_KEY
npm run dev            # Smriti desktop app
npm run dev:mcp        # NitroStack MCP server
npm run dev:nitrochat  # NitroChat UI (port 3003)
```

## Repo structure

```
smriti/
├── src/                 # React UI (Person 3)
├── src-tauri/           # Tauri/Rust pipeline (Person 1)
├── parser/              # Python parser + OpenRouter DSL (Person 2)
├── mcp/                 # NitroStack MCP server (Person 4) — Full PRD tools
├── nitrochat/           # NitroChat UI for MCP (develop branch, Smriti-branded)
├── shared/types.ts      # API contract — all team reads this
├── shared/constants.ts  # Active plugin + Gold partition paths
├── data/                # Unified workspace (Bronze/Silver/Gold/SQLite)
│   └── external/        # Real demo PDFs — annual reports (banking)
├── samples/             # Synthetics + expected JSON (Person 4)
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

## MCP tools (Full PRD)

| Tool | Description |
|------|-------------|
| `upload_document` | Ingest + parse single file |
| `upload_folder` | Batch ingest local directory |
| `identify_template` | Match file against parser registry |
| `generate_parser` | Invoke Gemini to create DSL |
| `execute_parser` | Run deterministic parser |
| `get_pipeline_metrics` | Metrics snapshot |
| `analytics_query` | DuckDB SQL query |
| `list_failures` | Quarantined files with error codes |
| `install_plugin` | Activate healthcare/finance plugin |

Connect via [NitroStudio](https://nitrostack.ai/studio) → open `mcp/` folder.

See [mcp/README.md](mcp/README.md) for full tool list and architecture.

## NitroChat (local)

The `nitrochat/` folder is the [NitroChat](https://github.com/nitrocloudofficial/nitrochat) `develop` branch, configured for Smriti MCP tools.

```bash
npm install --prefix nitrochat
cp nitrochat/.env.smriti.example nitrochat/.env.local
# Set NITROCHAT_GATEWAY_ENDPOINT + NITROCHAT_GATEWAY_API_KEY in .env.local
npm run dev:nitrochat   # http://localhost:3003
npm run dev:mcp         # MCP on http://localhost:3000 (local override in .env.local)
```

Runtime branding and MCP URL defaults live in `nitrochat/config/runtime-config.json` (production MCP URL from `shared/constants.ts`).

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

## MCP bridge CLI (standalone test)

```bash
parser/.venv/bin/python3 parser/mcp_bridge.py metrics
parser/.venv/bin/python3 parser/mcp_bridge.py identify --file samples/good/clinical_01.pdf
```
