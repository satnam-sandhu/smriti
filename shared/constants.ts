/** Shared paths and plugin config for Tauri, MCP, and docs. */

export const ACTIVE_PLUGIN = "finance" as const;

export const GOLD_PARTITION = `gold/domain=${ACTIVE_PLUGIN}/year=2026/month=07`;

export const GOLD_GLOB = `${GOLD_PARTITION}/*.parquet`;

/** Production Smriti MCP on NitroCloud */
export const MCP_SERVER_URL =
  "https://atlas-mcp-6a47d4fa-biliings-org-7cb21717.dev.nitrocloud.ai";

/** NitroChat deployment (gateway for conversational replies) */
export const NITROCHAT_BASE_URL =
  "https://nitrochat-yyy-6a3e700a-hemants-org-9744dc11.staging.nitrocloud.ai";

export const NITROCHAT_EMBED_URL = `${NITROCHAT_BASE_URL}/embed`;

export const NITROCHAT_CHAT_API = `${NITROCHAT_BASE_URL}/api/chat`;
