import {
  assertToolChainAligned,
  attachResultsToToolCalls,
  dedupeToolCalls,
  logToolChainIfDebug,
  normalizeAssistantToolMessage,
  ToolExecutionCache,
} from '@/lib/tool-call-chain';
import { runMcpToolCall, type McpClientLike } from '@/lib/mcp-tool-runner';
import type { ChatMessage, ToolCall } from '@/lib/store';

export type ToolResultRow = {
  id: string;
  role: 'tool';
  content: string;
  timestamp: number;
  toolCallId: string;
  toolName: string;
  result?: unknown;
};

type LlmToolResponse = {
  message?: { role?: string; content?: string; toolCalls?: ToolCall[] };
  toolCalls?: ToolCall[];
};

/**
 * Dedupe, execute MCP tools, normalize assistant tool_calls for a valid OpenAI tool chain.
 * Returns null when there are no tool calls to process.
 */
export async function processLlmToolCalls(params: {
  label: string;
  data: LlmToolResponse;
  client: McpClientLike;
  generateId: () => string;
  addMessage: (msg: ChatMessage) => void;
  updateMessage?: (id: string, patch: { content?: string; toolCalls?: ToolCall[] }) => void;
  streamAssistantId?: string | null;
  assistantAlreadyAdded?: boolean;
  findLastAssistantId?: () => string | null;
  /** When set, reuses results for repeat `(name, args)` within the same user turn. */
  executionCache?: ToolExecutionCache;
}): Promise<{
  assistantForContinuation: ReturnType<typeof normalizeAssistantToolMessage>;
  toolResultMessages: ToolResultRow[];
} | null> {
  const toolCalls = params.data.toolCalls;
  if (!toolCalls?.length) return null;

  const uniqueToolCalls = dedupeToolCalls(toolCalls);
  const normalizedForStore = normalizeAssistantToolMessage(
    params.data.message,
    uniqueToolCalls,
    params.data.message?.content ?? '',
  );

  if (params.data.message && !params.assistantAlreadyAdded) {
    params.addMessage({
      id: params.generateId(),
      role: 'assistant',
      content: normalizedForStore.content,
      timestamp: Date.now(),
      toolCalls: normalizedForStore.toolCalls,
    } as ChatMessage);
  }

  const toolResultMessages: ToolResultRow[] = [];
  for (const toolCall of uniqueToolCalls) {
    const cache = params.executionCache;
    const args = toolCall.arguments;
    const cacheHit = cache?.has(toolCall.name, args) ?? false;
    const result = cacheHit
      ? cache!.get(toolCall.name, args)
      : await runMcpToolCall(params.client, toolCall);
    if (!cacheHit && cache) cache.set(toolCall.name, args, result);
    const row: ToolResultRow = {
      id: params.generateId(),
      role: 'tool',
      content: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
      timestamp: Date.now(),
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      result,
    };
    params.addMessage(row as ChatMessage);
    toolResultMessages.push(row);
  }

  const assistantForContinuation = normalizeAssistantToolMessage(
    params.data.message,
    uniqueToolCalls,
    params.data.message?.content ?? '',
  );
  assertToolChainAligned(assistantForContinuation, toolResultMessages);
  logToolChainIfDebug(params.label, assistantForContinuation, toolResultMessages);

  if (params.updateMessage) {
    const toolCallsWithResults = attachResultsToToolCalls(
      assistantForContinuation.toolCalls,
      toolResultMessages,
    );
    let uiAssistantId = params.streamAssistantId ?? null;
    if (!uiAssistantId && params.findLastAssistantId) {
      uiAssistantId = params.findLastAssistantId();
    }
    if (uiAssistantId) {
      params.updateMessage(uiAssistantId, {
        content: assistantForContinuation.content,
        toolCalls: toolCallsWithResults,
      });
    }
  }

  return { assistantForContinuation, toolResultMessages };
}
