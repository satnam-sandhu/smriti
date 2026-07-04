# Graph Report - smriti  (2026-07-04)

## Corpus Check
- 80 files · ~102,350 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 804 nodes · 1383 edges · 63 communities (56 shown, 7 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 54 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `699ecd81`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]

## God Nodes (most connected - your core abstractions)
1. `DocumentIntelligenceService` - 32 edges
2. `with_db()` - 26 edges
3. `String` - 26 edges
4. `Result` - 25 edges
5. `AppHandle` - 23 edges
6. `runMcpBridge()` - 18 edges
7. `DocumentIntelligenceTools` - 18 edges
8. `compilerOptions` - 18 edges
9. `String` - 18 edges
10. `Smriti PRD v2.1` - 18 edges

## Surprising Connections (you probably didn't know these)
- `CreateCollectionModalProps` --references--> `DocType`  [EXTRACTED]
  src/components/CreateCollectionModal.tsx → shared/types.ts
- `CollectionDetailProps` --references--> `CollectionSummary`  [EXTRACTED]
  src/components/CollectionDetail.tsx → shared/types.ts
- `CollectionListProps` --references--> `CollectionSummary`  [EXTRACTED]
  src/components/CollectionList.tsx → shared/types.ts
- `CollectionTableProps` --references--> `AnalyticsQueryResult`  [EXTRACTED]
  src/components/CollectionTable.tsx → shared/types.ts
- `parse_document()` --calls--> `execute_parser()`  [INFERRED]
  parser/cli.py → parser/executor.py

## Import Cycles
- 1-file cycle: `src-tauri/src/db.rs -> src-tauri/src/db.rs`
- 1-file cycle: `src-tauri/src/pipeline.rs -> src-tauri/src/pipeline.rs`

## Communities (63 total, 7 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (36): 15-Minute Demo Script, Accuracy Measurement, Accuracy & Validation, Active Phases (Hackathon), Adaptive Parser Generation, Architecture, Bronze Layer (Raw Archive), Data Acquisition (+28 more)

