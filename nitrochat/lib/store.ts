import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';

/** Scoped local conversations when `?prompt=` is present (temp solution; full doc/context id later). */
export const PROMPT_SCOPE_DEFAULT = '__nitrochat_default__';

const URL_PROMPT_SCOPE_LRU_MAX = 50;
/** Cap serialized tool JSON in localStorage (full rows kept for model context on wire). */
const PERSIST_TOOL_CONTENT_MAX_CHARS = 8_000;

function decodePromptSegment(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  try {
    return decodeURIComponent(t);
  } catch {
    return t;
  }
}

/** Storage key for the current `prompt` query (decoded). Empty/missing prompt → default bucket. */
export function urlPromptScopeKeyFromRaw(raw: string | null | undefined): string {
  const t = raw?.trim();
  if (!t) return PROMPT_SCOPE_DEFAULT;
  return decodePromptSegment(t);
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  result?: any;
  timestamp: number;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  toolName?: string;
  imageData?: { base64: string; mimeType: string }; // Image attachment
  hidden?: boolean;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
  result?: any;
}

/** One prompt-scoped bucket: non-arrays / bad shapes → []; messages coerced to safe ChatMessage rows. */
function normalizeScopeMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatMessage[] = [];
  for (const m of raw) {
    if (!m || typeof m !== 'object') continue;
    const o = m as Record<string, unknown>;
    if (typeof o.id !== 'string') continue;
    if (o.role !== 'user' && o.role !== 'assistant' && o.role !== 'tool') continue;
    const content = typeof o.content === 'string' ? o.content : '';
    const timestamp =
      typeof o.timestamp === 'number' && Number.isFinite(o.timestamp) ? o.timestamp : 0;
    out.push({
      id: o.id,
      role: o.role,
      content,
      timestamp,
      ...(o.result !== undefined ? { result: o.result } : {}),
      ...(Array.isArray(o.toolCalls) ? { toolCalls: o.toolCalls as ToolCall[] } : {}),
      ...(typeof o.toolCallId === 'string' ? { toolCallId: o.toolCallId } : {}),
      ...(typeof o.toolName === 'string' ? { toolName: o.toolName } : {}),
      ...(o.imageData &&
      typeof o.imageData === 'object' &&
      o.imageData !== null &&
      typeof (o.imageData as { base64?: unknown }).base64 === 'string' &&
      typeof (o.imageData as { mimeType?: unknown }).mimeType === 'string'
        ? { imageData: o.imageData as ChatMessage['imageData'] }
        : {}),
      ...(typeof o.hidden === 'boolean' ? { hidden: o.hidden } : {}),
    });
  }
  return out;
}

function sanitizeMessagesByUrlPrompt(map: unknown): Record<string, ChatMessage[]> {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return {};
  const out: Record<string, ChatMessage[]> = {};
  for (const [k, v] of Object.entries(map)) {
    if (typeof k !== 'string' || k.length === 0) continue;
    out[k] = normalizeScopeMessages(v);
  }
  return out;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
  _meta?: Record<string, any>;
}

export interface McpPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

interface ChatStore {
  // Chat state
  messages: ChatMessage[];
  isLoading: boolean;

  // AI Provider
  provider: 'openai' | 'gemini';

  // MCP Data
  tools: McpTool[];
  prompts: McpPrompt[];
  resources: McpResource[];


  // OAuth State
  oauthRequired: boolean;
  oauthServerName: string | null;
  oauthServerLogo: string | null;
  oauthAuthorizationEndpoint: string | null;
  oauthTokenEndpoint: string | null;
  oauthAudience: string | null;
  oauthAccessToken: string | null;
  oauthRefreshToken: string | null;
  oauthExpiresAt: number | null;

  /**
   * Optional Zitadel login state. Fully parallel to the OAuth fields
   * above so a user can have both sessions active at once. Populated
   * only when the server exposes `mcp.zitadel.enabled` via /api/config.
   */
  zitadelEnabled: boolean;
  zitadelLoginLabel: string | null;
  zitadelAuthorizationEndpoint: string | null;
  zitadelTokenEndpoint: string | null;
  zitadelUserinfoEndpoint: string | null;
  zitadelIssuer: string | null;
  zitadelClientId: string | null;
  zitadelAudience: string | null;
  /** Zitadel IdP ID forwarded as `idp_hint` on the authorize request, bypassing the hosted login page. */
  zitadelIdpHint: string | null;
  zitadelAccessToken: string | null;
  zitadelRefreshToken: string | null;
  zitadelExpiresAt: number | null;

