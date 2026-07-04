import type { ChatStreamResult } from '@/lib/chat-stream-sse';
import { postThreadMessage, type PostMessageRequest } from '@/lib/threads-api';
import {
  buildThreadMessageMetadata,
  type ThreadMessageMetadataInput,
} from '@/lib/thread-message-metadata';
import { useChatStore } from '@/lib/store';

import { getConfig } from '@/nitrochat.config';

export function isThreadsPersistenceEnabled(): boolean {
  return getConfig().features?.threadsEnabled ?? false;
}

type PersistThreadMessageInput = Omit<PostMessageRequest, 'metadata' | 'actorId'> & {
  actorId?: string;
  metadata?: ThreadMessageMetadataInput | string;
};

/** Fire-and-forget thread message persistence with store guards. */
export function persistThreadMessageFireAndForget(msg: PersistThreadMessageInput): void {
  if (!isThreadsPersistenceEnabled()) return;

  const threadId = useChatStore.getState().threadId;
  const actorId = useChatStore.getState().threadActorId;
  if (!threadId || !actorId) {
    console.warn('[threads] skip persist: missing threadId or actorId');
    return;
  }

  const metadata =
    typeof msg.metadata === 'string'
      ? msg.metadata
      : buildThreadMessageMetadata(msg.metadata ?? { role: msg.role });

  postThreadMessage(threadId, {
    actorId,
    role: msg.role,
    content: msg.content,
    messageId: msg.messageId,
    metadata,
  }).catch((err) => console.warn(`[threads] failed to persist ${msg.role} message:`, err));
}

export function persistAssistantThreadMessage(params: {
  messageId: string;
  content: string;
  model: string;
  latencyMs: number;
  streamMeta?: Pick<ChatStreamResult, 'model' | 'finishReason' | 'usage'>;
}): void {
  if (!params.content?.trim()) return;
  persistThreadMessageFireAndForget({
    messageId: params.messageId,
    role: 'assistant',
    content: params.content,
    metadata: {
      role: 'assistant',
      model: params.streamMeta?.model ?? params.model,
      latencyMs: params.latencyMs,
      promptTokens: params.streamMeta?.usage?.promptTokens,
      completionTokens: params.streamMeta?.usage?.completionTokens,
      finishReason: params.streamMeta?.finishReason,
    },
  });
}

export function persistToolResultThreadMessages(
  rows: Array<{ id: string; content: string; toolName: string; result?: unknown }>,
): void {
  for (const row of rows) {
    const hasError =
      row.result &&
      typeof row.result === 'object' &&
      row.result !== null &&
      'error' in (row.result as Record<string, unknown>) &&
      (row.result as { error?: unknown }).error;
    persistThreadMessageFireAndForget({
      messageId: row.id,
      role: 'tool',
      content: row.content,
      metadata: {
        role: 'tool',
        toolName: row.toolName,
        isMcp: false,
        error: hasError ? String((row.result as { error?: unknown }).error) : undefined,
      },
    });
  }
}
