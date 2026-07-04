/**
 * Builds the JSON body for POST /api/chat.
 * Omits empty optional fields so DevTools payloads match what the route actually uses.
 * (Routing is gateway-only; `provider` is not sent.)
 */

export type ChatApiClientPayload = Record<string, unknown> & { messages: unknown[] };

/** Minimal fields read by {@link trimMessagesForModel}; compatible with {@link ChatMessage} from the store. */
export type TrimMessageInput = {
  role?: string;
  content?: unknown;
  hidden?: boolean;
  toolCalls?: unknown[];
  toolCallId?: string;
};

function findLastUserIndex(messages: Array<{ role?: string }>): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') return i;
  }
  return 0;
}

function hasToolCalls(m: TrimMessageInput): boolean {
  return Array.isArray(m.toolCalls) && m.toolCalls.length > 0;
}

function assistantText(m: TrimMessageInput): string {
  return typeof m.content === 'string' ? m.content.trim() : '';
}

/** Atomic pre-active segments so assistant tool_calls stay paired with following tool rows. */
function buildPreActiveChunks<T extends TrimMessageInput>(preRaw: T[]): T[][] {
  const chunks: T[][] = [];
  let i = 0;

  while (i < preRaw.length) {
    const m = preRaw[i];
    if (m.hidden === true) {
      i++;
      continue;
    }

    if (m.role === 'tool') {
      i++;
      continue;
    }

    if (m.role === 'assistant' && hasToolCalls(m)) {
      const chunk: T[] = [{ ...m }];
      i++;
      while (i < preRaw.length && preRaw[i].role === 'tool' && preRaw[i].hidden !== true) {
        chunk.push({ ...preRaw[i] });
        i++;
      }
      chunks.push(chunk);
      continue;
    }

    if (m.role === 'assistant') {
      const text = assistantText(m);
      if (!text) {
        i++;
        continue;
      }
      chunks.push([{ ...m }]);
      i++;
      continue;
    }

    if (m.role === 'user') {
      chunks.push([{ ...m }]);
      i++;
      continue;
    }

    chunks.push([{ ...m }]);
    i++;
  }

  return chunks;
}

/** Take chunks from the end until message count reaches budget (newest first). */
function selectChunksWithinBudget<T extends TrimMessageInput>(chunks: T[][], budget: number): T[] {
  if (budget <= 0) return [];
  const selected: T[][] = [];
  let count = 0;

  for (let c = chunks.length - 1; c >= 0; c--) {
    const size = chunks[c].length;
    if (count + size > budget && selected.length > 0) break;
    selected.unshift(chunks[c]);
    count += size;
    if (count >= budget) break;
  }

  return selected.flat();
}

/**
 * Reduces what we send to `/api/chat` so each turn does not re-pay for the entire persisted thread.
 *
 * - **Active turn** — from the last `role: "user"` through the end (inclusive). Never dropped.
 * - **Pre-active** — drop `hidden`, then keep the newest chunk(s) within the message budget.
 *   Tool chains (assistant `toolCalls` + following `role: tool` rows) stay together.
 */
export function trimMessagesForModel<T extends TrimMessageInput>(messages: T[], maxMessages: number): T[] {
  const n = messages.length;
  if (n === 0 || !Number.isFinite(maxMessages) || maxMessages <= 0) {
    return messages.map((m) => ({ ...m }));
  }

  const lastUserIdx = findLastUserIndex(messages);
  const active = messages.slice(lastUserIdx).map((m) => ({ ...m }));

  const preRaw = messages.slice(0, lastUserIdx);
  const chunks = buildPreActiveChunks(preRaw);

  const activeLen = active.length;
  const budget = Math.max(0, maxMessages - activeLen);
  const preWindow = selectChunksWithinBudget(chunks, budget);

  return [...preWindow, ...active];
}

export function buildChatApiRequestBody(params: {
  messages: unknown[];
  /** When model selection is off, omit — server uses NITROCHAT_MODEL / openrouter/auto. */
  model?: string;
  mcpTools?: unknown[];
  mcpPrompts?: unknown[];
  mcpResources?: unknown[];
  systemInstruction?: string | null;
  systemPrompt?: string | null;
  /** Sent only when true (SSE). */
  stream?: boolean;
  /** When set, `messages` are trimmed before serialization (bounded context per turn). */
  trim?: { maxMessages: number };
}): ChatApiClientPayload {
  const raw = params.messages as TrimMessageInput[];
  const messages =
    params.trim != null && Number.isFinite(params.trim.maxMessages) && params.trim.maxMessages > 0
      ? trimMessagesForModel(raw, params.trim.maxMessages)
      : (raw as unknown[]);

  const body: ChatApiClientPayload = { messages };
  const model = params.model?.trim();
  if (model) body.model = model;
  if (params.mcpTools && params.mcpTools.length > 0) body.mcpTools = params.mcpTools;
  if (params.mcpPrompts && params.mcpPrompts.length > 0) body.mcpPrompts = params.mcpPrompts;
  if (params.mcpResources && params.mcpResources.length > 0) body.mcpResources = params.mcpResources;
  const si = typeof params.systemInstruction === 'string' ? params.systemInstruction.trim() : '';
  if (si) body.systemInstruction = si;
  const sp = typeof params.systemPrompt === 'string' ? params.systemPrompt.trim() : '';
  if (sp) body.systemPrompt = sp;
  if (params.stream === true) body.stream = true;
  return body;
}