  chatId: string | null;

  // ── Thread Identity Slice ──────────────────────────────────────────────────
  /** Persisted actor ID (anonymous or external). Null until first actor resolution. */
  threadActorId: string | null;
  /** Persisted actor type resolved by the gateway. */
  threadActorType: 'anonymous' | 'external' | 'authenticated' | null;
  /** Active thread ID returned by /threads/resolve. Null until a thread is resolved. */
  threadId: string | null;
  /**
   * True once the boot sequence (actor resolve + thread resolve) has completed at least
   * once this session. Not persisted — resets on page reload so boot always re-runs.
   */
  isThreadBootstrapped: boolean;
  // ──────────────────────────────────────────────────────────────────────────

  /** Active `?prompt=`-scoped bucket (full decoded prompt string, or PROMPT_SCOPE_DEFAULT). Not persisted. */
  activeUrlPromptScope: string;
  /** Local messages keyed by urlPromptScopeKeyFromRaw(prompt); temp isolation until server/context ids. */
  messagesByUrlPrompt: Record<string, ChatMessage[]>;
  /**
   * MRU-first ordering of prompt scopes visited this session. Used by `partialize` to decide which
   * scopes to keep when shrinking the persisted map to fit under the localStorage quota. Not
   * persisted; seeded from existing keys on rehydrate.
   */
  urlPromptScopeLru: string[];

  // Voice/TTS State
  elevenLabsApiKey: string | null;
  voiceModeEnabled: boolean;
  voiceModeType: 'voice-only' | 'voice-chat'; // New: voice mode type
  voiceModel: string;
  voiceId: string;
  outputLanguage: string;
  inputLanguage: string;
  ttsMuted: boolean;

  /** True when a persist write failed with QuotaExceeded even after pruning; UI may suggest clearing history. Not persisted. */
  persistStorageQuotaBlocked: boolean;

  // Actions
  setChatId: (id: string | null) => void;
  addMessage: (message: ChatMessage) => void;
  setMessages: (messages: ChatMessage[]) => void;
  updateMessage: (id: string, update: Partial<ChatMessage>) => void;
  clearMessages: () => void;
  /** Clear one prompt-scoped bucket by key (e.g. deferred clean-on-refresh after session end). */
  clearUrlPromptScope: (scope: string) => void;
  /** Clear every prompt-scoped thread (e.g. logout, delete all chats). */
  clearAllUrlPromptConversations: () => void;
  /** Switch local conversation bucket when `?prompt=` changes; clears chatId when scope changes. */
  setActiveUrlPromptScope: (scope: string) => void;
  setLoading: (loading: boolean) => void;
  setProvider: (provider: 'openai' | 'gemini') => void;
  setTools: (tools: McpTool[]) => void;
  setPrompts: (prompts: McpPrompt[]) => void;
  setResources: (resources: McpResource[]) => void;
  setOAuthConfig: (config: {
    required: boolean;
    serverName?: string;
    serverLogo?: string;
    authorizationEndpoint?: string;
    tokenEndpoint?: string;
    audience?: string;
  }) => void;
  setOAuthTokens: (tokens: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
  }) => void;
  clearOAuthTokens: () => void;
  setZitadelConfig: (config: {
    enabled: boolean;
    loginLabel?: string | null;
    authorizationEndpoint?: string | null;
    tokenEndpoint?: string | null;
    userinfoEndpoint?: string | null;
    issuer?: string | null;
    clientId?: string | null;
    audience?: string | null;
    idpHint?: string | null;
  }) => void;
  setZitadelTokens: (tokens: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
  }) => void;
  clearZitadelTokens: () => void;
  exportChat: () => string;
  importChat: (data: string) => void;
  // Voice Actions
  setElevenLabsApiKey: (key: string | null) => void;
  setVoiceModeEnabled: (enabled: boolean) => void;
  setVoiceModeType: (type: 'voice-only' | 'voice-chat') => void; // New: set voice mode type
  setVoiceModel: (model: string) => void;
  setVoiceId: (id: string) => void;
  setOutputLanguage: (lang: string) => void;
  setInputLanguage: (lang: string) => void;
  setTtsMuted: (muted: boolean) => void;
  dismissPersistStorageQuotaNotice: () => void;
  // Thread identity actions
  setThreadActor: (actorId: string, actorType: 'anonymous' | 'external' | 'authenticated') => void;
  setThreadId: (threadId: string | null) => void;
  setThreadBootstrapped: (value: boolean) => void;
  clearThreadIdentity: () => void;
}

