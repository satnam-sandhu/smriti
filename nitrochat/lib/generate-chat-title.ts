/**
 * Generate a short chat title using the LLM via NitroChat Gateway.
 * Used when a new chat has its first exchange so the sidebar shows a nice title.
 */

import {
  getNitrochatGatewayApiKey,
  getNitrochatGatewayEndpoint,
  isNitrochatGatewayConfigured,
} from '@/lib/gateway-env';

const TITLE_MODEL = (process.env.NITROCHAT_MODEL || '').trim() || 'openrouter/auto';

const SYSTEM_PROMPT = `You are a helpful assistant. Your task is to generate a very short title for a chat conversation.
Rules:
- Reply with ONLY the title, 3 to 6 words.
- No quotes, no period, no punctuation at the end.
- Title should be concise and descriptive of the topic (e.g. "Python list comprehension help", "Trip planning to Tokyo").
- Use title case or sentence case. Do not use all caps.`;

const MAX_TITLE_LENGTH = 60;

interface Msg {
  role: string;
  content?: string;
}

/**
 * Build user prompt from first user message and optionally first assistant reply (truncated).
 */
function buildTitlePrompt(messages: Msg[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  const firstAssistant = messages.find((m) => m.role === 'assistant');
  const userText = typeof firstUser?.content === 'string' ? firstUser.content.trim() : '';
  const assistantSnippet = typeof firstAssistant?.content === 'string'
    ? firstAssistant.content.slice(0, 300).trim() + (firstAssistant.content.length > 300 ? '...' : '')
    : '';
  if (!userText) return '';
  let prompt = `Conversation:\nUser: ${userText}`;
  if (assistantSnippet) prompt += `\n\nAssistant: ${assistantSnippet}`;
  prompt += `\n\nGenerate a short title for this chat:`;
  return prompt;
}

/**
 * Call gateway for a single completion (no stream, no tools). Returns generated title or null.
 */
async function generateTitleViaGateway(prompt: string): Promise<string | null> {
  const base = getNitrochatGatewayEndpoint();
  const key = getNitrochatGatewayApiKey();
  const url = `${base}/v1/nitrochat/chat/completions`;
  const body = {
    model: TITLE_MODEL,
    stream: false,
    messages: [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      { role: 'user' as const, content: prompt },
    ],
    guardrails_enabled: false,
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': key,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text || typeof text !== 'string') return null;
  return text.trim().slice(0, MAX_TITLE_LENGTH) || null;
}

/**
 * Generate a short title for the chat using the LLM (gateway only).
 * Returns the generated title or null on failure (caller can keep "New Chat").
 */
export async function generateChatTitle(messages: Msg[]): Promise<string | null> {
  const prompt = buildTitlePrompt(messages);
  if (!prompt) return null;

  if (!isNitrochatGatewayConfigured()) {
    return null;
  }

  try {
    return await generateTitleViaGateway(prompt);
  } catch (e) {
    console.error('[generate-chat-title] Error:', e);
    return null;
  }
}
