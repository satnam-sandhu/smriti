/** Shared paths and plugin config for Tauri, MCP, and docs. */

export const ACTIVE_PLUGIN = "finance" as const;

export const GOLD_PARTITION = `gold/domain=${ACTIVE_PLUGIN}/year=2026/month=07`;

export const GOLD_GLOB = `${GOLD_PARTITION}/*.parquet`;

/** Cloud defaults — override locally via root `.env` (VITE_*). */
const CLOUD_MCP_URL =
  "https://atlas-mcp-6a47d4fa-biliings-org-7cb21717.dev.nitrocloud.ai";
const CLOUD_NITROCHAT_URL =
  "https://nitrochat-yyy-6a3e700a-hemants-org-9744dc11.staging.nitrocloud.ai";

const LOCAL_MCP_URL = "http://localhost:3000";
const LOCAL_NITROCHAT_URL = "http://localhost:3003";

function viteEnv(key: string): string | undefined {
  if (typeof import.meta !== "undefined" && import.meta.env) {
    const v = (import.meta.env as Record<string, string | undefined>)[key];
    if (v?.trim()) return v.trim();
  }
  return undefined;
}

/** Smriti MCP — local dev default http://localhost:3000 */
export const MCP_SERVER_URL =
  viteEnv("VITE_MCP_SERVER_URL") ?? LOCAL_MCP_URL;

/** NitroChat base URL — local dev default http://localhost:3003 */
export const NITROCHAT_BASE_URL =
  viteEnv("VITE_NITROCHAT_BASE_URL") ?? LOCAL_NITROCHAT_URL;

/** Deployed cloud URLs (docs / fallback references) */
export const CLOUD_MCP_SERVER_URL = CLOUD_MCP_URL;
export const CLOUD_NITROCHAT_BASE_URL = CLOUD_NITROCHAT_URL;

export const NITROCHAT_EMBED_URL = `${NITROCHAT_BASE_URL}/embed`;

export const NITROCHAT_CHAT_API = `${NITROCHAT_BASE_URL}/api/chat`;
