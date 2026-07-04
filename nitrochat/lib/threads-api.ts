/**
 * threads-api.ts
 *
 * Typed client for NitroChat thread persistence API.
 * All calls route through /api/threads/* Next.js proxy routes so the
 * gateway API key stays server-side (mirrors the existing /api/chat pattern).
 *
 * Functions are only intended to be called when
 * NEXT_PUBLIC_THREADS_ENABLED === 'true'.
 */

export type ActorType = 'anonymous' | 'external' | 'authenticated';

export interface ResolveActorResponse {
  actorId: string;
  actorType: ActorType;
}

export interface ResolveThreadResponse {
  threadId: string;
  actorId: string;
  actorType: ActorType;
}

export interface ThreadMessage {
  messageId: string;
  threadId: string;
  actorId: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  createdAt: string;
  metadata: string;
}

export interface PostMessageRequest {
  actorId: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  messageId: string;
  /** JSON string; gateway merges server-side instance_id. Use snake_case keys for NitroCloud. */
  metadata?: string;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

const THREADS_BASE = '/api/threads';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${THREADS_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `[threads-api] ${init?.method ?? 'GET'} ${path} → ${res.status}: ${body}`,
    );
  }
  return res.json() as Promise<T>;
}

/**
 * Retries an async function with exponential backoff.
 * 4xx responses are NOT retried — they indicate a bad request that won't recover.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 500,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (err instanceof Error && /→ 4\d\d/.test(err.message)) {
        throw err;
      }
      if (attempt < maxAttempts - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }
  throw lastError;
}

/**
 * Races a promise against a timeout. Throws if the promise does not resolve
 * within `ms` milliseconds.
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`[timeout] ${label} exceeded ${ms}ms`)), ms),
  );
  return Promise.race([promise, timeout]);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Resolve or generate an actor identity.
 * - Pass `actorId` to restore an existing anonymous actor from localStorage.
 * - Pass `externalUserId` to resolve an external actor (embed mode).
 * - Pass neither to generate a new anonymous actor.
 */
export async function resolveActor(params: {
  actorId?: string | null;
  externalUserId?: string | null;
}): Promise<ResolveActorResponse> {
  const body: Record<string, string> = {};
  if (params.actorId) body.actorId = params.actorId;
  if (params.externalUserId) body.externalUserId = params.externalUserId;

  return withRetry(() =>
    apiFetch<ResolveActorResponse>('/actor/resolve', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}

/**
 * Resolve or create an active thread for the given actor.
 * Idempotent — returns the same threadId for the same actorId while the thread is active.
 */
export async function resolveThread(params: {
  actorId: string;
  actorType: string;
}): Promise<ResolveThreadResponse> {
  return withRetry(() =>
    apiFetch<ResolveThreadResponse>('/threads/resolve', {
      method: 'POST',
      body: JSON.stringify(params),
    }),
  );
}

/**
 * Fetch the message history for a thread in chronological order.
 */
export async function getThreadMessages(
  threadId: string,
  options?: { limit?: number; before?: number },
): Promise<ThreadMessage[]> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.before) params.set('before', String(options.before));
  const query = params.size > 0 ? `?${params.toString()}` : '';

  const res = await apiFetch<{ messages: ThreadMessage[] }>(
    `/threads/${threadId}/messages${query}`,
  );
  return res.messages ?? [];
}

/**
 * Persist a single message to a thread.
 * `messageId` is client-generated — use `crypto.randomUUID()` for idempotency.
 * Fire-and-forget: call with `.catch(console.warn)` to avoid blocking the chat UX.
 */
export async function postThreadMessage(
  threadId: string,
  msg: PostMessageRequest,
): Promise<{ messageId: string }> {
  return apiFetch<{ messageId: string }>(`/threads/${threadId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      ...msg,
      metadata: msg.metadata ?? '{}',
    }),
  });
}
