/** Shared paths and plugin config for Tauri, MCP, and docs. */

export const ACTIVE_PLUGIN = "finance" as const;

export const GOLD_PARTITION = `gold/domain=${ACTIVE_PLUGIN}/year=2026/month=07`;

export const GOLD_GLOB = `${GOLD_PARTITION}/*.parquet`;
