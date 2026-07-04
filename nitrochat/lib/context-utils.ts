/**
 * Context size estimation for the current chat tab (all messages in the conversation).
 * Used for per-tab context limit and the context usage indicator.
 *
 * This is **not** word count and **not** the model’s real tokenizer output — it is a cheap
 * heuristic (characters ÷ 4) that approximates English-ish token counts for UI gating only.
 */

/** Approximate token count: total UTF-16 code units ÷ 4 (not words; not exact BPE tokens). */
export function estimateContextTokens(
  messages: { content?: unknown }[],
  additionalContent?: string
): number {
  const chars =
    messages.reduce(
      (s, m) => s + (typeof m.content === 'string' ? m.content.length : 0),
      0,
    ) + (typeof additionalContent === 'string' ? additionalContent.length : 0);
  return Math.ceil(chars / 4);
}

export interface ContextUsage {
  used: number;
  max: number;
  percent: number;
}

/** Compute usage for the current chat tab. Returns null if no limit is set. */
export function getContextUsage(
  messages: { content?: unknown }[],
  maxTokens: number | undefined | null
): ContextUsage | null {
  if (maxTokens == null || maxTokens <= 0) return null;
  const used = estimateContextTokens(messages, '');
  const percent = Math.min(100, Math.round((used / maxTokens) * 100));
  return { used, max: maxTokens, percent };
}
