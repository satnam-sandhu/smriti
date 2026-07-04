# Smriti MCP Server

NitroStack MCP server exposing Smriti's document intelligence pipeline to external AI agents.

## Quick start

```bash
# From smriti/ root (after setup.sh)
npm run dev:mcp
```

Connect via [NitroStudio](https://nitrostack.ai/studio) → open the `mcp/` folder.

## Live demo

| Service | URL |
|---------|-----|
| **NitroChat (embed)** | https://nitrochat-yyy-6a3e700a-hemants-org-9744dc11.staging.nitrocloud.ai/embed |
| **MCP server** | https://atlas-mcp-6a47d4fa-biliings-org-7cb21717.dev.nitrocloud.ai |

## PRD MCP Tools

| Tool | Description |
|------|-------------|
| `upload_document` | Ingest + parse single file (`file_path` or base64) |
| `upload_folder` | Batch ingest a local directory |
| `identify_template` | Match file against parser registry |
| `generate_parser` | Invoke Gemini to create DSL for unknown layout |
| `execute_parser` | Run deterministic parser (zero LLM calls) |
| `get_pipeline_metrics` | Pipeline dashboard metrics from SQLite |
| `analytics_query` | DuckDB SQL on Gold Parquet |
| `list_failures` | Quarantined files + failure records |
| `install_plugin` | Activate healthcare or finance plugin |

## Bonus tools

| Tool | Description |
|------|-------------|
| `classify_document` | Detect document type from filename/extension |
| `process_document` | Full orchestrated parse pipeline |
| `get_document` | Fetch extracted data by document ID |
| `search_documents` | Search processed documents |
| `list_templates` | All learned parser templates |
| `list_plugins` | Installed plugins |

## Architecture

```
mcp/src/modules/document-intelligence/  → NitroStack tools/resources/prompts
mcp/src/lib/smriti-bridge.ts            → TypeScript → Python bridge
parser/mcp_bridge.py                    → SQLite, registry, metrics
parser/cli.py                           → Adaptive parser (AI once, deterministic forever)
smriti/data/                            → Unified workspace (Bronze/Silver/Gold)
```

## Environment

Optional overrides in `smriti/.env`:

```
SMRITI_ROOT=/path/to/smriti
SMRITI_WORKSPACE=/path/to/smriti/data
OPENROUTER_API_KEY=...
```

## Example agent calls

```json
{ "file_path": "/path/to/samples/good/clinical_01.pdf" }
```

```sql
SELECT * FROM read_parquet('GOLD_GLOB') LIMIT 5
```
