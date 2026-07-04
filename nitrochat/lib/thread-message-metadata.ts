export type ThreadMessageRole = 'user' | 'assistant' | 'tool';

export interface ThreadMessageMetadataInput {
  role: ThreadMessageRole;
  model?: string;
  provider?: string;
  latencyMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  finishReason?: string;
  toolName?: string;
  isMcp?: boolean;
  error?: string;
  cost?: number;
}

/** Build JSON metadata for gateway thread persistence (snake_case keys for NitroCloud). */
export function buildThreadMessageMetadata(opts: ThreadMessageMetadataInput): string {
  const meta: Record<string, string | number | boolean> = {};

  if (opts.model) meta.model = opts.model;
  if (opts.provider) meta.provider = opts.provider;
  if (opts.latencyMs != null && opts.latencyMs >= 0) meta.latency_ms = Math.round(opts.latencyMs);
  if (opts.promptTokens != null && opts.promptTokens > 0) meta.prompt_tokens = opts.promptTokens;
  if (opts.completionTokens != null && opts.completionTokens > 0) {
    meta.completion_tokens = opts.completionTokens;
  }
  if (opts.finishReason) meta.finish_reason = opts.finishReason;
  if (opts.toolName) meta.tool_name = opts.toolName;
  if (opts.isMcp != null) meta.is_mcp = opts.isMcp;
  if (opts.error) meta.error = opts.error;
  if (opts.cost != null && opts.cost > 0) meta.cost = opts.cost;

  return JSON.stringify(meta);
}
