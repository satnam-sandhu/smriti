/**
 * Keeps OpenAI-compatible tool chains valid: every assistant `tool_calls[]` entry
 * must have exactly one matching `role: tool` message (by `tool_call_id`).
 * NitroChat dedupes execution by name+args but must not send orphan tool_call ids to the API.
 */

import type { ToolCall } from '@/lib/store';

/** Max LLM↔tool continuation rounds per user message (recursive agent loop). */
export const MAX_TOOL_ROUNDS = 10;


export type ToolCallLike = ToolCall;

export type ToolResultMessageLike = {
  toolCallId?: string;
  toolName?: string;
  result?: unknown;
};

export type AssistantToolMessageLike = {
  role?: string;
  content?: string;
  toolCalls?: ToolCallLike[];
};

function argsKey(argumentsValue: unknown): string {
  try {
    return JSON.stringify(argumentsValue ?? {});
  } catch {
    return String(argumentsValue);
  }
}

/** Dedupe by tool name + serialized arguments (same policy as legacy page.tsx reduce). */
export function dedupeToolCalls<T extends { name: string; arguments?: Record<string, any> }>(
  toolCalls: T[],
): T[] {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return [];
  return toolCalls.reduce<T[]>((acc, toolCall) => {
    const duplicate = acc.some(
      (existing) =>
        existing.name === toolCall.name && argsKey(existing.arguments) === argsKey(toolCall.arguments),
    );
    if (!duplicate) acc.push(toolCall);
    return acc;
  }, []);
}

/** Attach UI/widget `result` onto tool call rows (not sent as OpenAI tool_calls body). */
export function attachResultsToToolCalls(
  toolCalls: ToolCallLike[],
  toolResultMessages: ToolResultMessageLike[],
): ToolCallLike[] {
  return toolCalls.map((tc) => {
    const toolResult = toolResultMessages.find((trm) => trm.toolCallId === tc.id);
    return {
      ...tc,
      result: toolResult?.result ?? null,
    };
  });
}

/**
 * Assistant message for LLM continuation: `toolCalls` lists only executed calls
 * (same ids as `toolResultMessages[].toolCallId`).
 */
export function normalizeAssistantToolMessage(
  assistant: AssistantToolMessageLike | undefined,
  executedToolCalls: ToolCall[],
  contentFallback = '',
): { role: 'assistant'; content: string; toolCalls: ToolCall[] } {
  const content =
    typeof assistant?.content === 'string' ? assistant.content : contentFallback;
  return {
    role: 'assistant',
    content,
    toolCalls: executedToolCalls.map((tc) => ({
      id: tc.id,
      name: tc.name,
      arguments: tc.arguments ?? {},
      ...(tc.result !== undefined ? { result: tc.result } : {}),
    })),
  };
}

/** Logs tool_calls vs tool row counts when NEXT_PUBLIC_DEBUG_TOOL_CHAIN=true. */
export function logToolChainIfDebug(
  label: string,
  assistant: { toolCalls?: ToolCallLike[] } | undefined,
  toolResults: Array<{ toolCallId?: string }>,
): void {
  const debugToolChain = typeof window !== 'undefined'
    ? (window as any).__ENV__?.['NEXT_PUBLIC_DEBUG_TOOL_CHAIN'] === 'true'
    : process.env['NEXT_PUBLIC_DEBUG_TOOL_CHAIN'] === 'true';
  if (!debugToolChain) return;
  const calls = assistant?.toolCalls ?? [];
  console.info(`[NitroChat:tool-chain] ${label}`, {
    toolCalls: calls.length,
    toolResults: toolResults.length,
    callIds: calls.map((c) => c.id),
    resultIds: toolResults.map((r) => r.toolCallId),
  });
}

/**
 * Per-user-turn cache of MCP tool results keyed by `name + JSON(args)`.
 * Reused across agent-loop rounds and the widget `nitro:call_tool` path so the
 * same (tool, args) pair fires `mcpClient.callTool` at most once per user message.
 * The chat layer still appends one `role: tool` row per `tool_call_id` (cache hit
 * or miss) so OpenAI tool chains stay valid.
 */
export class ToolExecutionCache {
  private cache = new Map<string, unknown>();

  private keyFor(name: string, args: unknown): string {
    try {
      return `${name}::${JSON.stringify(args ?? {})}`;
    } catch {
      return `${name}::${String(args)}`;
    }
  }

  has(name: string, args: unknown): boolean {
    return this.cache.has(this.keyFor(name, args));
  }

  get(name: string, args: unknown): unknown {
    return this.cache.get(this.keyFor(name, args));
  }

  set(name: string, args: unknown, result: unknown): void {
    this.cache.set(this.keyFor(name, args), result);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

/** Dev-only sanity check before POST /api/chat. */
export function assertToolChainAligned(
  assistant: { toolCalls?: ToolCallLike[] } | undefined,
  toolResults: Array<{ toolCallId?: string }>,
): void {
  if (process.env.NODE_ENV === 'production') return;
  const calls = assistant?.toolCalls ?? [];
  if (calls.length !== toolResults.length) {
    console.warn('[NitroChat] tool chain mismatch', {
      toolCalls: calls.length,
      toolResults: toolResults.length,
      ids: calls.map((c) => c.id),
      resultIds: toolResults.map((r) => r.toolCallId),
    });
  }
  for (const tc of calls) {
    if (!toolResults.some((r) => r.toolCallId === tc.id)) {
      console.warn('[NitroChat] missing tool result for', tc.id, tc.name);
    }
  }
}