### Community 1 - "Community 1"
Cohesion: 0.12
Nodes (59): F, ParserOutput, with_db(), emit_metrics(), build_failed_review(), build_table_from_silver(), call_python_parser(), canonical_path_str() (+51 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (30): dependencies, pdfjs-dist, react, react-dom, @tauri-apps/api, @tauri-apps/plugin-dialog, @tauri-apps/plugin-opener, description (+22 more)

### Community 3 - "Community 3"
Cohesion: 0.16
Nodes (37): FileStatus, Mutex, canonicalize_dir(), DbState, get_collection(), get_file(), get_metrics(), get_pipeline_stats() (+29 more)

### Community 4 - "Community 4"
Cohesion: 0.12
Nodes (35): BaseModel, Namespace, compute_accuracy(), main(), parse_document(), Path, cmd_classify(), cmd_execute() (+27 more)

### Community 5 - "Community 5"
Cohesion: 0.09
Nodes (22): dependencies, dotenv, @modelcontextprotocol/ext-apps, @nitrostack/core, zod, description, devDependencies, @nitrostack/cli (+14 more)

### Community 6 - "Community 6"
Cohesion: 0.10
Nodes (20): compilerOptions, declaration, declarationMap, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, forceConsistentCasingInFileNames, lib (+12 more)

### Community 7 - "Community 7"
Cohesion: 0.10
Nodes (19): dependencies, @modelcontextprotocol/ext-apps, next, @nitrostack/widgets, react, react-dom, devDependencies, @types/node (+11 more)

### Community 8 - "Community 8"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 9 - "Community 9"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+10 more)

### Community 11 - "Community 11"
Cohesion: 0.10
Nodes (20): app, security, windows, enable, scope, build, beforeBuildCommand, beforeDevCommand (+12 more)

### Community 12 - "Community 12"
Cohesion: 0.21
Nodes (26): create_collection(), get_collection_table(), get_failed_review(), get_file_detail(), get_metrics(), get_pipeline_stats(), ingest_files(), list_collections() (+18 more)

### Community 13 - "Community 13"
Cohesion: 0.12
Nodes (15): 2:00–2:30 — Shell + drop zone, 2:30–3:30 — Pipeline Health Dashboard (6 cards only), 3:30–4:30 — Live status + color coding, 4:30–5:15 — Extraction viewer (side-by-side), 5:15–5:30 — SQL demo panel (small), 5:30–5:45 — Polish pass, 5:45–6:00 — Demo standby, Component checklist (+7 more)

### Community 14 - "Community 14"
Cohesion: 0.15
Nodes (15): CollectionDetail(), CollectionDetailProps, DOC_TYPE_LABELS, CollectionList(), CollectionListProps, DOC_TYPE_LABELS, CollectionsView(), CreateCollectionModal() (+7 more)

### Community 15 - "Community 15"
Cohesion: 0.12
Nodes (16): 2:00–2:30 — Schemas + registry, 2:30–3:30 — OpenRouter → DSL (first run), 3:30–4:30 — Deterministic executor (second run), 4:30–5:00 — Accuracy for dashboard, 5:00–5:30 — Demo prep (critical), 5:30–6:00 — Standby, Demo data, Demo script (you narrate 4–8 min segment) (+8 more)

### Community 16 - "Community 16"
Cohesion: 0.13
Nodes (14): 2:00–3:00 — Sample documents (P0 · do this first), 3:00–3:30 — Expected JSON (golden set), 3:30–4:30 — QA tester (stay useful without blocking devs), 4:30–5:15 — MCP (only if QA passing), 5:15–5:30 — Demo script + intro, 5:30–5:45 — Dry run, 5:45–6:00 — Demo support, Do NOT (+6 more)

### Community 17 - "Community 17"
Cohesion: 0.14
Nodes (13): 2:00–2:30 — Scaffold + contract, 2:30–3:30 — Ingest + Bronze, 3:30–4:30 — Silver + Gold (happy path), 4:30–5:15 — Commands for UI + demo, 5:15–5:45 — Integration + failure test, 5:45–6:00 — Demo standby, Do NOT build, Done by 6 PM (+5 more)

### Community 18 - "Community 18"
Cohesion: 0.23
Nodes (3): DocumentIntelligenceService, validationFromSilver(), runMcpBridge()

### Community 19 - "Community 19"
Cohesion: 0.26
Nodes (20): AiUsage, AnalyticsQueryResult, Collection, CollectionSummary, ErrorBreakdown, FailedFileReview, FileDetail, FileRecord (+12 more)

### Community 20 - "Community 20"
Cohesion: 0.25
Nodes (7): Architecture, Bonus tools, Environment, Example agent calls, PRD MCP Tools, Quick start, Smriti MCP Server

### Community 21 - "Community 21"
Cohesion: 0.22
Nodes (8): MCP bridge CLI (standalone test), MCP tools (Full PRD), Parser CLI (standalone test), Quick start, Repo structure, Smriti, Tauri commands (API contract), Team assignments

### Community 22 - "Community 22"
Cohesion: 0.25
Nodes (7): compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, skipLibCheck, include

### Community 23 - "Community 23"
Cohesion: 0.33
Nodes (10): _call_openrouter(), _estimate_cost(), _fallback_dsl(), generate_dsl(), _guess_report_type(), _load_backup_dsl(), Path, Deterministic fallback DSL when OpenRouter unavailable. (+2 more)

### Community 24 - "Community 24"
Cohesion: 0.33
Nodes (5): description, identifier, permissions, $schema, windows

### Community 25 - "Community 25"
Cohesion: 0.67
Nodes (5): main(), Path, write_bank_statement_png(), write_financial_report_pdf(), write_ledger_xlsx()

### Community 26 - "Community 26"
Cohesion: 0.50
Nodes (3): generatedAt, version, widgets

### Community 30 - "Community 30"
Cohesion: 0.31
Nodes (9): apply_union_by_name(), ensure_union_by_name(), main(), Turn workspace-relative gold paths into absolute paths for DuckDB., Mixed doc types produce different Parquet schemas — union columns across files., Legacy helper: also patch exact GOLD_GLOB token replacements., register_gold_view(), resolve_workspace_paths() (+1 more)

### Community 32 - "Community 32"
Cohesion: 0.33
Nodes (5): Data policy, Expected JSON example (FinancialReport), Naming convention, Primary demo source, Sample documents

### Community 40 - "Community 40"
Cohesion: 0.20
Nodes (10): method, pattern, method, pattern, method, pattern, account_holder, amount (+2 more)

### Community 41 - "Community 41"
Cohesion: 0.48
Nodes (11): _apply_regex_fields(), _coerce_value(), execute_parser(), _has_values(), _merge_extracted(), _ocr_text(), _parse_excel(), _parse_image() (+3 more)

### Community 42 - "Community 42"
Cohesion: 0.20
Nodes (10): method, pattern, company_name, fiscal_period, report_type, method, pattern, fields (+2 more)

### Community 44 - "Community 44"
Cohesion: 0.20
Nodes (10): DocumentRecord, PluginRecord, TemplateRecord, bronzeDir(), ensureWorkspaceDirs(), ingestBase64ToBronze(), ingestToBronze(), quarantineDir() (+2 more)

### Community 47 - "Community 47"
Cohesion: 0.12
Nodes (15): CollectionTable(), CollectionTableProps, PreviewState, AnalyticsQueryResult, Collection, ErrorBreakdown, ErrorCode, FileDetail (+7 more)

### Community 48 - "Community 48"
Cohesion: 0.17
Nodes (10): ACTIVE_PLUGIN, BRIDGE_DIR, bridgeEnv(), goldGlob(), metricsPath(), ParserResult, readMetricsFile(), runAnalytics() (+2 more)

### Community 49 - "Community 49"
Cohesion: 0.15
Nodes (10): BackIcon(), ChevronIcon(), CollectionsIcon(), ReviewIcon(), SmritiLogo(), SmritiLogoProps, SqlPanel(), SqlPanelProps (+2 more)

### Community 52 - "Community 52"
Cohesion: 0.19
Nodes (15): FailuresTable(), FailuresTableProps, Pagination(), PaginationProps, DatePreset, PipelineView(), presetRange(), FailedFileDetail() (+7 more)

### Community 53 - "Community 53"
Cohesion: 0.22
Nodes (9): account_id, balance, credit, date, debit, ledger, columns, doc_type (+1 more)

### Community 54 - "Community 54"
Cohesion: 0.14
Nodes (14): DocumentPreview(), DocumentPreviewProps, FilePreviewModal(), FilePreviewModalProps, PdfViewer(), PdfViewerProps, FailedFilePreview(), ReviewFilter (+6 more)

### Community 55 - "Community 55"
Cohesion: 0.33
Nodes (6): account_holder, amount, balance, date, description, extracted

### Community 56 - "Community 56"
Cohesion: 0.40
Nodes (4): report, doc_type, statement, doc_type

### Community 57 - "Community 57"
Cohesion: 0.67
Nodes (3): method, pattern, balance

### Community 58 - "Community 58"
Cohesion: 0.67
Nodes (3): method, pattern, date

### Community 59 - "Community 59"
Cohesion: 0.67
Nodes (3): net_income, method, pattern

### Community 60 - "Community 60"
Cohesion: 0.29
Nodes (6): fail(), results, ROOT, run(), samples, svc

### Community 61 - "Community 61"
Cohesion: 0.38
Nodes (5): MetricCard(), MetricCardProps, MetricsDashboard(), MetricsDashboardProps, PipelineMetrics

### Community 62 - "Community 62"
Cohesion: 0.15
Nodes (3): DocumentIntelligenceModule, DocumentIntelligencePrompts, DocumentIntelligenceResources

### Community 63 - "Community 63"
Cohesion: 0.67
Nodes (3): revenue, method, pattern

## Knowledge Gaps
- **335 isolated node(s):** `name`, `version`, `private`, `type`, `description` (+330 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DocumentIntelligenceService` connect `Community 18` to `Community 48`, `Community 10`, `Community 44`, `Community 62`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **Why does `with_db()` connect `Community 1` to `Community 3`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Why does `DocumentIntelligenceTools` connect `Community 10` to `Community 44`, `Community 62`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Are the 20 inferred relationships involving `with_db()` (e.g. with `build_table_from_silver()` and `create_collection()`) actually correct?**
  _`with_db()` has 20 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _340 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05405405405405406 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.12057112638815441 - nodes in this community are weakly interconnected._