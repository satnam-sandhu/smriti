import type { ToolCall } from '@/lib/store';

export interface ChatStreamUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface ChatStreamResult {
  content: string;
  toolCalls: ToolCall[];
  model?: string;
  finishReason?: string;
  usage?: ChatStreamUsage;
}

function parseToolCallArgumentsJson(raw: string | undefined): ToolCall['arguments'] {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as ToolCall['arguments'];
    }
  } catch {
    // ignore invalid JSON
  }
  return {};
}

/** Parse OpenAI-compatible SSE chat stream; call onContent with accumulated content. */
export async function consumeChatStream(
  response: Response,
  onContent: (content: string) => void,
): Promise<ChatStreamResult> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let content = '';
  const toolCallsByIndex: Record<number, { id?: string; name?: string; arguments?: string }> = {};
  let buffer = '';
  let pendingContent: string | null = null;
  let rafId: number | null = null;
  let model: string | undefined;
  let finishReason: string | undefined;
  let usage: ChatStreamUsage | undefined;

  const flushPendingContent = () => {
    if (pendingContent == null) return;
    onContent(pendingContent);
    pendingContent = null;
  };

  const scheduleContentFlush = () => {
    if (rafId != null) return;
    const raf = globalThis.requestAnimationFrame?.bind(globalThis);
    if (!raf) {
      flushPendingContent();
      return;
    }
    rafId = raf(() => {
      rafId = null;
      flushPendingContent();
    });
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') continue;
        try {
          const obj = JSON.parse(payload) as {
            model?: string;
            usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
            choices?: Array<{
              finish_reason?: string | null;
              delta?: {
                content?: string;
                tool_calls?: Array<{
                  index?: number;
                  id?: string;
                  function?: { name?: string; arguments?: string };
                }>;
              };
            }>;
          };
          if (typeof obj.model === 'string' && obj.model) {
            model = obj.model;
          }
          if (obj.usage) {
            usage = {
              promptTokens: obj.usage.prompt_tokens,
              completionTokens: obj.usage.completion_tokens,
              totalTokens: obj.usage.total_tokens,
            };
          }
          const choice = obj.choices?.[0];
          if (!choice) continue;
          if (choice.finish_reason) {
            finishReason = choice.finish_reason;
          }
          const delta = choice.delta ?? {};
          if (typeof delta.content === 'string') {
            content += delta.content;
            pendingContent = content;
            scheduleContentFlush();
          }
          if (Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCallsByIndex[idx]) toolCallsByIndex[idx] = {};
              if (tc.id) toolCallsByIndex[idx].id = tc.id;
              if (tc.function?.name) toolCallsByIndex[idx].name = tc.function.name;
              if (tc.function?.arguments)
                toolCallsByIndex[idx].arguments = (toolCallsByIndex[idx].arguments || '') + tc.function.arguments;
            }
          }
        } catch {
          // ignore parse errors for partial/bad lines
        }
      }
    }
  } finally {
    if (rafId != null) {
      globalThis.cancelAnimationFrame?.(rafId);
      rafId = null;
    }
    flushPendingContent();
  }

  const toolCalls = Object.keys(toolCallsByIndex)
    .map((k) => parseInt(k, 10))
    .sort((a, b) => a - b)
    .map((idx) => {
      const t = toolCallsByIndex[idx];
      return {
        id: t.id || `call_${idx}`,
        name: t.name || '',
        arguments: parseToolCallArgumentsJson(t.arguments),
      };
    })
    .filter((t) => t.name);

  return { content, toolCalls, model, finishReason, usage };
}