function truncateForPersist(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n…[truncated for storage]`;
}

/**
 * Persist-time slimming. Keeps recent tool rows (truncated) so reload does not break tool chains.
 * Returns null when the message should be dropped entirely from the persisted snapshot.
 */
function slimMessageForPersist(m: ChatMessage): ChatMessage | null {
  if (m.hidden === true) return null;

  const text = typeof m.content === 'string' ? m.content.trim() : '';
  const hasTools = Array.isArray(m.toolCalls) && m.toolCalls.length > 0;

  if (m.role === 'tool') {
    const rawContent = typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '');
    return {
      id: m.id,
      role: 'tool',
      content: truncateForPersist(rawContent, PERSIST_TOOL_CONTENT_MAX_CHARS),
      timestamp: m.timestamp,
      ...(typeof m.toolCallId === 'string' ? { toolCallId: m.toolCallId } : {}),
      ...(typeof m.toolName === 'string' ? { toolName: m.toolName } : {}),
    };
  }

  if (m.role === 'assistant' && hasTools && !text) {
    return {
      id: m.id,
      role: 'assistant',
      content: '',
      timestamp: m.timestamp,
      toolCalls: m.toolCalls!.map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments ?? {},
      })),
    };
  }

  if (m.role === 'assistant' && hasTools && text) {
    return {
      id: m.id,
      role: 'assistant',
      content: m.content,
      timestamp: m.timestamp,
      toolCalls: m.toolCalls!.map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments ?? {},
      })),
    };
  }

  const slim: ChatMessage = {
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: m.timestamp,
  };
  if (typeof m.toolCallId === 'string') slim.toolCallId = m.toolCallId;
  if (typeof m.toolName === 'string') slim.toolName = m.toolName;
  return slim;
}


function bumpUrlPromptScopeLru(lru: string[], scope: string): string[] {
  const filtered = lru.filter((s) => s !== scope);
  filtered.unshift(scope);
  return filtered.length > URL_PROMPT_SCOPE_LRU_MAX
    ? filtered.slice(0, URL_PROMPT_SCOPE_LRU_MAX)
    : filtered;
}

const QUOTA_ERROR_NAMES = new Set(['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED']);
function isQuotaExceededError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: unknown; code?: unknown };
  if (typeof e.name === 'string' && QUOTA_ERROR_NAMES.has(e.name)) return true;
  if (typeof e.code === 'number' && (e.code === 22 || e.code === 1014)) return true;
  return false;
}

/** Browser-only; throws away message history from the just-attempted write and retries once. */
function tryPruneSerializedAndRetry(key: string, value: string): boolean {
  try {
    const parsed = JSON.parse(value) as { state?: Record<string, unknown> };
    if (!parsed || typeof parsed !== 'object') return false;
    const st = parsed.state;
    if (!st || typeof st !== 'object') return false;
    (st as Record<string, unknown>).messagesByUrlPrompt = {};
    window.localStorage.setItem(key, JSON.stringify(parsed));
    return true;
  } catch {
    return false;
  }
}

let _quotaWarned = false;

function schedulePersistQuotaRecovered(): void {
  if (typeof window === 'undefined') return;
  queueMicrotask(() => {
    // Only clear when blocked; otherwise setState would re-trigger persist → setItem → this path
    // again (infinite loop / max update depth).
    if (!useChatStore.getState().persistStorageQuotaBlocked) return;
    useChatStore.setState({ persistStorageQuotaBlocked: false });
  });
}

function schedulePersistQuotaBlocked(): void {
  if (typeof window === 'undefined') return;
  queueMicrotask(() => {
    useChatStore.setState((s) =>
      s.persistStorageQuotaBlocked ? s : { ...s, persistStorageQuotaBlocked: true },
    );
  });
}

/**
 * `Storage`-compatible wrapper around `window.localStorage` that swallows `QuotaExceededError` so
 * the user never sees the raw browser message. On quota failure we prune the message map from the
 * pending payload and retry once; if that still fails we log a single warning and skip the write.
 */
function createSafeLocalStorage(): StateStorage | undefined {
  if (typeof window === 'undefined') return undefined;
  return {
    getItem: (name) => {
      try {
        return window.localStorage.getItem(name);
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      try {
        window.localStorage.setItem(name, value);
        schedulePersistQuotaRecovered();
      } catch (err) {
        if (!isQuotaExceededError(err)) throw err;
        if (tryPruneSerializedAndRetry(name, value)) {
          schedulePersistQuotaRecovered();
          return;
        }
        schedulePersistQuotaBlocked();
        if (!_quotaWarned) {
          _quotaWarned = true;
          console.warn(
            '[NitroChat] localStorage quota exceeded; persistence write skipped. ' +
              'Existing data is retained, but new chat history may not survive a reload.',
          );
        }
      }
    },
    removeItem: (name) => {
      try {
        window.localStorage.removeItem(name);
      } catch {
        // Ignore: removal failures are non-actionable.
      }
    },
  };
}

/** Helper for direct `localStorage.setItem` calls (voice settings) that we want to keep noisy-free. */
function safeSetLocalStorageItem(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
    schedulePersistQuotaRecovered();
  } catch (err) {
    if (!isQuotaExceededError(err)) throw err;
    schedulePersistQuotaBlocked();
    if (!_quotaWarned) {
      _quotaWarned = true;
      console.warn(
        `[NitroChat] localStorage quota exceeded; skipping write for "${key}".`,
      );
    }
  }
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      // Initial state
      messages: [],
      isLoading: false,
      provider: 'gemini',
      tools: [],
      prompts: [],
      resources: [],
      oauthRequired: false,
      oauthServerName: null,
      oauthServerLogo: null,
      oauthAuthorizationEndpoint: null,
      oauthTokenEndpoint: null,
      oauthAudience: null,
      oauthAccessToken: null,
      oauthRefreshToken: null,
      oauthExpiresAt: null,

      zitadelEnabled: false,
      zitadelLoginLabel: null,
      zitadelAuthorizationEndpoint: null,
      zitadelTokenEndpoint: null,
      zitadelUserinfoEndpoint: null,
      zitadelIssuer: null,
      zitadelClientId: null,
      zitadelAudience: null,
      zitadelIdpHint: null,
      zitadelAccessToken: null,
      zitadelRefreshToken: null,
      zitadelExpiresAt: null,

      chatId: null,

      threadActorId: null,
      threadActorType: null,
      threadId: null,
      isThreadBootstrapped: false,

      activeUrlPromptScope: PROMPT_SCOPE_DEFAULT,
      messagesByUrlPrompt: {},
      urlPromptScopeLru: [],

      // Voice initial state
      elevenLabsApiKey: null,
      voiceModeEnabled: false,
      voiceModeType: 'voice-only', // Default to voice-only mode
      voiceModel: 'eleven_multilingual_v2',
      voiceId: '21m00Tcm4TlvDq8ikWAM',
      outputLanguage: 'en',
      inputLanguage: 'en-US',
      ttsMuted: false,

      persistStorageQuotaBlocked: false,

      // Actions
      setChatId: (id) => set({ chatId: id }),

      addMessage: (message) =>
        set((state) => {
          const scope = state.activeUrlPromptScope;
          const next = [...state.messages, message];
          return {
            messages: next,
            messagesByUrlPrompt: { ...state.messagesByUrlPrompt, [scope]: next },
          };
        }),

      setMessages: (messages) =>
        set((state) => ({
          messages,
          messagesByUrlPrompt: {
            ...state.messagesByUrlPrompt,
            [state.activeUrlPromptScope]: messages,
          },
        })),

      updateMessage: (id, update) =>
        set((state) => {
          const scope = state.activeUrlPromptScope;
          const next = state.messages.map((msg) =>
            msg.id === id ? { ...msg, ...update } : msg
          );
          return {
            messages: next,
            messagesByUrlPrompt: { ...state.messagesByUrlPrompt, [scope]: next },
          };
        }),

      clearMessages: () =>
        set((state) => {
          const scope = state.activeUrlPromptScope;
          const next: ChatMessage[] = [];
          return {
            messages: next,
            messagesByUrlPrompt: { ...state.messagesByUrlPrompt, [scope]: next },
          };
        }),

      clearUrlPromptScope: (scope) =>
        set((state) => {
          const next: ChatMessage[] = [];
          const isActive = state.activeUrlPromptScope === scope;
          return {
            messages: isActive ? next : state.messages,
            messagesByUrlPrompt: { ...state.messagesByUrlPrompt, [scope]: next },
            ...(isActive ? { chatId: null } : {}),
          };
        }),

      clearAllUrlPromptConversations: () =>
        set((state) => ({
          messages: [],
          messagesByUrlPrompt: {},
          chatId: null,
          activeUrlPromptScope: state.activeUrlPromptScope,
          urlPromptScopeLru: [state.activeUrlPromptScope],
        })),

      setActiveUrlPromptScope: (newScope) =>
        set((state) => {
          const raw = state.messagesByUrlPrompt[newScope];
          const nextMsgs = normalizeScopeMessages(raw);
          const scopeChanged = state.activeUrlPromptScope !== newScope;
          return {
            activeUrlPromptScope: newScope,
            messages: nextMsgs,
            messagesByUrlPrompt: {
              ...state.messagesByUrlPrompt,
              [newScope]: nextMsgs,
            },
            urlPromptScopeLru: bumpUrlPromptScopeLru(state.urlPromptScopeLru, newScope),
            ...(scopeChanged ? { chatId: null } : {}),
          };
        }),

      setLoading: (loading) => set({ isLoading: loading }),

      setProvider: (provider) => set({ provider }),

      setTools: (tools) => set({ tools }),

      setPrompts: (prompts) => set({ prompts }),

      setResources: (resources) => set({ resources }),

      setOAuthConfig: (config) => set({
        oauthRequired: config.required,
        oauthServerName: config.serverName || null,
        oauthServerLogo: config.serverLogo || null,
        oauthAuthorizationEndpoint: config.authorizationEndpoint || null,
        oauthTokenEndpoint: config.tokenEndpoint || null,
        oauthAudience: config.audience || null,
      }),

      setOAuthTokens: (tokens) => set({
        oauthAccessToken: tokens.accessToken,
        oauthRefreshToken: tokens.refreshToken || null,
        oauthExpiresAt: tokens.expiresAt || null,
      }),

      clearOAuthTokens: () => set({
        oauthAccessToken: null,
        oauthRefreshToken: null,
        oauthExpiresAt: null,
      }),

      setZitadelConfig: (config) => set({
        zitadelEnabled: config.enabled,
        zitadelLoginLabel: config.loginLabel ?? null,
        zitadelAuthorizationEndpoint: config.authorizationEndpoint ?? null,
        zitadelTokenEndpoint: config.tokenEndpoint ?? null,
        zitadelUserinfoEndpoint: config.userinfoEndpoint ?? null,
        zitadelIssuer: config.issuer ?? null,
        zitadelClientId: config.clientId ?? null,
        zitadelAudience: config.audience ?? null,
        zitadelIdpHint: config.idpHint ?? null,
      }),

      setZitadelTokens: (tokens) => set({
        zitadelAccessToken: tokens.accessToken,
        zitadelRefreshToken: tokens.refreshToken || null,
        zitadelExpiresAt: tokens.expiresAt || null,
      }),

      clearZitadelTokens: () => set({
        zitadelAccessToken: null,
        zitadelRefreshToken: null,
        zitadelExpiresAt: null,
      }),

      exportChat: () => {
        const state = get();
        return JSON.stringify({
          messages: state.messages,
          timestamp: Date.now(),
          provider: state.provider,
        }, null, 2);
      },

      importChat: (data) => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.messages && Array.isArray(parsed.messages)) {
            const msgs = normalizeScopeMessages(parsed.messages);
            set((state) => ({
              messages: msgs,
              messagesByUrlPrompt: {
                ...state.messagesByUrlPrompt,
                [state.activeUrlPromptScope]: msgs,
              },
            }));
          }
        } catch (error) {
          console.error('Failed to import chat:', error);
        }
      },

      // Voice actions
      setElevenLabsApiKey: (key) => set({ elevenLabsApiKey: key }),
      setVoiceModeEnabled: (enabled) => set({ voiceModeEnabled: enabled }),
      setVoiceModeType: (type) => {
        set({ voiceModeType: type });
        safeSetLocalStorageItem('voice_mode_type', type);
      },
      setVoiceModel: (model) => {
        set({ voiceModel: model });
        safeSetLocalStorageItem('voice_model', model);
      },
      setVoiceId: (id) => {
        set({ voiceId: id });
        safeSetLocalStorageItem('voice_id', id);
      },
      setOutputLanguage: (lang) => {
        set({ outputLanguage: lang });
        safeSetLocalStorageItem('output_language', lang);
      },
      setInputLanguage: (lang) => {
        set({ inputLanguage: lang });
        safeSetLocalStorageItem('input_language', lang);
      },
      setTtsMuted: (muted) => {
        set({ ttsMuted: muted });
        safeSetLocalStorageItem('tts_muted', String(muted));
      },

      dismissPersistStorageQuotaNotice: () => set({ persistStorageQuotaBlocked: false }),

      setThreadActor: (actorId, actorType) => set({ threadActorId: actorId, threadActorType: actorType }),
      setThreadId: (threadId) => set({ threadId }),
      setThreadBootstrapped: (value) => set({ isThreadBootstrapped: value }),
      clearThreadIdentity: () => set({
        threadActorId: null,
        threadActorType: null,
        threadId: null,
        isThreadBootstrapped: false,
      }),
    }),
    {
      name: 'nitrochat-oauth-storage',
      version: 2,
      storage: createJSONStorage(() => createSafeLocalStorage() ?? {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      } satisfies StateStorage),
      migrate: (persistedState, version) => {
        let next: unknown = persistedState;
        // v0→v1: messages flat array → messagesByUrlPrompt map
        if (version === 0 && persistedState && typeof persistedState === 'object') {
          const p = persistedState as Record<string, unknown>;
          const msgs = p.messages;
          const hasMap =
            p.messagesByUrlPrompt &&
            typeof p.messagesByUrlPrompt === 'object' &&
            !Array.isArray(p.messagesByUrlPrompt);
          if (Array.isArray(msgs) && !hasMap) {
            next = {
              ...p,
              messagesByUrlPrompt: { [PROMPT_SCOPE_DEFAULT]: normalizeScopeMessages(msgs) },
              messages: [],
              activeUrlPromptScope: PROMPT_SCOPE_DEFAULT,
            };
          }
        }
        // v1→v2: drop messagesByUrlPrompt from persisted state (messages now served from ClickHouse)
        if (version <= 1 && next && typeof next === 'object') {
          const p = next as Record<string, unknown>;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { messagesByUrlPrompt: _dropped, urlPromptScopeLru: _lru, ...rest } = p;
          next = rest;
        }
        return next;
      },
      onRehydrateStorage: () => (rehydrated) => {
        if (!rehydrated) return;
        // urlPromptScopeLru is not persisted since v2; reset to empty on every load.
        rehydrated.urlPromptScopeLru = [];
      },
      partialize: (state) => ({
        chatId: state.chatId,
        threadActorId: state.threadActorId,
        threadActorType: state.threadActorType,
        threadId: state.threadId,
        oauthAccessToken: state.oauthAccessToken,
        oauthRefreshToken: state.oauthRefreshToken,
        oauthExpiresAt: state.oauthExpiresAt,
        zitadelAccessToken: state.zitadelAccessToken,
        zitadelRefreshToken: state.zitadelRefreshToken,
        zitadelExpiresAt: state.zitadelExpiresAt,
        elevenLabsApiKey: state.elevenLabsApiKey,
        voiceModeEnabled: state.voiceModeEnabled,
        voiceModeType: state.voiceModeType,
        voiceModel: state.voiceModel,
        voiceId: state.voiceId,
        outputLanguage: state.outputLanguage,
        inputLanguage: state.inputLanguage,
        ttsMuted: state.ttsMuted,
      }),
    }
  )
);
