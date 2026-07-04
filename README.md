# Smriti

Enterprise multimodal document ingestion — Hackathon MVP (Topic 2).

**Bronze → Silver → Gold** medallion pipeline with adaptive parser (AI once, deterministic forever).

**Demo plugin:** Finance (Banking) — annual reports, ledgers, bank statements.

**Architecture:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — stack choices, medallion pipeline, MCP surface, hackathon evaluation mapping.

## For judges

Clone → setup → run. Repo intentionally excludes runtime `data/` (Bronze/Silver/Gold); use bundled synthetics or download the full demo set.

```bash
git clone git@github.com:satnam-sandhu/smriti.git && cd smriti
bash scripts/setup.sh
cp .env.example .env   # OPENROUTER_API_KEY needed only for first-time layout learning
npm run dev            # desktop app with pipeline dashboard
npm run dev:mcp:http   # MCP server on :3000
```

| What | Where |
|------|-------|
| Synthetic samples (in repo) | `samples/good/` — PDF, Excel, PNG + `samples/bad/` corrupt files |
| Full banking demo PDFs | [Google Drive folder](https://drive.google.com/drive/folders/1MY6dU7JDuIlIASu5qzaHghZfMXchVSr9?usp=share_link) — download into `data/external/annual reports/` |
| Hackathon rules & scoring | `docs/Hackathon Playbook Rules, Evaluation and Topics.pdf` |
| Architecture & stack justification | `docs/ARCHITECTURE.md` |
| Product requirements | `docs/Smriti_PRD_v2.md` |

After downloading demo PDFs:

```bash
mkdir -p "data/external/annual reports"
# copy downloaded PDFs into data/external/annual reports/
parser/.venv/bin/python3 parser/cli.py --file "data/external/annual reports/PL.pdf"
```

Second run on the same file prints `LLM_CALL: no` (deterministic re-parse).

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
npm run dev:mcp:http    # MCP HTTP on :3000 (for NitroChat / desktop)
npm run dev:mcp         # MCP STDIO (for NitroStudio only)
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
├── data/                # Unified workspace (gitignored — created by setup.sh)
│   └── external/        # Demo PDFs — download from Google Drive (see above)
├── samples/             # Synthetics + expected JSON (always in repo)
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

Local stack: **MCP on :3000**, **NitroChat on :3003**, **LLM via NitroStack gateway** (`https://gateway.dev.nitrostack.ai`).

```bash
cp mcp/.env.example mcp/.env
cp nitrochat/.env.smriti.example nitrochat/.env.local
cp .env.example .env
# Set NITROCHAT_GATEWAY_API_KEY in nitrochat/.env.local

npm run dev:local      # MCP + NitroChat together
npm run dev            # Smriti desktop (uses localhost URLs from .env)
```

| Service | URL |
|---------|-----|
| Smriti MCP | http://localhost:3000 |
| NitroChat | http://localhost:3003 |
| NitroChat embed | http://localhost:3003/embed |
| LLM gateway | https://gateway.dev.nitrostack.ai |

Cloud URLs remain documented above for deployed demos.

Local MCP reads/writes **`data/`** (Bronze, Silver, Gold, `smriti-state.json`, `smriti.db`) — same folder as the Tauri desktop app.

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
