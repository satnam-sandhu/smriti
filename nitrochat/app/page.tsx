'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Settings, Download, Trash2, RefreshCw, PanelLeftOpen, Bot } from 'lucide-react';
import { useChatStore, ChatMessage as ChatMessageType, urlPromptScopeKeyFromRaw } from '@/lib/store';
import { consumeChatStream } from '@/lib/chat-stream-sse';
import { getMcpClient } from '@/lib/mcp-client';
import { buildChatApiRequestBody, trimMessagesForModel } from '@/lib/chat-api-payload';
import {
  MAX_TOOL_ROUNDS,
  ToolExecutionCache,
} from '@/lib/tool-call-chain';
import { processLlmToolCalls } from '@/lib/process-llm-tool-round';
import { generateId, downloadAsFile, filterVisibleMessages, decodeUrlPromptParam } from '@/lib/utils';
import { getConfig, NitroChatConfig } from '@/nitrochat.config';
import { ChatMessage } from '@/components/ChatMessage';
import { ChatInput } from '@/components/ChatInput';
import { VoiceOrbOverlay } from '@/components/VoiceOrbOverlay';
import { VoiceChatPopup } from '@/components/VoiceChatPopup';
import { WelcomeScreen } from '@/components/WelcomeScreen';
import { SettingsPanel } from '@/components/SettingsPanel';
import { Sidebar } from '@/components/Sidebar';
import { SidebarTemplate } from '@/templates/SidebarTemplate';
import { CenteredTemplate } from '@/templates/CenteredTemplate';
import { SplitViewTemplate } from '@/templates/SplitViewTemplate';
import { CompactTemplate } from '@/templates/CompactTemplate';
import { OAuthLoginModal } from '@/components/OAuthLoginModal';
import { ZitadelLoginModal } from '@/components/ZitadelLoginModal';
import { ConfirmModal } from '@/components/ConfirmModal';
import { CreditsExhaustedModal } from '@/components/CreditsExhaustedModal';
import { InvalidKeyModal } from '@/components/InvalidKeyModal';
import {
  isAuthenticated, saveCodeVerifier, saveState, getCodeVerifier, getState, saveTokens, getTokens,
  refreshAccessToken,
  isTokenExpired,
  clearTokens,
  clearCodeVerifier,
  clearState,
  parseJwtExpiryMs,
} from '@/lib/oauth';
import {
  isZitadelAuthenticated,
  isZitadelTokenExpired,
  saveZitadelTokens,
  saveZitadelCodeVerifier,
  saveZitadelState,
  getZitadelCodeVerifier,
  getZitadelState,
  logoutZitadel,
  refreshZitadelAccessToken,
} from '@/lib/zitadel';
import { fetchChatPersistenceApi } from '@/lib/chat-persistence-fetch';
import { chatApiRequestHeaders } from '@/lib/chat-api-headers';
import { estimateContextTokens } from '@/lib/context-utils';
import { toast } from 'sonner';
import { MCP_TOAST_DISCONNECTED, MCP_TOAST_NOT_CONFIGURED } from '@/lib/mcp-user-feedback';
import {
  applyRuntimeThemeToRoot,
  fallbackStandaloneChatbotLogo,
  resolveBrandingFaviconForSurface,
  withMergedRuntimeTheme,
} from '@/lib/theme-runtime';
import { syncDocumentTitle } from '@/lib/sync-document-title';
import {
  armPendingCleanOnRefresh,
  clearPendingCleanOnRefresh,
  consumePendingCleanOnRefresh,
  peekPendingCleanOnRefresh,
  shouldArmCleanOnRefresh,
} from '@/lib/standalone-clean';
import {
  resolveActor,
  resolveThread,
  getThreadMessages,
  withTimeout,
  type ThreadMessage,
} from '@/lib/threads-api';
import {
  persistAssistantThreadMessage,
  persistThreadMessageFireAndForget,
  persistToolResultThreadMessages,
} from '@/lib/threads-persist';

// Get base config (will be merged with runtime config)
const baseConfig = getConfig();

function readInitialThemeMode(): 'dark' | 'light' | 'system_default' {
  const m = baseConfig.theme_version_2?.mode;
  if (m === 'light' || m === 'dark' || m === 'system_default') return m;
  return 'system_default';
}

export default function HomePage() {
  const [config, setConfig] = useState<NitroChatConfig>(baseConfig);
  const [configLoaded, setConfigLoaded] = useState(false);

  const {
    messages,
    isLoading,
    provider,
    tools,
    prompts,
    resources,
    addMessage,
    setLoading,
    setTools,
    setPrompts,
    setResources,
    clearMessages,
    clearAllUrlPromptConversations,
    exportChat,
    setProvider,
    // OAuth fields
    oauthRequired,
    oauthServerName,
    oauthServerLogo,
    oauthAuthorizationEndpoint,
    oauthTokenEndpoint,
    oauthAccessToken,
    oauthRefreshToken,
    oauthExpiresAt,
    oauthAudience,
    setOAuthConfig,
    setOAuthTokens,
    clearOAuthTokens,
    // Zitadel fields (parallel to OAuth)
    zitadelEnabled,
    zitadelLoginLabel,
    zitadelAuthorizationEndpoint,
    zitadelAudience,
    zitadelIdpHint,
    zitadelAccessToken,
    zitadelRefreshToken,
    zitadelExpiresAt,
    setZitadelConfig,
    setZitadelTokens,
    clearZitadelTokens,
    chatId,
    setChatId,
    // Thread identity fields (M4/M5)
    threadActorId,
    threadActorType,
    threadId,
    setThreadActor,
    setThreadId,
    setThreadBootstrapped,
    setMessages,
    // Voice fields
    elevenLabsApiKey,
    voiceModeEnabled,
    voiceModeType,
    voiceModel,
    voiceId,
    outputLanguage,
    inputLanguage,
    ttsMuted,
    setElevenLabsApiKey,
    setVoiceModeEnabled,
  } = useChatStore();

  const [chats, setChats] = useState<{ _id: string; title: string }[]>([]);
  const [chatPage, setChatPage] = useState(1);
  const [hasMoreChats, setHasMoreChats] = useState(false);
  const [loadingChats, setLoadingChats] = useState(false);
  const CHATS_PER_PAGE = 5;

  const [systemInstruction, setSystemInstruction] = useState<string>(''); // For MCP-injected system prompt
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [creditsExhaustedOpen, setCreditsExhaustedOpen] = useState(false);
  const [invalidKeyOpen, setInvalidKeyOpen] = useState(false);
  const [invalidKeyMessage, setInvalidKeyMessage] = useState<string>('');
  const [creditsInfo, setCreditsInfo] = useState<{ limit: number; used: number }>({ limit: 0, used: 0 });
  const [contextLimitOpen, setContextLimitOpen] = useState(false);
  const [sessionCompleted, setSessionCompleted] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  /** Prevents duplicate chat creation when syncChat is called twice in quick succession (e.g. send + tool continuation) */
  const createChatPromiseRef = useRef<Promise<string | null> | null>(null);
  const [mcpConnected, setMcpConnected] = useState(false);
  const [mcpInitFinished, setMcpInitFinished] = useState(false);
  const [userTheme, setUserTheme] = useState<'dark' | 'light'>('dark'); // User's theme preference in system_default mode (synced below)
  const [themeMode, setThemeMode] = useState<'dark' | 'light' | 'system_default'>(readInitialThemeMode);
  const [zitadelCompletingSignIn, setZitadelCompletingSignIn] = useState(false);
  const [zitadelSignInError, setZitadelSignInError] = useState<string | null>(null);
  const [zitadelLoggingIn, setZitadelLoggingIn] = useState(false);

  // Thread bootstrap state (M5)
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const bootstrapLockRef = useRef(false);
  const [bootstrapRetryCount, setBootstrapRetryCount] = useState(0);

  useLayoutEffect(() => {
    if (baseConfig.theme_version_2?.mode !== 'system_default') return;
    const saved = localStorage.getItem('nitrochat-user-theme') as 'dark' | 'light' | null;
    if (saved === 'light' || saved === 'dark') {
      setUserTheme(saved);
      return;
    }
    if (typeof window !== 'undefined' && window.matchMedia) {
      setUserTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    }
  }, []);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mcpClient = getMcpClient();
  const initialToolExecuted = useRef(false);
  const urlPromptExecuted = useRef(false);
  /** Per-user-turn cache of MCP results so duplicate (tool, args) calls hit the network once. */
  const toolExecutionCacheRef = useRef<ToolExecutionCache>(new ToolExecutionCache());
  const lastPromptQueryRef = useRef<string | null>(null);
  /** Last `?accessToken=` value applied (re-apply when parent sends a new token on same URL). */
  const lastAppliedAccessTokenFromUrl = useRef<string | null>(null);
  /** Set each render after `handleSendMessage` is defined; URL prompt effect calls this ref. */
  const sendFromUrlPromptRef = useRef<(text: string) => void>(() => {});
  const initializationInProgress = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const searchParams = useSearchParams();
  const accessTokenInUrl = searchParams.get('accessToken')?.trim() ?? '';
  const promptQuery = searchParams.get('prompt');
  const discardHistoryParam = searchParams.get('retainHistory') === 'false';
  const expectedSessionEndTool = searchParams.get('sessionEndTool')?.trim() ?? '';
  const sessionEndHandledRef = useRef(false);
  const pendingSessionCompleteRef = useRef(false);

  const applyPendingCleanFromStorage = useCallback((consume: boolean) => {
    const pendingScope = consume
      ? consumePendingCleanOnRefresh()
      : peekPendingCleanOnRefresh();
    if (!pendingScope) return;
    useChatStore.getState().clearUrlPromptScope(pendingScope);
    // Ensure one-shot flag is gone after history clear (consume removes on read; explicit for safety).
    if (consume) clearPendingCleanOnRefresh();
  }, []);

  // `?prompt=`-scoped local threads (see messagesByUrlPrompt in store). Re-apply after zustand rehydration.
  useLayoutEffect(() => {
    applyPendingCleanFromStorage(false);
    const scope = urlPromptScopeKeyFromRaw(promptQuery);
    useChatStore.getState().setActiveUrlPromptScope(scope);
    if (discardHistoryParam && promptQuery?.trim()) {
      useChatStore.getState().clearMessages();
    }
  }, [promptQuery, discardHistoryParam, applyPendingCleanFromStorage]);

  useEffect(() => {
    const runPendingCleanAfterHydration = () => {
      if (typeof window === 'undefined') return;
      applyPendingCleanFromStorage(true);
      const params = new URLSearchParams(window.location.search);
      const rawPrompt = params.get('prompt');
      useChatStore.getState().setActiveUrlPromptScope(urlPromptScopeKeyFromRaw(rawPrompt));
      if (params.get('retainHistory') === 'false' && rawPrompt?.trim()) {
        useChatStore.getState().clearMessages();
      }
    };

    // If rehydration finished before this effect subscribed, onFinishHydration never fires — flag would stick.
    if (useChatStore.persist.hasHydrated()) {
      runPendingCleanAfterHydration();
    }

    return useChatStore.persist.onFinishHydration(runPendingCleanAfterHydration);
  }, [applyPendingCleanFromStorage]);

  // ── Thread bootstrap (M5) ───────────────────────────────────────────────────
  function mapThreadMessagesToStore(msgs: ThreadMessage[]): ChatMessageType[] {
    return msgs.map((m) => ({
      id: m.messageId,
      role: m.role as ChatMessageType['role'],
      content: m.content,
      timestamp: new Date(m.createdAt).getTime(),
    }));
  }

  useEffect(() => {
    const standalone = searchParams.get('standaloneMode') === 'true';
    const threadsEnabled = config.features?.threadsEnabled;
    if (!standalone || !threadsEnabled) return;
    if (bootstrapLockRef.current) return;

    // Wait for Zustand rehydration so we read the persisted actorId/threadId.
    const run = () => {
      if (bootstrapLockRef.current) return;
      bootstrapLockRef.current = true;

      const storedActorId = useChatStore.getState().threadActorId;
      const urlUserId = searchParams.get('userId')?.trim() || null;

      async function runBootstrap() {
        setIsBootstrapping(true);
        setBootstrapError(null);
        try {
          const actor = await withTimeout(
            resolveActor({
              externalUserId: urlUserId ?? undefined,
              actorId: urlUserId ? undefined : (storedActorId ?? undefined),
            }),
            10_000,
            'resolveActor',
          );
          setThreadActor(actor.actorId, actor.actorType);

          const thread = await withTimeout(
            resolveThread({ actorId: actor.actorId, actorType: actor.actorType }),
            10_000,
            'resolveThread',
          );
          setThreadId(thread.threadId);

          const msgs = await getThreadMessages(thread.threadId, { limit: 20 });
          if (msgs.length > 0) {
            setMessages(mapThreadMessagesToStore(msgs));
          }

          setThreadBootstrapped(true);
        } catch (err) {
          console.error('[bootstrap] failed:', err);
          setBootstrapError('Could not restore your conversation. Check your connection and retry.');
          bootstrapLockRef.current = false;
        } finally {
          setIsBootstrapping(false);
        }
      }

      runBootstrap();
    };

    if (useChatStore.persist.hasHydrated()) {
      run();
    } else {
      const unsub = useChatStore.persist.onFinishHydration(() => {
        unsub();
        run();
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, bootstrapRetryCount, config.features?.threadsEnabled]);

  function handleRetryBootstrap() {
    bootstrapLockRef.current = false;
    setBootstrapError(null);
    setThreadBootstrapped(false);
    setBootstrapRetryCount((c) => c + 1);
  }

  // Reconnect handler: if the browser goes offline during bootstrap and comes back, re-try.
  useEffect(() => {
    const threadsEnabled = config.features?.threadsEnabled;
    if (!threadsEnabled) return;
    if (searchParams.get('standaloneMode') !== 'true') return;

    function handleOnline() {
      const bootstrapped = useChatStore.getState().isThreadBootstrapped;
      if (!bootstrapped) {
        bootstrapLockRef.current = false;
        setBootstrapRetryCount((c) => c + 1);
      }
    }

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, config.features?.threadsEnabled]);

  // ────────────────────────────────────────────────────────────────────────────

  /** Before clear/delete in standalone, align scope to current ?prompt= so we only wipe that bucket (not default / stale scope). */
  const syncStandaloneUrlPromptScope = useCallback(() => {
    if (searchParams.get('standaloneMode') !== 'true') return;
    useChatStore.getState().setActiveUrlPromptScope(urlPromptScopeKeyFromRaw(searchParams.get('prompt')));
  }, [searchParams]);

  useEffect(() => {
    sessionEndHandledRef.current = false;
    pendingSessionCompleteRef.current = false;
    setSessionCompleted(false);
  }, [expectedSessionEndTool]);

  useEffect(() => {
    if (isLoading) return;
    if (!pendingSessionCompleteRef.current) return;
    pendingSessionCompleteRef.current = false;
    setSessionCompleted(true);
  }, [isLoading]);

  const maybeShowSessionEndPopup = useCallback((toolName: string, success: boolean) => {
    if (!success) return;
    if (searchParams.get('standaloneMode') !== 'true') return;
    if (!expectedSessionEndTool) return;
    if (sessionEndHandledRef.current) return;
    if (toolName.trim().toLowerCase() !== expectedSessionEndTool.toLowerCase()) return;
    sessionEndHandledRef.current = true;
    if (shouldArmCleanOnRefresh(searchParams)) {
      armPendingCleanOnRefresh(useChatStore.getState().activeUrlPromptScope);
    }
    if (isLoading) {
      pendingSessionCompleteRef.current = true;
      return;
    }
    setSessionCompleted(true);
  }, [searchParams, expectedSessionEndTool, isLoading]);

  // Gateway model selection state
  const [selectedModel, setSelectedModel] = useState<string>('openrouter/auto');
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string; provider?: string }>>([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  // Voice mode state
  type LLMState = 'idle' | 'listening' | 'thinking' | 'speaking';
  const [llmState, setLlmState] = useState<LLMState>('idle');
  const [voiceOverlayOpen, setVoiceOverlayOpen] = useState(false);
  const [voiceChatPopupOpen, setVoiceChatPopupOpen] = useState(false);
  const [transcribedText, setTranscribedText] = useState<string | null>(null);
  const [spokenText, setSpokenText] = useState('');
  const [voiceDisplayMode, setVoiceDisplayMode] = useState<'voice-only' | 'voice-chat'>('voice-only');
  const hasSpokenGreeting = useRef(false);

  // Listen for voice overlay open event from SidebarTemplate
  // MUST be before any early returns to follow Rules of Hooks
  useEffect(() => {
    const handleOpenVoiceOverlay = () => {
      if (voiceModeType === 'voice-chat') {
        // Open voice chat popup instead of full overlay
        setVoiceChatPopupOpen(true);
        setVoiceModeEnabled(true);
        // Don't set to 'listening' immediately - let greeting play first (will be set to 'speaking' by onGreet)
        // After greeting ends, playTextToSpeech will set it to 'listening'
      } else {
        // Open full voice overlay
        setVoiceOverlayOpen(true);
        setVoiceModeEnabled(true);
        // Don't set to 'listening' immediately - let greeting play first (will be set to 'speaking' by onGreet)
        // After greeting ends, playTextToSpeech will set it to 'listening'
      }
    };
    window.addEventListener('open-voice-overlay', handleOpenVoiceOverlay);
    return () => {
      window.removeEventListener('open-voice-overlay', handleOpenVoiceOverlay);
    };
  }, [setVoiceModeEnabled, voiceModeType]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-execute initial tool
  useEffect(() => {
    if (tools.length > 0 && !initialToolExecuted.current) {
      checkAndRunInitialTool();
    }
  }, [tools]);

  // Apply ?accessToken=… before paint so localStorage + isAuthenticated() match URL (avoids OAuth modal flash when oauthRequired).
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = searchParams.get('accessToken');
    if (!raw?.trim()) return;
    const accessToken = raw.trim();
    if (lastAppliedAccessTokenFromUrl.current === accessToken) return;
    lastAppliedAccessTokenFromUrl.current = accessToken;
    const expiresAt = parseJwtExpiryMs(accessToken) ?? Date.now() + 3_600_000;
    saveTokens({ accessToken, expiresAt, tokenType: 'Bearer' });
    setOAuthTokens({ accessToken, expiresAt });
  }, [searchParams, setOAuthTokens]);

  // Zustand persist can rehydrate after useLayoutEffect and overwrite oauth with an older nitrochat-oauth-storage snapshot — realign from nitrochat_oauth_tokens when URL token matches.
  useEffect(() => {
    const alignOAuthFromStorageForUrlToken = () => {
      const urlTok = searchParams.get('accessToken')?.trim();
      if (!urlTok) return;
      const stored = getTokens();
      if (!stored || stored.accessToken !== urlTok) return;
      const st = useChatStore.getState();
      if (st.oauthAccessToken !== urlTok) {
        setOAuthTokens({
          accessToken: stored.accessToken,
          refreshToken: stored.refreshToken ?? undefined,
          expiresAt: stored.expiresAt,
        });
      }
    };
    alignOAuthFromStorageForUrlToken();
    const unsub = useChatStore.persist.onFinishHydration(alignOAuthFromStorageForUrlToken);
    return unsub;
  }, [searchParams, setOAuthTokens]);

  // Reset URL prompt latch when `prompt=` changes so a new deep link can auto-send.
  useEffect(() => {
    const current = searchParams.get('prompt') ?? '';
    if (lastPromptQueryRef.current !== current) {
      lastPromptQueryRef.current = current;
      urlPromptExecuted.current = false;
    }
  }, [searchParams]);

  // Auto-send ?prompt=… when MCP is ready.
  // standaloneMode + prompt: keep existing thread by default (omit retainHistory or retainHistory=true).
  // retainHistory=false: clear only this ?prompt= bucket in persisted messagesByUrlPrompt (other prompt keys unchanged).
  // With standaloneMode + persistence, also start a new server chat before sending.
  // If the thread already has messages, do not auto-send (unless retainHistory=false will clear first).
  useEffect(() => {
    const urlPromptRaw = searchParams.get('prompt')?.trim();
    if (
      !urlPromptRaw ||
      !mcpConnected ||
      !mcpInitFinished ||
      urlPromptExecuted.current ||
      isLoading
    ) {
      return;
    }

    const standalone = searchParams.get('standaloneMode') === 'true';
    const discardHistory = searchParams.get('retainHistory') === 'false';
    const decodedPrompt = decodeUrlPromptParam(urlPromptRaw);

    if (!discardHistory && useChatStore.getState().messages.length > 0) {
      urlPromptExecuted.current = true;
      return;
    }

    urlPromptExecuted.current = true;

    void (async () => {
      try {
        if (discardHistory) {
          const scopeKey = urlPromptScopeKeyFromRaw(urlPromptRaw);
          useChatStore.getState().setActiveUrlPromptScope(scopeKey);
          clearMessages();
        }
        if (standalone && discardHistory) {
          setChatId(null);
          createChatPromiseRef.current = null;
          if (config.persistence?.enabled && (isAuthenticated() || isZitadelAuthenticated())) {
            try {
              const response = await fetchChatPersistenceApi('/api/chats', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ messages: [], provider: 'gateway' }),
              });
              if (response.ok) {
                const newChat = await response.json();
                setChatId(newChat._id);
                setChats((prev) => {
                  if (prev.some((c) => c._id === newChat._id)) return prev;
                  return [{ _id: newChat._id, title: newChat.title || 'New Chat' }, ...prev];
                });
              }
            } catch (err) {
              console.error('[NitroChat] Failed to create chat for standalone URL prompt:', err);
            }
          }
        }
        sendFromUrlPromptRef.current(decodedPrompt);
      } catch (e) {
        console.error('[NitroChat] Standalone URL prompt session failed:', e);
        sendFromUrlPromptRef.current(decodedPrompt);
      }
    })();
  }, [
    mcpConnected,
    isLoading,
    searchParams,
    mcpInitFinished,
    config.persistence?.enabled,
    oauthAccessToken,
    clearMessages,
    setChatId,
  ]);

  // Convert markdown content to voice-friendly, conversational text
  // Optimized for minimal TTS token usage (exact from NitroStudio)
  const convertToVoiceFriendlyText = (text: string): string => {
    if (!text) return '';

    let result = text;

    // Remove code blocks entirely (not suitable for voice)
    result = result.replace(/```[\s\S]*?```/g, 'I\'ve included code in the chat.');
    result = result.replace(/`[^`]+`/g, '');

    // Remove tables
    result = result.replace(/\|[\s\S]*?\|/g, '');
    if (text.includes('|')) {
      result = result + ' Check the chat for table details.';
    }

    // Remove markdown bold/italic
    result = result.replace(/\*\*([^*]+)\*\*/g, '$1');
    result = result.replace(/\*([^*]+)\*/g, '$1');
    result = result.replace(/__([^_]+)__/g, '$1');
    result = result.replace(/_([^_]+)_/g, '$1');

    // Remove markdown headers
    result = result.replace(/^#{1,6}\s+/gm, '');

    // Remove markdown links, keep text
    result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

    // Handle bullet lists - summarize aggressively
    const bulletMatches = result.match(/^[-*]\s+.+$/gm);
    if (bulletMatches && bulletMatches.length > 3) {
      // Get first 2 clean items
      const first2 = bulletMatches.slice(0, 2).map(item =>
        item.replace(/^[-*]\s+/, '').replace(/\*\*/g, '').replace(/\s*\([A-Z]{2,4}\)\s*/g, '').trim()
      );
      const count = bulletMatches.length;

      // Replace entire list with summary
      const listPattern = /((?:^[-*]\s+.+$\n?)+)/gm;
      result = result.replace(listPattern, `I found ${count} items, including ${first2[0]} and ${first2[1]}. `);
    } else if (bulletMatches) {
      // For short lists, just mention count and first item
      const first = bulletMatches[0].replace(/^[-*]\s+/, '').replace(/\*\*/g, '').trim();
      result = result.replace(/((?:^[-*]\s+.+$\n?)+)/gm, `${bulletMatches.length} options: ${first} and others. `);
    }

    // Remove numbered lists, summarize
    const numberedMatches = result.match(/^\d+\.\s+.+$/gm);
    if (numberedMatches && numberedMatches.length > 3) {
      const first = numberedMatches[0].replace(/^\d+\.\s+/, '').trim();
      result = result.replace(/((?:^\d+\.\s+.+$\n?)+)/gm, `${numberedMatches.length} steps, starting with: ${first}. `);
    } else {
      result = result.replace(/^\d+\.\s+/gm, '');
    }

    // Remove parenthetical codes like (LON), (STN) for voice
    result = result.replace(/\s*\([A-Z]{2,4}\)\s*/g, ' ');

    // Clean up multiple newlines and spaces
    result = result.replace(/\n{2,}/g, '. ');
    result = result.replace(/\n/g, ', ');
    result = result.replace(/\s{2,}/g, ' ');

    // Hard limit: 80 words max for voice response
    const words = result.split(/\s+/).filter(w => w.length > 0);
    if (words.length > 80) {
      result = words.slice(0, 80).join(' ') + '. Would you like more details?';
    }

    // Clean up any remaining artifacts
    result = result.replace(/,\s*,/g, ',');
    result = result.replace(/\.\s*\./g, '.');
    result = result.replace(/,\s*\./g, '.');
    result = result.trim();

    return result;
  };

  // TTS function (exact from NitroStudio - no useCallback, immediate state transition)
  const playTextToSpeech = async (text: string, bypassMute: boolean = false) => {

    if (!elevenLabsApiKey) {
      console.error('❌ No ElevenLabs API key configured');
      return;
    }

    if (!text || (!bypassMute && ttsMuted)) {
      return;
    }

    try {
      setLlmState('speaking');

      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': elevenLabsApiKey,
        },
        body: JSON.stringify({
          text,
          model_id: voiceModel,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      });


      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ ElevenLabs API error:', errorText);
        throw new Error(`TTS failed: ${response.status} - ${errorText}`);
      }

      const blob = await response.blob();

      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);

      audio.onended = () => {
        setLlmState('listening'); // Resume listening after speaking (immediate, no delay)
        URL.revokeObjectURL(url);
      };

      audio.onerror = (e) => {
        console.error('❌ Audio playback error:', e);
        // If voice mode is enabled, transition to listening instead of idle
        if (voiceModeEnabled || voiceOverlayOpen || voiceChatPopupOpen) {
          setLlmState('listening');
        } else {
          setLlmState('idle');
        }
        URL.revokeObjectURL(url);
      };

      audioRef.current = audio;

      try {
        await audio.play();
      } catch (playError) {
        console.error('❌ Audio play failed (autoplay policy?):', playError);
        // If voice mode is enabled, transition to listening instead of idle
        if (voiceModeEnabled || voiceOverlayOpen || voiceChatPopupOpen) {
          setLlmState('listening');
        } else {
          setLlmState('idle');
        }
      }
    } catch (error) {
      console.error('❌ TTS Error:', error);
      // If voice mode is enabled, transition to listening instead of idle
      // This allows the popup/overlay to continue working even if TTS fails
      if (voiceModeEnabled || voiceOverlayOpen || voiceChatPopupOpen) {
        setLlmState('listening');
      } else {
        setLlmState('idle');
      }
    }
  };

  // Text-to-Speech logic for new messages (when in voice mode or overlay is open)
  // Exact from NitroStudio - simpler condition, ttsMuted checked inside playTextToSpeech
  useEffect(() => {
    // Only trigger TTS if voice mode is enabled OR overlay is open
    if ((!voiceModeEnabled && !voiceOverlayOpen) || !elevenLabsApiKey || messages.length === 0) return;

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role === 'assistant' && lastMessage.content) {
      // Stop any current audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      // Set the text being spoken for overlay display
      const voiceText = convertToVoiceFriendlyText(lastMessage.content);
      setSpokenText(voiceText);
      playTextToSpeech(voiceText);
    }
  }, [messages, voiceModeEnabled, voiceOverlayOpen, elevenLabsApiKey]);

  // Load runtime configuration from API
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetch('/api/config');
        if (response.ok) {
          const runtimeConfig = await response.json();

          // Load env into window.__ENV__ so client-side getConfig() can read them
          if (typeof window !== 'undefined' && runtimeConfig.env) {
            (window as any).__ENV__ = {
              ...(window as any).__ENV__,
              ...runtimeConfig.env,
            };
          }

          // Merge runtime config with base config
          const mergedConfig = {
            ...baseConfig,
            mcp: {
              ...baseConfig.mcp,
              ...runtimeConfig.mcp,
            },
            branding: {
              ...baseConfig.branding,
              ...runtimeConfig.branding,
            },
            theme_version_2: withMergedRuntimeTheme(
              { theme_version_2: baseConfig.theme_version_2 } as NitroChatConfig,
              { theme_version_2: runtimeConfig.theme_version_2 } as NitroChatConfig,
            ).theme_version_2!,
            chat: {
              ...baseConfig.chat,
              ...runtimeConfig.chat,
            },
            features: {
              ...baseConfig.features,
              ...runtimeConfig.features,
            },
            ui: {
              ...baseConfig.ui,
              ...runtimeConfig.ui,
            },
            ai: {
              ...baseConfig.ai,
              ...runtimeConfig.ai,
            },
            persistence: {
              ...baseConfig.persistence,
              ...runtimeConfig.persistence,
            },
            elevenLabs: {
              ...(baseConfig.elevenLabs || {}),
              ...(runtimeConfig.elevenLabs || {}),
            },
            gateway: runtimeConfig.gateway || baseConfig.gateway,
            nitroChatModelSelection: runtimeConfig.gateway?.modelSelectionEnabled || false,
            nitroChatFixedModel:
              typeof runtimeConfig.nitroChatFixedModel === 'string'
                ? runtimeConfig.nitroChatFixedModel
                : '',
            focusMode: runtimeConfig.focusMode ?? baseConfig.focusMode,
            systemPrompt: runtimeConfig.systemPrompt ?? baseConfig.systemPrompt,
            standaloneMode: runtimeConfig.standaloneMode || baseConfig.standaloneMode,
          };

          setConfig(mergedConfig);
          setConfigLoaded(true);
          syncDocumentTitle(mergedConfig.branding?.name);

          // Set OAuth config if provided by server metadata
          if (runtimeConfig.mcp?.oauth) {
            setOAuthConfig({
              required: runtimeConfig.mcp.oauth.required,
              serverName: runtimeConfig.mcp.oauth.serverName,
              serverLogo: runtimeConfig.mcp.oauth.serverLogo,
              authorizationEndpoint: runtimeConfig.mcp.oauth.authorizationEndpoint,
              tokenEndpoint: runtimeConfig.mcp.oauth.tokenEndpoint,
              audience: runtimeConfig.mcp.oauth.audience,
            });
          }
          // Set Zitadel config when the server has ZITADEL_ENABLED=true.
          // Parallel to the OAuth branch above; never mutates it.
          if (runtimeConfig.mcp?.zitadel?.enabled) {
            setZitadelConfig({
              enabled: true,
              loginLabel: runtimeConfig.mcp.zitadel.loginLabel,
              authorizationEndpoint: runtimeConfig.mcp.zitadel.authorizationEndpoint,
              tokenEndpoint: runtimeConfig.mcp.zitadel.tokenEndpoint,
              userinfoEndpoint: runtimeConfig.mcp.zitadel.userinfoEndpoint,
              issuer: runtimeConfig.mcp.zitadel.issuer,
              clientId: runtimeConfig.mcp.zitadel.clientId,
              audience: runtimeConfig.mcp.zitadel.audience,
              idpHint: runtimeConfig.mcp.zitadel.idpHint,
            });
          } else {
            setZitadelConfig({ enabled: false });
          }
          // Apply theme based on theme_version_2 (light / dark / system_default)
          if (mergedConfig.theme_version_2) {
            const root = document.documentElement;
            const mode = mergedConfig.theme_version_2.mode || 'dark';
            setThemeMode(mode);

            // In system_default mode, respect a saved user preference (toggle) over OS.
            let configToApply = mergedConfig;
            if (mode === 'system_default') {
              const savedTheme = localStorage.getItem('nitrochat-user-theme') as
                | 'dark'
                | 'light'
                | null;
              if (savedTheme === 'light' || savedTheme === 'dark') {
                setUserTheme(savedTheme);
                configToApply = {
                  ...mergedConfig,
                  theme_version_2: { ...mergedConfig.theme_version_2, mode: savedTheme },
                };
              }
            }

            const { surface } = applyRuntimeThemeToRoot(root, configToApply);
            if (mode === 'system_default') setUserTheme(surface);

            // Tab icon: faviconDark = dark ink, faviconLight = white ink (matches sidebar/chatbot contrast).
            const favicon =
              resolveBrandingFaviconForSurface(mergedConfig.branding, surface) ||
              fallbackStandaloneChatbotLogo(surface);
            if (favicon) {
              let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
              if (!link) {
                link = document.createElement('link');
                link.rel = 'icon';
                document.getElementsByTagName('head')[0].appendChild(link);
              }
              link.href = favicon;
            }
          }

          // Load ElevenLabs API key from config if available (always sync from config)
          if (mergedConfig.elevenLabs?.apiKey) {
            setElevenLabsApiKey(mergedConfig.elevenLabs.apiKey);
          } else {
          }
        } else {
          console.error('[Client] Failed to fetch config, status:', response.status);
        }
      } catch (error) {
        console.error('[Client] Failed to load runtime config:', error);
        // Use base config as fallback
      } finally {
        setConfigLoaded(true);
      }
    };

    loadConfig();
  }, [elevenLabsApiKey, setElevenLabsApiKey]);

  // Load chats if persistence is enabled and user is authenticated
  const loadChats = async (page: number = 1, append: boolean = false) => {
    if (!config.persistence?.enabled || (!isAuthenticated() && !isZitadelAuthenticated())) return;
    if (loadingChats) return; // Prevent multiple simultaneous loads

    try {
      setLoadingChats(true);
      const response = await fetchChatPersistenceApi(`/api/chats?page=${page}&limit=${CHATS_PER_PAGE}`);
      if (response.ok) {
        const data = await response.json();
        if (append) {
          // Deduplicate when appending paginated results
          setChats(prev => {
            const existingIds = new Set(prev.map(c => c._id));
            const newChats = data.filter((c: any) => !existingIds.has(c._id));
            return [...prev, ...newChats];
          });
        } else {
          setChats(data);
        }
        setHasMoreChats(data.length === CHATS_PER_PAGE);
        setChatPage(page);
      }
    } catch (error) {
      console.error('Failed to load chats:', error);
    } finally {
      setLoadingChats(false);
    }
  };

  const loadMoreChats = () => {
    if (hasMoreChats && !loadingChats) {
      const nextPage = chatPage + 1;
      loadChats(nextPage, true);
    } else {
    }
  };

  useEffect(() => {
    if (configLoaded && config.persistence?.enabled && isAuthenticated() && oauthAccessToken) {
      setChatPage(1);
      loadChats(1, false);
    }
  }, [configLoaded, config, oauthAccessToken]);

  // Fetch available models from gateway when model selection is enabled
  useEffect(() => {
    if (!configLoaded || !config.nitroChatModelSelection) return;

    const fetchModels = async () => {
      setModelsLoading(true);
      try {
        const response = await fetch('/api/gateway/models');
        if (response.ok) {
          const data = await response.json();
          // Handle both array and object response formats
          const models = Array.isArray(data) ? data : (data.models || data.data || []);
          setAvailableModels(models.map((m: any) => ({
            id: m.id || m.model_id,
            name: m.name || m.id || m.model_id,
            provider: m.provider,
          })));
        } else {
          console.error('[Models] Failed to fetch models from gateway:', response.status);
        }
      } catch (error) {
        console.error('[Models] Error fetching models:', error);
      } finally {
        setModelsLoading(false);
      }
    };

    fetchModels();
  }, [configLoaded, config.nitroChatModelSelection]);

  // Sync current chat to DB
  const syncChat = useCallback(async (currentMessages: any[]) => {
    if (!config.persistence?.enabled || (!isAuthenticated() && !isZitadelAuthenticated())) return;

    const sanitizedMessages = currentMessages.map(msg => ({
      id: msg.id,
      role: msg.role,
      content: msg.content || '',
      timestamp: msg.timestamp,
      toolCalls: msg.toolCalls,
      toolCallId: msg.toolCallId,
      toolName: msg.toolName,
      result: msg.result,
    }));

    const doPut = async (id: string) => {
      const response = await fetchChatPersistenceApi(`/api/chats/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: sanitizedMessages })
      });
      if (response.ok) {
        const updated = await response.json();
        if (updated?.title) {
          setChats(prev => prev.map(c => c._id === id ? { ...c, title: updated.title } : c));
        }
      }
    };

    try {
      if (chatId) {
        await doPut(chatId);
        return;
      }

      // No chatId: create once; if create already in flight, run a PUT with latest messages after it
      if (createChatPromiseRef.current) {
        const latestMessages = useChatStore.getState().messages;
        const sanitized = latestMessages.map((msg: any) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content || '',
          timestamp: msg.timestamp,
          toolCalls: msg.toolCalls,
          toolCallId: msg.toolCallId,
          toolName: msg.toolName,
          result: msg.result,
        }));
        createChatPromiseRef.current.then((id) => {
          if (id)
            fetchChatPersistenceApi(`/api/chats/${id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ messages: sanitized }),
            }).then((r) => {
              if (r.ok) r.json().then((updated) => {
                if (updated?.title) setChats(prev => prev.map(c => c._id === id ? { ...c, title: updated.title } : c));
              });
            });
        });
        return;
      }

      const createPromise = (async (): Promise<string | null> => {
        try {
          const response = await fetchChatPersistenceApi('/api/chats', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messages: sanitizedMessages,
              provider: 'gateway',
            })
          });
          if (!response.ok) return null;
          const newChat = await response.json();
          setChatId(newChat._id);
          // Add to chat list immediately (with dedup) instead of full reload
          setChats(prev => {
            if (prev.some(c => c._id === newChat._id)) return prev;
            return [{ _id: newChat._id, title: newChat.title || 'New Chat' }, ...prev];
          });
          return newChat._id;
        } finally {
          createChatPromiseRef.current = null;
        }
      })();
      createChatPromiseRef.current = createPromise;
      await createPromise;
    } catch (error) {
      console.error('Failed to sync chat:', error);
      createChatPromiseRef.current = null;
    }
  }, [config.persistence?.enabled, oauthAccessToken, provider, chatId]);

  const handleSelectChat = async (id: string) => {
    if (!isAuthenticated() && !isZitadelAuthenticated()) return;

    try {
      setLoading(true);
      const response = await fetchChatPersistenceApi(`/api/chats/${id}`);

      if (response.ok) {
        const chat = await response.json();
        clearMessages();
        setChatId(chat._id);
        if (chat.messages) {
          // We need to set messages directly, but store only has addMessage
          // Ideally store should have setMessages. 
          // For now we clear and add one by one or we can add setMessages to store.
          // Looping might trigger multiple renders.
          // I'll add setMessages to store in a separate step if needed, 
          // but for now let's try to use importChat logic or just loop.
          // importChat takes a string.
          // Let's use importChat!
          const importData = JSON.stringify({ messages: chat.messages });
          useChatStore.getState().importChat(importData);
        }
        setSidebarOpen(false); // Close sidebar on mobile
      }
    } catch (error) {
      console.error('Failed to load chat:', error);
    } finally {
      setLoading(false);
    }
  };

  // Track if we've already attempted token exchange to prevent duplicates
  const tokenExchangeAttempted = useRef(false);
  /** Parallel guard for the Zitadel code→token exchange. */
  const zitadelTokenExchangeAttempted = useRef(false);

  // Initialize: Load MCP data and set default provider
  useEffect(() => {
    // Wait for config to be loaded before handling OAuth callback
    if (!configLoaded) return;

    // Handle OAuth callback parameters
    const urlParams = new URLSearchParams(window.location.search);
    const authCode = urlParams.get('auth_code');
    const authState = urlParams.get('auth_state');

    // Only proceed if we have callback params and haven't attempted exchange yet
    if (authCode && authState && !tokenExchangeAttempted.current) {
      tokenExchangeAttempted.current = true; // Mark as attempted immediately

      // Verify state
      const storedState = getState();
      if (storedState !== authState) {
        console.error('OAuth state mismatch');
      } else {
        const codeVerifier = getCodeVerifier();
        if (!codeVerifier) {
          console.error('Missing code verifier');
        } else {
          // Exchange code for tokens
          fetch('/api/auth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code: authCode,
              codeVerifier,
              tokenEndpoint: oauthTokenEndpoint,
            }),
          })
            .then(res => res.json())
            .then(async (data) => {
              if (data.accessToken) {
                saveTokens({
                  accessToken: data.accessToken,
                  refreshToken: data.refreshToken,
                  expiresAt: data.expiresAt,
                  tokenType: data.tokenType,
                });
                // Update store (tokenType is not part of setOAuthTokens)
                setOAuthTokens({
                  accessToken: data.accessToken,
                  refreshToken: data.refreshToken,
                  expiresAt: data.expiresAt,
                });

                // Reconnect MCP client with new token
                try {
                  await mcpClient.disconnect();
                  await mcpClient.connect({
                    serverUrl: config.mcp.serverUrl,
                    basePath: '/mcp',
                    headers: {
                      'Authorization': `Bearer ${data.accessToken}`
                    },
                  });
                } catch (error) {
                  console.error('❌ Failed to reconnect MCP client:', error);
                }

                // Clean URL
                window.history.replaceState({}, document.title, window.location.pathname);
              } else {
                console.error('Token exchange failed', data);
              }
            })
            .catch(err => console.error('Token exchange error', err));
        }
      }
    }
  }, [configLoaded, oauthTokenEndpoint, config]);

  /**
   * Resume a Zitadel auth flow that was interrupted by the session-reset step.
   *
   * When `handleZitadelLogin` detects a stale session risk it first routes
   * the browser through `end_session` (which resets the
   * `__Host-zitadel.useragent` cookie) before the real authorize request.
   * The authorize URL and pre-saved PKCE state are kept in sessionStorage
   * across that navigation; on the way back here we immediately redirect to
   * the stored authorize URL so the user never sees a "blank" page.
   */
  useEffect(() => {
    const pendingAuthorize = sessionStorage.getItem('zitadel_pending_authorize');
    if (pendingAuthorize) {
      sessionStorage.removeItem('zitadel_pending_authorize');
      window.location.href = pendingAuthorize;
    }
  }, []); // intentionally runs once, before config is loaded

  /**
   * Handle the Zitadel callback (`?zitadel_code=&zitadel_state=`).
   * Fully parallel to the OAuth effect above — separate guard ref,
   * separate token endpoint, separate storage bucket. Errors are
   * reported through `?zitadel_error=` which we just swallow here
   * after cleaning the URL; the UI will re-open the Zitadel gate.
   */
  useEffect(() => {
    if (!configLoaded) return;
    const urlParams = new URLSearchParams(window.location.search);
    const zCode = urlParams.get('zitadel_code');
    const zState = urlParams.get('zitadel_state');
    const zError = urlParams.get('zitadel_error');

    /**
     * Strip only the Zitadel round-trip params. The callback route preserves
     * the caller's original querystring (e.g. `standaloneMode=true&prompt=…`)
     * by encoding it into the OAuth state, so we must NOT do
     * `replaceState(…, location.pathname)` here — that would wipe the very
     * params we just rebuilt across the OIDC round-trip.
     */
    const stripZitadelParamsFromUrl = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete('zitadel_code');
      url.searchParams.delete('zitadel_state');
      url.searchParams.delete('zitadel_error');
      const search = url.searchParams.toString();
      window.history.replaceState(
        {},
        document.title,
        search ? `${url.pathname}?${search}` : url.pathname,
      );
    };

    if (zError) {
      console.error('[Zitadel] Callback error:', zError);
      setZitadelCompletingSignIn(false);
      setZitadelSignInError(zError);
      stripZitadelParamsFromUrl();
      return;
    }

    if (!zCode || !zState) {
      setZitadelCompletingSignIn(false);
      return;
    }
    if (zitadelTokenExchangeAttempted.current) return;
    if (!zitadelEnabled) return;

    const storedState = getZitadelState();
    if (storedState !== zState) {
      console.error('[Zitadel] State mismatch. Stored state:', storedState, 'URL state:', zState);
      setZitadelCompletingSignIn(false);
      setZitadelSignInError(
        'Sign-in session expired or was opened in another tab. Please try again.',
      );
      stripZitadelParamsFromUrl();
      return;
    }
    const codeVerifier = getZitadelCodeVerifier();
    if (!codeVerifier) {
      console.error('[Zitadel] Missing code verifier');
      setZitadelCompletingSignIn(false);
      setZitadelSignInError(
        'Sign-in session expired. Please try again.',
      );
      stripZitadelParamsFromUrl();
      return;
    }

    zitadelTokenExchangeAttempted.current = true;
    setZitadelCompletingSignIn(true);
    setZitadelSignInError(null);

    fetch('/api/auth/zitadel/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: zCode,
        codeVerifier,
      }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.accessToken) {
          saveZitadelTokens({
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            expiresAt: data.expiresAt,
            tokenType: data.tokenType || 'Bearer',
          });
          setZitadelTokens({
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            expiresAt: data.expiresAt,
          });
          setZitadelCompletingSignIn(false);
          setZitadelSignInError(null);
          stripZitadelParamsFromUrl();
          return;
        }

        zitadelTokenExchangeAttempted.current = false;
        setZitadelCompletingSignIn(false);
        let message =
          typeof data.error === 'string'
            ? data.error
            : 'Could not complete Zitadel sign-in.';
        if (data.code === 'ZITADEL_FORBIDDEN') {
          message =
            'Your account is not granted access to this NitroChat deployment. Ask an admin to invite you with instance access.';
        } else if (res.status === 503 && message.includes('not configured')) {
          message =
            'This NitroChat instance is missing its Zitadel client secret. Restart the instance from NitroCloud (or re-enable Zitadel SSO) and try again.';
        } else if (typeof data.details === 'string' && data.details.length > 0) {
          message = `${message} (${data.details})`;
        }
        setZitadelSignInError(message);
        console.error('[Zitadel] Token exchange failed', res.status, data);
        stripZitadelParamsFromUrl();
      })
      .catch((err) => {
        zitadelTokenExchangeAttempted.current = false;
        setZitadelCompletingSignIn(false);
        setZitadelSignInError(
          'Network error while completing sign-in. Please try again.',
        );
        console.error('[Zitadel] Token exchange error', err);
        stripZitadelParamsFromUrl();
      });
  }, [configLoaded, zitadelEnabled, setZitadelTokens]);


  // Initialize: Load MCP data and set default provider
  useEffect(() => {
    if (!configLoaded) return;
    if (initializationInProgress.current) return;

    const initialize = async () => {
      initializationInProgress.current = true;
      try {

        // Connect to MCP server

        // Only block if server URL is not configured (empty or undefined)
        // Allow localhost for local development
        if (!config.mcp.serverUrl) {
          console.error('❌ MCP Server URL not configured');
          setMcpConnected(false);
          toast.error(MCP_TOAST_NOT_CONFIGURED, { id: 'nitrochat-mcp-init' });
          initializationInProgress.current = false;
          return;
        }

        // Bearer priority for MCP connect:
        //   1. ?accessToken=…  (standaloneMode — unchanged, highest priority)
        //   2. Zitadel session  (new; parallel bucket)
        //   3. Existing OAuth session (unchanged)
        //   4. Static MCP API key (unchanged)
        const headers: Record<string, string> = {};
        const urlToken = searchParams.get('accessToken');
        const storeSnapshot = useChatStore.getState();
        const oauthFromStore = storeSnapshot.oauthAccessToken;
        const zitadelFromStore = storeSnapshot.zitadelAccessToken;
        if (urlToken?.trim()) {
          headers['Authorization'] = `Bearer ${urlToken.trim()}`;
        } else if (zitadelFromStore) {
          headers['Authorization'] = `Bearer ${zitadelFromStore}`;
        } else if (oauthFromStore) {
          headers['Authorization'] = `Bearer ${oauthFromStore}`;
        } else if (config.mcp.apiKey) {
          headers['Authorization'] = `Bearer ${config.mcp.apiKey}`;
        }

        await mcpClient.connect({
          serverUrl: config.mcp.serverUrl,
          basePath: '/mcp',
          headers: Object.keys(headers).length > 0 ? headers : undefined,
        });


        // Check MCP connection
        const connected = await mcpClient.ping();
        setMcpConnected(connected);

        if (!connected) {
          toast.error(MCP_TOAST_DISCONNECTED, { id: 'nitrochat-mcp-init' });
          return;
        }

        toast.dismiss('nitrochat-mcp-init');

        // Load tools
        if (config.features.showTools) {
          const toolsResponse = await mcpClient.listTools();
          if (toolsResponse.success && toolsResponse.data) {
            const toolsList = (toolsResponse.data as any).tools || [];
            setTools(toolsList);
          } else {
            console.error('❌ Failed to load tools. Full response:', toolsResponse);
          }
        }

        // Load prompts
        if (config.features.showPrompts) {

          // Don't re-fetch if prompts are already loaded
          if (prompts.length > 0) {
          } else {
            const promptsResponse = await mcpClient.listPrompts();
            if (promptsResponse.success && promptsResponse.data) {
              const promptsList = (promptsResponse.data as any).prompts || [];
              if (promptsList.length > 0) {
                setPrompts(promptsList);

                // Check for system/instruction prompts to auto-inject
                const systemPrompt = promptsList.find((p: any) =>
                  ['system', 'instruction', 'instructions', 'guide'].includes(p.name.toLowerCase())
                );

                if (systemPrompt) {
                  try {
                    const promptResult = await mcpClient.getPrompt(systemPrompt.name, {});

                    if (promptResult.success && promptResult.data) {
                      // Extract text content from prompt result
                      let instruction = '';
                      const messages = (promptResult.data as any).messages;
                      const description = (promptResult.data as any).description;

                      if (messages && messages.length > 0) {
                        const msg = messages[0];
                        instruction = msg.content.text || msg.content;
                      } else if (description) {
                        instruction = description;
                      }

                      if (instruction) {
                        setSystemInstruction(instruction);
                      }
                    }
                  } catch (err) {
                    console.error('Failed to fetch system prompt:', err);
                  }
                }
              } else {
              }
            } else {
              console.error('❌ Failed to load prompts:', promptsResponse.error);
            }
          }
        }

        // Load resources
        if (config.features.showResources) {
          const resourcesResponse = await mcpClient.listResources();
          if (resourcesResponse.success && resourcesResponse.data) {
            const resourcesList = (resourcesResponse.data as any).resources || [];
            setResources(resourcesList);
          } else {
            console.error('❌ Failed to load resources:', resourcesResponse.error);
          }
        }

      } catch (error) {
        console.error('❌ Initialization error:', error);
        setMcpConnected(false);
        toast.error(MCP_TOAST_DISCONNECTED, { id: 'nitrochat-mcp-init' });
      } finally {
        initializationInProgress.current = false;
        setMcpInitFinished(true);
      }
    };

    initialize();

    return () => {
      // Clean up connection if component unmounts
      // Note: singleton client might be shared, so we only disconnect if it's not needed
      // For now, we'll keep the singleton connected as it's the app-wide MCP client
    };
  }, [configLoaded, config, oauthAccessToken]);

  const checkAndRunInitialTool = async () => {
    const initialTool = tools.find(t => t._meta?.['tool/initial'] === true);
    if (!initialTool) return;

    initialToolExecuted.current = true;

    try {
      // Call the tool
      const response = await mcpClient.callTool(initialTool.name, {});
      let result: any;
      if (response.success && response.data) {
        // Unwrap MCP result format: { content: [{ type: "text", text: "..." }] }
        const mcpResult = response.data as any;
        if (mcpResult?.content && Array.isArray(mcpResult.content) && mcpResult.content.length > 0) {
          // Extract text from content array
          const firstContent = mcpResult.content[0];
          if (firstContent.type === 'text' && firstContent.text) {
            try {
              // Try to parse as JSON if it looks like JSON
              const text = firstContent.text;
              if ((text.trim().startsWith('{') && text.trim().endsWith('}')) ||
                (text.trim().startsWith('[') && text.trim().endsWith(']'))) {
                result = JSON.parse(text);
              } else {
                result = text;
              }
            } catch {
              result = firstContent.text;
            }
          } else {
            result = mcpResult.content;
          }
        } else {
          // Result is already unwrapped or in different format
          result = mcpResult;
        }
      } else {
        result = { error: response.error };
      }
      maybeShowSessionEndPopup(initialTool.name, response.success);


      // Add hidden user message to start conversation (required for API validity)
      const userMessage: ChatMessageType = {
        id: generateId(),
        role: 'user',
        content: `Start initial tool: ${initialTool.name}`,
        timestamp: Date.now(),
        hidden: true
      };
      addMessage(userMessage);

      // Add hidden assistant message with tool call
      const toolCallId = `call_${Date.now()}_init`;
      const assistantMessage: ChatMessageType = {
        id: generateId(),
        role: 'assistant',
        content: '', // Empty content
        timestamp: Date.now(),
        toolCalls: [{
          id: toolCallId,
          name: initialTool.name,
          arguments: {}
        }],
        hidden: true // Hide this message
      };
      addMessage(assistantMessage);

      // Add visible tool result message
      const toolResultMessage: ChatMessageType = {
        id: generateId(),
        role: 'tool',
        content: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        timestamp: Date.now(),
        toolCallId: toolCallId,
        toolName: initialTool.name,
        result: result,
      };
      addMessage(toolResultMessage);

      // Update assistant message with tool call result for widget rendering
      const updatedMessages = useChatStore.getState().messages;
      const lastAssistantMessage = updatedMessages[updatedMessages.length - 1];
      if (lastAssistantMessage && lastAssistantMessage.toolCalls) {
        // Attach result to toolCall
        const toolCallsWithResults = lastAssistantMessage.toolCalls.map((tc: any) => {
          if (tc.id === toolCallId) {
            return {
              ...tc,
              result: result,
            };
          }
          return tc;
        });
        // Update the message with result attached to toolCall
        useChatStore.getState().updateMessage(lastAssistantMessage.id, {
          toolCalls: toolCallsWithResults,
        });
      }

      // NOTE: We do NOT continue chat automatically here.
      // We just show the result (widget) as the starting state.

    } catch (error) {
      console.error('❌ Initial tool execution failed:', error);
    }
  };

  // Handle tool calls from widgets via postMessage
  useEffect(() => {
    const handleWidgetMessage = async (event: MessageEvent) => {
      // Check if this is a tool call request from a widget
      if (event.data.type === 'nitro:call_tool') {
        const { toolName, arguments: toolArgs } = event.data;

        try {
          const cache = toolExecutionCacheRef.current;
          let result: any;
          let toolSuccess: boolean;
          if (cache.has(toolName, toolArgs)) {
            result = cache.get(toolName, toolArgs);
            toolSuccess = !(
              result &&
              typeof result === 'object' &&
              'error' in result &&
              (result as { error?: unknown }).error
            );
          } else {
            const response = await mcpClient.callTool(toolName, toolArgs);
            if (response.success && response.data) {
              const mcpResult = response.data as any;
              if (mcpResult?.content && Array.isArray(mcpResult.content) && mcpResult.content.length > 0) {
                const firstContent = mcpResult.content[0];
                if (firstContent.type === 'text' && firstContent.text) {
                  try {
                    const text = firstContent.text;
                    if ((text.trim().startsWith('{') && text.trim().endsWith('}')) ||
                      (text.trim().startsWith('[') && text.trim().endsWith(']'))) {
                      result = JSON.parse(text);
                    } else {
                      result = text;
                    }
                  } catch {
                    result = firstContent.text;
                  }
                } else {
                  result = mcpResult.content;
                }
              } else {
                result = mcpResult;
              }
            } else {
              result = { error: response.error };
            }
            toolSuccess = response.success;
            cache.set(toolName, toolArgs, result);
          }
          maybeShowSessionEndPopup(toolName, toolSuccess);

          // Send result back to widget
          event.source?.postMessage({
            type: 'nitro:tool_result',
            toolName,
            result
          }, { targetOrigin: event.origin } as any);


          // Get current messages BEFORE adding new ones
          const currentMessages = useChatStore.getState().messages;

          // Add assistant message with tool call (to maintain proper conversation flow)
          const toolCallId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const assistantMessageWithToolCall = {
            id: generateId(),
            role: 'assistant' as const,
            content: '',
            timestamp: Date.now(),
            toolCalls: [{
              id: toolCallId,
              name: toolName,
              arguments: toolArgs
            }]
          };

          // Add tool result message to chat UI
          const toolResultMessage = {
            id: generateId(),
            role: 'tool' as const,
            content: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
            timestamp: Date.now(),
            toolCallId: toolCallId,
            toolName: toolName,
            result: result, // Result field for widget rendering
          };

          // Add both messages to the store
          addMessage(assistantMessageWithToolCall);
          addMessage(toolResultMessage);

          // Update assistant message with tool call result for widget rendering
          const updatedMessages = useChatStore.getState().messages;
          const lastAssistantMessage = updatedMessages[updatedMessages.length - 1];
          if (lastAssistantMessage && lastAssistantMessage.toolCalls) {
            // Attach result to toolCall
            const toolCallsWithResults = lastAssistantMessage.toolCalls.map((tc: any) => {
              if (tc.id === toolCallId) {
                return {
                  ...tc,
                  result: result,
                };
              }
              return tc;
            });
            // Update the message with result attached to toolCall
            useChatStore.getState().updateMessage(lastAssistantMessage.id, {
              toolCalls: toolCallsWithResults,
            });
          }

          // Create updated messages array for LLM continuation
          const messagesForContinuation = [...currentMessages, assistantMessageWithToolCall, toolResultMessage];

          // Continue the conversation with the tool result
          setLoading(true);
          await continueChatWithToolResults(messagesForContinuation);
          setLoading(false);

        } catch (error: any) {
          console.error('[NitroChat] Tool call failed:', error);
          event.source?.postMessage({
            type: 'nitro:tool_result',
            toolName,
            result: { error: error.message }
          }, { targetOrigin: event.origin } as any);

          // Add error message to chat
          addMessage({
            id: generateId(),
            role: 'tool' as const,
            content: `Error: ${error.message}`,
            timestamp: Date.now(),
            toolName: toolName,
          });
          setLoading(false);
        }
      }
    };

    window.addEventListener('message', handleWidgetMessage);
    return () => window.removeEventListener('message', handleWidgetMessage);
  }, [mcpClient]);

  // Send message
  const handleSendMessage = async (
    content: string,
    imageData?: { base64: string; mimeType: string },
    options?: { hidden?: boolean }
  ) => {
    if (!content.trim() && !imageData || isLoading) return;

    if (!mcpInitFinished) return;

    if (!mcpConnected) {
      toast.error(
        !config.mcp.serverUrl?.trim() ? MCP_TOAST_NOT_CONFIGURED : MCP_TOAST_DISCONNECTED
      );
      return;
    }

    // Context size limit: compare against what we actually send (trimmed window), not full localStorage history
    const maxTokens = config.chat?.contextMaxTokens;
    const maxRequestMessages = config.chat?.maxRequestMessages ?? 20;
    if (maxTokens != null && maxTokens > 0) {
      const draftForEstimate = {
        id: '__context_draft__',
        role: 'user' as const,
        content,
        timestamp: Date.now(),
        ...(options?.hidden ? { hidden: true as const } : {}),
      };
      const trimmedForEstimate = trimMessagesForModel(
        [...messages, draftForEstimate],
        maxRequestMessages,
      );
      const estimated = estimateContextTokens(trimmedForEstimate);
      if (estimated > maxTokens) {
        setContextLimitOpen(true);
        return;
      }
    }

    // Check OAuth token expiry and refresh if needed
    if (oauthRequired && oauthRefreshToken && oauthTokenEndpoint) {
      const tokens = {
        accessToken: oauthAccessToken || '',
        refreshToken: oauthRefreshToken,
        expiresAt: oauthExpiresAt || 0,
        tokenType: 'Bearer'
      };

      if (isTokenExpired(tokens)) {
        const newTokens = await refreshAccessToken(oauthRefreshToken, oauthTokenEndpoint);

        if (newTokens) {
          saveTokens(newTokens);
          setOAuthTokens({
            accessToken: newTokens.accessToken,
            refreshToken: newTokens.refreshToken,
            expiresAt: newTokens.expiresAt,
          });

          // Reconnect MCP client with new token
          await mcpClient.disconnect();
          await mcpClient.connect({
            serverUrl: config.mcp.serverUrl,
            basePath: '/mcp',
            headers: {
              'Authorization': `Bearer ${newTokens.accessToken}`
            }
          });
        } else {
          console.error('❌ Failed to refresh token, logging out...');
          addMessage({
            id: generateId(),
            role: 'assistant',
            content: 'Authentication session expired. Please reload the page to log in again.',
            timestamp: Date.now(),
          });
          return;
        }
      }
    }

    // Check Zitadel token expiry and refresh if needed
    if (zitadelEnabled && zitadelRefreshToken) {
      const zitadelTokensObj = {
        accessToken: zitadelAccessToken || '',
        refreshToken: zitadelRefreshToken,
        expiresAt: zitadelExpiresAt || 0,
        tokenType: 'Bearer'
      };

      if (isZitadelTokenExpired(zitadelTokensObj)) {
        const newZitadelTokens = await refreshZitadelAccessToken(zitadelRefreshToken);

        if (newZitadelTokens) {
          saveZitadelTokens(newZitadelTokens);
          setZitadelTokens({
            accessToken: newZitadelTokens.accessToken,
            refreshToken: newZitadelTokens.refreshToken,
            expiresAt: newZitadelTokens.expiresAt,
          });

          // Reconnect MCP client with new token
          await mcpClient.disconnect();
          await mcpClient.connect({
            serverUrl: config.mcp.serverUrl,
            basePath: '/mcp',
            headers: {
              'Authorization': `Bearer ${newZitadelTokens.accessToken}`
            }
          });
        } else {
          console.error('❌ Failed to refresh Zitadel token, logging out...');
          addMessage({
            id: generateId(),
            role: 'assistant',
            content: 'Zitadel authentication session expired. Please reload the page to log in again.',
            timestamp: Date.now(),
          });
          return;
        }
      }
    }

    setLoading(true);
    setLlmState('thinking');

    toolExecutionCacheRef.current.clear();

    const userMessage = {
      id: generateId(),
      role: 'user' as const,
      content,
      timestamp: Date.now(),
      imageData,
      hidden: options?.hidden,
    };
    addMessage(userMessage);

    const fixedModel = (config.nitroChatFixedModel || '').trim() || 'openrouter/auto';
    const modelToSend = config.nitroChatModelSelection ? selectedModel : fixedModel;

    if (config.features?.threadsEnabled && !options?.hidden) {
      persistThreadMessageFireAndForget({
        role: 'user',
        content: userMessage.content,
        messageId: userMessage.id,
        metadata: { role: 'user', model: modelToSend },
      });
    }
    setLoading(true);

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      const chatStartedAt = performance.now();

      // Send to chat API with MCP data (gateway-only; streaming preferred)
      const chatHeaders = await chatApiRequestHeaders();
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: chatHeaders,
        signal,
        body: JSON.stringify(
          buildChatApiRequestBody({
            messages: [...messages, userMessage],
            model: config.nitroChatModelSelection ? modelToSend : undefined,
            mcpTools: tools,
            mcpPrompts: prompts,
            mcpResources: resources,
            systemInstruction,
            systemPrompt: config.systemPrompt ?? undefined,
            stream: true,
            trim: { maxMessages: maxRequestMessages },
          })
        ),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 402) {
          setCreditsInfo({
            limit: errorData.error?.details?.creditsLimit || 0,
            used: errorData.error?.details?.creditsUsed || 0
          });
          setCreditsExhaustedOpen(true);
          throw new Error('Credits exhausted');
        }
        if (response.status === 401) {
          setInvalidKeyMessage(errorData.error?.message || 'Invalid API key provided');
          setInvalidKeyOpen(true);
          throw new Error('Authentication failure');
        }
        throw new Error('Chat request failed');
      }

      const contentType = response.headers.get('Content-Type') || '';
      const isStreaming = contentType.includes('text/event-stream') && response.body != null;

      let data: { message?: { role: string; content: string; toolCalls?: any[] }; toolCalls?: any[] };
      let streamAssistantId: string | null = null;
      let streamMeta: Awaited<ReturnType<typeof consumeChatStream>> | undefined;
      if (isStreaming) {
        // Consume SSE stream and update assistant message incrementally
        const assistantId = generateId();
        streamAssistantId = assistantId;
        addMessage({
          id: assistantId,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
        });
        streamMeta = await consumeChatStream(
          response,
          (content) => useChatStore.getState().updateMessage(assistantId, { content })
        );
        const { content: streamedContent, toolCalls: streamedToolCalls } = streamMeta;
        data = {
          message: { role: 'assistant' as const, content: streamedContent, toolCalls: streamedToolCalls },
          toolCalls: streamedToolCalls,
        };
        if (streamedToolCalls.length > 0) {
          useChatStore.getState().updateMessage(assistantId, { content: streamedContent, toolCalls: streamedToolCalls });
        }
      } else {
        data = await response.json();
      }

      const assistantAlreadyAdded = isStreaming;
      const latencyMs = Math.round(performance.now() - chatStartedAt);

      const processed = await processLlmToolCalls({
        label: 'handleSendMessage',
        data,
        client: mcpClient,
        generateId,
        addMessage,
        updateMessage: (id, patch) => useChatStore.getState().updateMessage(id, patch),
        streamAssistantId,
        assistantAlreadyAdded,
        findLastAssistantId: () => {
          const msgs = useChatStore.getState().messages;
          for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i]?.role === 'assistant') return msgs[i].id;
          }
          return null;
        },
        executionCache: toolExecutionCacheRef.current,
      });

      if (processed) {
        if (config.features?.threadsEnabled) {
          const assistantMsgId = streamAssistantId ?? generateId();
          persistAssistantThreadMessage({
            messageId: assistantMsgId,
            content: processed.assistantForContinuation.content ?? data.message?.content ?? '',
            model: modelToSend,
            latencyMs,
            streamMeta,
          });
          persistToolResultThreadMessages(processed.toolResultMessages);
        }
        for (const row of processed.toolResultMessages) {
          const success = !(
            row.result &&
            typeof row.result === 'object' &&
            'error' in (row.result as Record<string, unknown>) &&
            (row.result as { error?: unknown }).error
          );
          maybeShowSessionEndPopup(row.toolName, success);
        }
        await continueChatWithToolResults([
          ...messages,
          userMessage,
          processed.assistantForContinuation,
          ...processed.toolResultMessages,
        ]);
      } else {
        if (data.message && !assistantAlreadyAdded) {
          addMessage({
            id: generateId(),
            role: 'assistant',
            content: data.message.content,
            timestamp: Date.now(),
          });
        }
        if (config.features?.threadsEnabled && data.message?.content) {
          const assistantMsgId = streamAssistantId ?? generateId();
          persistAssistantThreadMessage({
            messageId: assistantMsgId,
            content: data.message.content,
            model: modelToSend,
            latencyMs,
            streamMeta,
          });
        }
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        // User clicked Stop; partial content already in message
        setLoading(false);
        setLlmState('idle');
        return;
      }
      console.error('Chat error:', error);
      // Don't show the error message in chat if credits are exhausted or key is invalid
      if (error.message !== 'Credits exhausted' &&
        error.message !== 'Credits exhausted during continuation' &&
        error.message !== 'Authentication failure') {
        addMessage({
          id: generateId(),
          role: 'assistant',
          content: `Error: ${error.message || 'Failed to get response'}`,
          timestamp: Date.now(),
        });
      }
    } finally {
      setLoading(false);
      setLlmState('idle');
      abortControllerRef.current = null;
      // Sync chat after message exchange
      // We need the updated messages state. 
      // Since state update is async, we should probably pass the new messages list to syncChat.
      // But we don't have it easily here without reconstructing it.
      // However, useChatStore.getState().messages should have the latest *after* this function finishes? 
      // No, closures.
      // I'll use a timeout or just fetch from store.
      setTimeout(() => {
        syncChat(useChatStore.getState().messages);
      }, 0);
    }
  };

  sendFromUrlPromptRef.current = (text: string) => {
    void handleSendMessage(text, undefined, { hidden: true });
  };

  // Continue conversation with tool results
  const continueChatWithToolResults = async (messagesHistory: any[], toolRound = 0) => {
    try {
      if (toolRound >= MAX_TOOL_ROUNDS) {
        setLoading(false);
        setLlmState('idle');
        return;
      }

      const fixedModelCont = (config.nitroChatFixedModel || '').trim() || 'openrouter/auto';
      const modelToSend = config.nitroChatModelSelection ? selectedModel : fixedModelCont;
      const continuationStartedAt = performance.now();

      abortControllerRef.current = new AbortController();
      const signalCont = abortControllerRef.current.signal;

      const chatHeaders = await chatApiRequestHeaders();
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: chatHeaders,
        signal: signalCont,
        body: JSON.stringify(
          buildChatApiRequestBody({
            messages: messagesHistory,
            model: config.nitroChatModelSelection ? modelToSend : undefined,
            mcpTools: tools,
            mcpPrompts: prompts,
            mcpResources: resources,
            systemInstruction,
            systemPrompt: config.systemPrompt ?? undefined,
            stream: true,
            trim: { maxMessages: config.chat?.maxRequestMessages ?? 20 },
          })
        ),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 402) {
          setCreditsInfo({
            limit: errorData.error?.details?.creditsLimit || 0,
            used: errorData.error?.details?.creditsUsed || 0
          });
          setCreditsExhaustedOpen(true);
          throw new Error('Credits exhausted during continuation');
        }
        if (response.status === 401) {
          setInvalidKeyMessage(errorData.error?.message || 'Invalid API key provided');
          setInvalidKeyOpen(true);
          throw new Error('Authentication failure');
        }
        throw new Error('Continuation request failed');
      }

      const contentTypeCont = response.headers.get('Content-Type') || '';
      const isStreamingCont = contentTypeCont.includes('text/event-stream') && response.body != null;
      let data: { message?: { role: string; content: string; toolCalls?: any[] }; toolCalls?: any[] };
      let continuationStreamAssistantId: string | null = null;
      let continuationStreamMeta: Awaited<ReturnType<typeof consumeChatStream>> | undefined;

      if (isStreamingCont) {
        const assistantId = generateId();
        continuationStreamAssistantId = assistantId;
        addMessage({ id: assistantId, role: 'assistant', content: '', timestamp: Date.now() });
        continuationStreamMeta = await consumeChatStream(
          response,
          (content) => useChatStore.getState().updateMessage(assistantId, { content })
        );
        const { content: streamedContent, toolCalls: streamedToolCalls } = continuationStreamMeta;
        data = {
          message: { role: 'assistant' as const, content: streamedContent, toolCalls: streamedToolCalls },
          toolCalls: streamedToolCalls,
        };
        if (streamedToolCalls.length > 0) {
          useChatStore.getState().updateMessage(assistantId, { content: streamedContent, toolCalls: streamedToolCalls });
        }
      } else {
        data = await response.json();
      }

      const assistantAlreadyAddedCont = isStreamingCont;
      const continuationLatencyMs = Math.round(performance.now() - continuationStartedAt);

      const processed = await processLlmToolCalls({
        label: 'continueChatWithToolResults',
        data,
        client: mcpClient,
        generateId,
        addMessage,
        updateMessage: (id, patch) => useChatStore.getState().updateMessage(id, patch),
        streamAssistantId: continuationStreamAssistantId,
        assistantAlreadyAdded: assistantAlreadyAddedCont,
        findLastAssistantId: () => {
          const msgs = useChatStore.getState().messages;
          for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i]?.role === 'assistant') return msgs[i].id;
          }
          return null;
        },
        executionCache: toolExecutionCacheRef.current,
      });

      if (processed) {
        if (config.features?.threadsEnabled) {
          const assistantMsgId = continuationStreamAssistantId ?? generateId();
          persistAssistantThreadMessage({
            messageId: assistantMsgId,
            content: processed.assistantForContinuation.content ?? data.message?.content ?? '',
            model: modelToSend,
            latencyMs: continuationLatencyMs,
            streamMeta: continuationStreamMeta,
          });
          persistToolResultThreadMessages(processed.toolResultMessages);
        }
        for (const row of processed.toolResultMessages) {
          const success = !(
            row.result &&
            typeof row.result === 'object' &&
            'error' in (row.result as Record<string, unknown>) &&
            (row.result as { error?: unknown }).error
          );
          maybeShowSessionEndPopup(row.toolName, success);
        }
        await continueChatWithToolResults(
          [...messagesHistory, processed.assistantForContinuation, ...processed.toolResultMessages],
          toolRound + 1,
        );
      } else {
        if (data.message && !isStreamingCont) {
          addMessage({
            id: generateId(),
            role: 'assistant',
            content: data.message.content,
            timestamp: Date.now(),
          });
        }
        if (config.features?.threadsEnabled && data.message?.content) {
          const assistantMsgId = continuationStreamAssistantId ?? generateId();
          persistAssistantThreadMessage({
            messageId: assistantMsgId,
            content: data.message.content,
            model: modelToSend,
            latencyMs: continuationLatencyMs,
            streamMeta: continuationStreamMeta,
          });
        }
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        setLoading(false);
        return;
      }
      console.error('Continuation error:', error);
      if (error.message !== 'Credits exhausted during continuation' && error.message !== 'Authentication failure') {
        addMessage({
          id: generateId(),
          role: 'assistant',
          content: `Error during continuation: ${error.message || 'Failed to get response'}`,
          timestamp: Date.now(),
        });
      }
    } finally {
      abortControllerRef.current = null;
      setLoading(false);
      // Sync after tool results
      setTimeout(() => {
        syncChat(useChatStore.getState().messages);
      }, 0);
    }
  };

  // Handle prompt click
  const handlePromptClick = async (prompt: any) => {
    // Explicitly ask AI to use list_prompts tool to show details about the specific prompt
    const message = `Use the list_prompts tool to show me details about the "${prompt.name}" prompt, including its description and arguments.`;
    await handleSendMessage(message);
  };

  // Handle export
  const handleExport = () => {
    const data = exportChat();
    const filename = `nitrochat-${Date.now()}.json`;
    downloadAsFile(data, filename);
  };

  // Handle clear
  const handleClear = () => {
    if (confirm('Clear all messages?')) {
      syncStandaloneUrlPromptScope();
      clearMessages();
    }
  };

  // Sidebar state
  // const [sidebarOpen, setSidebarOpen] = useState(false); // Moved to top

  // Handle new chat
  const handleNewChat = async () => {
    syncStandaloneUrlPromptScope();
    if (messages.length > 0) {
      // If persistence is enabled, we don't need to confirm clearing, 
      // as the old chat is saved (if we synced).
      // But if stateless, we should confirm.
      const shouldConfirm = !config.persistence?.enabled;

      if (!shouldConfirm || confirm('Start a new chat? Current conversation will be cleared.')) {
        clearMessages();
        setChatId(null);
        createChatPromiseRef.current = null;
      } else {
        return; // User cancelled
      }
    } else {
      setChatId(null);
      createChatPromiseRef.current = null;
    }

    // If persistence is enabled, immediately create a chat in DB with "New Chat" title
    // so the tab appears in the sidebar right away
    if (config.persistence?.enabled && (isAuthenticated() || isZitadelAuthenticated())) {
      try {
        const response = await fetchChatPersistenceApi('/api/chats', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ messages: [], provider: 'gateway' })
        });
        if (response.ok) {
          const newChat = await response.json();
          setChatId(newChat._id);
          // Add to sidebar immediately (with dedup)
          setChats(prev => {
            if (prev.some(c => c._id === newChat._id)) return prev;
            return [{ _id: newChat._id, title: newChat.title || 'New Chat' }, ...prev];
          });
        }
      } catch (error) {
        console.error('Failed to create new chat:', error);
      }
    }

    setSidebarOpen(false); // Close sidebar on mobile
  };

  // Handle delete chat
  const handleDeleteChat = async (targetChatId?: string) => {
    // In stateless mode, just clear messages (like refresh)
    if (!config.persistence?.enabled) {
      syncStandaloneUrlPromptScope();
      clearMessages();
      setChatId(null);
      return;
    }

    // Determine which chat to delete
    const deleteId = targetChatId || chatId;

    // In persistent mode with a chatId, delete from DB
    if (deleteId && (isAuthenticated() || isZitadelAuthenticated())) {
      try {
        const response = await fetchChatPersistenceApi(`/api/chats/${deleteId}`, {
          method: 'DELETE',
        });

        if (response.ok) {
          loadChats(); // Refresh chat list
          // Only clear current messages if we deleted the active chat
          if (deleteId === chatId) {
            syncStandaloneUrlPromptScope();
            clearMessages();
            setChatId(null);
          }
        } else {
          console.error('Failed to delete chat from DB');
          if (deleteId === chatId) {
            syncStandaloneUrlPromptScope();
            clearMessages();
            setChatId(null);
          }
        }
      } catch (error) {
        console.error('Failed to delete chat:', error);
        if (deleteId === chatId) {
          syncStandaloneUrlPromptScope();
          clearMessages();
          setChatId(null);
        }
      }
    } else {
      // No chatId, just clear current state
      syncStandaloneUrlPromptScope();
      clearMessages();
      setChatId(null);
    }
  };

  // Delete all chats for the current user (used from Settings)
  const handleDeleteAllChats = async () => {
    if (!config.persistence?.enabled || (!isAuthenticated() && !isZitadelAuthenticated())) return;
    const response = await fetchChatPersistenceApi('/api/chats', {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete all chats');
    clearAllUrlPromptConversations();
    loadChats();
  };

  // Handle logout
  const handleLogout = async () => {

    // Clear local storage
    clearTokens();
    clearCodeVerifier();
    clearState();
    logoutZitadel();

    // Clear store
    clearOAuthTokens();
    clearZitadelTokens();
    clearAllUrlPromptConversations();
    setChatId(null);

    // Disconnect MCP client
    await mcpClient.disconnect();


    // Reload page to reset state
    window.location.reload();
  };

  /**
   * Run the OIDC authorization redirect.
   */
  const executeZitadelLogin = useCallback(async (data: { authorizationUrl: string; codeVerifier: string; state: string }) => {
    saveZitadelCodeVerifier(data.codeVerifier);
    saveZitadelState(data.state);
    window.location.href = data.authorizationUrl;
  }, []);

  /**
   * Initiate the Zitadel login flow. Parallel to the existing
   * `handleLogin` used by `templateProps.onLoginOAuth` — does not
   * replace or invoke it.
   */
  const handleZitadelLogin = useCallback(async () => {
    if (!zitadelAuthorizationEndpoint) {
      console.error('[Zitadel] Authorization endpoint not configured');
      return;
    }
    setZitadelSignInError(null);
    try {
      // Forward the page's current querystring (e.g.
      // `?standaloneMode=true&prompt=…`) so the server can embed it in the
      // OAuth state and the callback can rebuild the same URL after Zitadel
      // returns the user. Without this, the user would land on bare `/` and
      // lose their standalone-mode params.
      const resp = await fetch('/api/auth/zitadel/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audience: zitadelAudience || undefined,
          returnQuery: window.location.search || '',
          idpHint: zitadelIdpHint || undefined,
        }),
      });
      const data = await resp.json();
      if (data.authorizationUrl && data.codeVerifier && data.state) {
        await executeZitadelLogin(data);
      } else {
        console.error('[Zitadel] Login initiation failed', data);
      }
    } catch (error) {
      console.error('[Zitadel] Login error:', error);
    }
  }, [zitadelAuthorizationEndpoint, zitadelAudience, zitadelIdpHint]);

  const handleDirectZitadelLogin = useCallback(async (username: string, password: string) => {
    setZitadelLoggingIn(true);
    setZitadelSignInError(null);
    try {
      const res = await fetch('/api/auth/zitadel/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (res.ok && data.accessToken) {
        saveZitadelTokens({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          expiresAt: data.expiresAt,
          tokenType: data.tokenType || 'Bearer',
        });
        setZitadelTokens({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          expiresAt: data.expiresAt,
        });

        // Reconnect MCP client with new token
        try {
          await mcpClient.disconnect();
          await mcpClient.connect({
            serverUrl: config.mcp.serverUrl,
            basePath: '/mcp',
            headers: {
              'Authorization': `Bearer ${data.accessToken}`
            },
          });
        } catch (error) {
          console.error('❌ Failed to reconnect MCP client:', error);
        }
      } else {
        let message =
          typeof data.error === 'string'
            ? data.error
            : 'Could not complete Zitadel sign-in.';
        if (data.code === 'ZITADEL_FORBIDDEN') {
          message =
            'Your account is not granted access to this NitroChat deployment. Ask an admin to invite you with instance access.';
        } else if (res.status === 503 && message.includes('not configured')) {
          message =
            'This NitroChat instance is missing its Zitadel client secret. Restart the instance from NitroCloud (or re-enable Zitadel SSO) and try again.';
        } else if (typeof data.details === 'string' && data.details.length > 0) {
          message = `${message} (${data.details})`;
        }
        setZitadelSignInError(message);
      }
    } catch (err) {
      setZitadelSignInError('Network error while completing sign-in. Please try again.');
      console.error('[Zitadel] Token exchange error', err);
    } finally {
      setZitadelLoggingIn(false);
    }
  }, [config, mcpClient, setZitadelTokens]);

  const handleSocialZitadelLogin = useCallback(async (provider: 'google' | 'github') => {
    if (!zitadelAuthorizationEndpoint) {
      console.error('[Zitadel] Authorization endpoint not configured');
      return;
    }
    setZitadelSignInError(null);
    try {
      const resp = await fetch('/api/auth/zitadel/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audience: zitadelAudience || undefined,
          returnQuery: window.location.search || '',
          idpHint: provider,
        }),
      });
      const data = await resp.json();
      if (data.authorizationUrl && data.codeVerifier && data.state) {
        await executeZitadelLogin(data);
      } else {
        console.error('[Zitadel] Social login initiation failed', data);
      }
    } catch (error) {
      console.error('[Zitadel] Social login error:', error);
    }
  }, [zitadelAuthorizationEndpoint, zitadelAudience, executeZitadelLogin]);

  /**
   * Clear the Zitadel session only. The existing OAuth
   * `handleLogout` is intentionally left untouched.
   */
  const handleZitadelLogout = useCallback(async () => {
    logoutZitadel();
    clearZitadelTokens();
    clearMessages();
    setChatId(null);
    await mcpClient.disconnect();
    window.location.reload();
  }, [clearMessages, clearZitadelTokens, mcpClient, setChatId]);

  // Show loading screen while config is loading (neutral ring: default `primary` is brand yellow
  // until `/api/config` merges runtime theme — avoid a mismatched color flash vs deployed branding).
  if (!configLoaded) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="h-16 w-16 rounded-full border-4 border-border" />
            <div className="absolute left-0 top-0 h-16 w-16 rounded-full border-4 border-muted-foreground/40 border-t-transparent animate-spin" />
          </div>
          <p className="text-muted text-sm opacity-50">Loading {config.branding?.name || 'NitroChat'}...</p>
        </div>
      </div>
    );
  }

  // If OAuth is required and user not authenticated, show login modal (skip when ?accessToken= is present — applied in useLayoutEffect)
  if (oauthRequired && !isAuthenticated() && !accessTokenInUrl) {
    return (
      <OAuthLoginModal
        isOpen={true}
        onClose={() => { }}
        serverName={oauthServerName || 'OAuth Provider'}
        serverLogo={oauthServerLogo || undefined}
        onLogin={async () => {
          if (!oauthAuthorizationEndpoint) {
            console.error('OAuth authorization endpoint not configured');
            return;
          }
          try {
            const resp = await fetch('/api/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                authorizationEndpoint: oauthAuthorizationEndpoint,
                audience: oauthAudience
              }),
            });
            const data = await resp.json();
            if (data.authorizationUrl && data.codeVerifier && data.state) {
              saveCodeVerifier(data.codeVerifier);
              saveState(data.state);
              window.location.href = data.authorizationUrl;
            } else {
              console.error('Login initiation failed', data);
            }
          } catch (e) {
            console.error('OAuth login error', e);
          }
        }}
        isLoading={false}
      />
    );
  }

  /**
   * Zitadel gate — mirrors the OAuth gate above, only fires when
   * Zitadel is enabled, no Zitadel session exists, AND the existing
   * OAuth gate hasn't already handled this user. The guard on
   * `!oauthRequired || isAuthenticated()` keeps the two gates from
   * ever contending with each other.
   */
  if (
    zitadelEnabled &&
    !isZitadelAuthenticated() &&
    (!oauthRequired || isAuthenticated())
  ) {
    return (
      <ZitadelLoginModal
        isOpen={true}
        onClose={() => { }}
        loginLabel={zitadelLoginLabel || 'Sign in with Zitadel'}
        onLogin={handleZitadelLogin}
        onPasswordLogin={handleDirectZitadelLogin}
        onSocialLogin={handleSocialZitadelLogin}
        isLoading={zitadelLoggingIn}
        completingSignIn={zitadelCompletingSignIn}
        errorMessage={zitadelSignInError}
      />
    );
  }


  // Theme toggle function — only enabled in `system_default` mode.
  const toggleTheme = () => {
    if (themeMode !== 'system_default') return;

    const newTheme: 'dark' | 'light' = userTheme === 'dark' ? 'light' : 'dark';
    setUserTheme(newTheme);
    localStorage.setItem('nitrochat-user-theme', newTheme);

    // Apply theme by re-running applyRuntimeThemeToRoot with the toggled surface.
    const root = document.documentElement;
    const configToApply = config?.theme_version_2
      ? { ...config, theme_version_2: { ...config.theme_version_2, mode: newTheme } }
      : config;
    const { surface } = applyRuntimeThemeToRoot(root, configToApply);

    const favicon =
      resolveBrandingFaviconForSurface(config?.branding, surface) ||
      fallbackStandaloneChatbotLogo(surface);

    if (favicon) {
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.getElementsByTagName('head')[0].appendChild(link);
      }
      link.href = favicon;
    }
  };

  // Force sidebar template
  const template = 'sidebar';

  const elevenLabsEnabled = !!(config.elevenLabs?.apiKey ?? elevenLabsApiKey);
  const showSettings =
    (isAuthenticated() && !!config.persistence?.enabled) ||
    elevenLabsEnabled;
  // Match main: standalone UI only when the query flag is exactly "true"
  const standaloneMode = searchParams.get('standaloneMode') === 'true';
  const urlAccessToken = searchParams.get('accessToken');
  const suppressStandaloneWelcome =
    standaloneMode && Boolean(searchParams.get('prompt')?.trim());

  const templateProps = {
    config,
    messages: filterVisibleMessages(messages, tools),
    isLoading,
    settingsOpen,
    prompts,
    tools,
    resources,
    /**
     * Single logout entry-point shared by all templates.
     * - OAuth-authed only → existing `handleLogout` (unchanged).
     * - Zitadel-authed only → `handleZitadelLogout`.
     * - Both authed       → call both, then reload.
     * - Neither           → undefined (no logout button).
     */
    onLogout: (() => {
      const hasOauth = oauthRequired && isAuthenticated();
      const hasZitadel = zitadelEnabled && isZitadelAuthenticated();
      if (hasOauth && hasZitadel) {
        return async () => {
          logoutZitadel();
          clearZitadelTokens();
          await handleLogout();
        };
      }
      if (hasOauth) return handleLogout;
      if (hasZitadel) return handleZitadelLogout;
      return undefined;
    })(),
    onDeleteChat: handleDeleteChat,
    onSendMessage: handleSendMessage,
    onStopGeneration: () => abortControllerRef.current?.abort(),
    onPromptClick: handlePromptClick,
    onNewChat: handleNewChat,
    onOpenSettings: () => setSettingsOpen(true),
    onCloseSettings: () => setSettingsOpen(false),
    chats,
    onSelectChat: handleSelectChat,
    currentChatId: chatId,
    chatPage,
    hasMoreChats,
    loadingChats,
    onLoadMore: loadMoreChats,
    // Settings modal: show only when at least one section applies
    showSettings,
    onExportChat: handleExport,
    onDeleteAllChats: config.persistence?.enabled && isAuthenticated() ? handleDeleteAllChats : undefined,
    settingsIsAuthenticated: isAuthenticated(),
    termsOfServiceUrl: config.termsOfServiceUrl,
    privacyPolicyUrl: config.privacyPolicyUrl,
    elevenLabsEnabled,
    // Voice chat props
    transcribedText,
    onTranscribedTextClear: () => setTranscribedText(null),
    // Theme props
    themeMode,
    currentTheme: themeMode === 'system_default' ? userTheme : themeMode,
    onToggleTheme: toggleTheme,
    // Model selection props (gateway integration)
    /** UI + model list: only when server env NITROCHAT_MODEL_SELECTION=true (see /api/config). */
    modelSelectionEnabled: !!config.nitroChatModelSelection,
    selectedModel,
    availableModels,
    modelsLoading,
    onModelChange: setSelectedModel,
    standaloneMode,
    suppressStandaloneWelcome,
    sessionCompleted: standaloneMode && sessionCompleted,
    isBootstrapping,
    bootstrapError,
    onRetryBootstrap: handleRetryBootstrap,
    // Pass OAuth props to templates if needed
    oauthRequired,
    oauthServerName,
    oauthServerLogo,
    onLoginOAuth: async () => {
      if (!oauthAuthorizationEndpoint) {
        console.error('OAuth authorization endpoint not configured');
        return;
      }
      try {
        const resp = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            authorizationEndpoint: oauthAuthorizationEndpoint,
            audience: oauthAudience
          }),
        });
        const data = await resp.json();
        if (data.authorizationUrl && data.codeVerifier && data.state) {
          saveCodeVerifier(data.codeVerifier);
          saveState(data.state);
          window.location.href = data.authorizationUrl;
        } else {
          console.error('Login initiation failed', data);
        }
      } catch (e) {
        console.error('OAuth login error', e);
      }
    },
    /**
     * Additive template hooks. Templates that are not yet aware of
     * them ignore the extra keys — safe across the existing sidebar,
     * centered, split-view and compact templates.
     */
    zitadelEnabled,
    zitadelAuthenticated: zitadelEnabled ? isZitadelAuthenticated() : false,
    zitadelLoginLabel: zitadelLoginLabel || undefined,
    onLoginZitadel: handleZitadelLogin,
    onLogoutZitadel: zitadelEnabled && isZitadelAuthenticated() ? handleZitadelLogout : undefined,
  };

  // Language presets for greeting
  const LANG_PRESETS: Record<string, { greeting: string }> = {
    'en': { greeting: 'Hi! How can I help you today?' },
    'hi': { greeting: 'नमस्ते! मैं आज आपकी कैसे मदद कर सकता हूं?' },
    'es': { greeting: '¡Hola! ¿Cómo puedo ayudarte hoy?' },
    'fr': { greeting: 'Bonjour! Comment puis-je vous aider aujourd\'hui?' },
    'de': { greeting: 'Hallo! Wie kann ich Ihnen heute helfen?' },
    'ja': { greeting: 'こんにちは！今日はどのようにお手伝いできますか？' },
    'zh': { greeting: '你好！我今天能帮你什么？' },
  };

  // Render component with OAuth modal when needed
  return (
    <>
      <SidebarTemplate {...templateProps} />
      <ConfirmModal
        singleAction
        isOpen={contextLimitOpen}
        onClose={() => setContextLimitOpen(false)}
        onConfirm={() => {}}
        title="Context token budget reached"
        message="This chat exceeds the configured token budget (using a rough size estimate from message length, not word count). You cannot send more in this thread until the conversation is shorter."
        confirmText="OK"
        variant="warning"
      />
      <CreditsExhaustedModal
        isOpen={creditsExhaustedOpen}
        onClose={() => setCreditsExhaustedOpen(false)}
        creditsLimit={creditsInfo.limit}
        creditsUsed={creditsInfo.used}
      />
      <InvalidKeyModal
        isOpen={invalidKeyOpen}
        onClose={() => setInvalidKeyOpen(false)}
        message={invalidKeyMessage}
      />
      {oauthRequired && !isAuthenticated() && !accessTokenInUrl && (
        <OAuthLoginModal
          isOpen={true}
          onClose={() => { }}
          serverName={oauthServerName || 'OAuth Provider'}
          serverLogo={oauthServerLogo || undefined}
          onLogin={templateProps.onLoginOAuth}
          isLoading={false}
        />
      )}
      {zitadelEnabled && !isZitadelAuthenticated() && (!oauthRequired || isAuthenticated()) && (
        <ZitadelLoginModal
          isOpen={true}
          onClose={() => { }}
          loginLabel={zitadelLoginLabel || 'Sign in with Zitadel'}
          onLogin={handleZitadelLogin}
          onPasswordLogin={handleDirectZitadelLogin}
          onSocialLogin={handleSocialZitadelLogin}
          isLoading={zitadelLoggingIn}
          completingSignIn={zitadelCompletingSignIn}
          errorMessage={zitadelSignInError}
        />
      )}
      {/* Voice Orb Overlay */}
      {elevenLabsApiKey && (
        <VoiceOrbOverlay
          isOpen={voiceOverlayOpen}
          onClose={() => {
            setVoiceOverlayOpen(false);
            setVoiceModeEnabled(false);
            setSpokenText('');
            // Stop any playing audio
            if (audioRef.current) {
              audioRef.current.pause();
              audioRef.current = null;
            }
            setLlmState('idle');
            // Reset greeting flag so greeting plays on next open
            hasSpokenGreeting.current = false;
          }}
          onSendMessage={(text) => {
            setLlmState('thinking');
            handleSendMessage(text);
          }}
          onGreet={() => {
            // Only greet once per session to prevent overlap
            if (hasSpokenGreeting.current) {
              setLlmState('listening');
              return;
            }
            hasSpokenGreeting.current = true;
            // Use localized greeting based on output language
            const preset = LANG_PRESETS[outputLanguage] || LANG_PRESETS['en'];
            const greeting = preset.greeting;
            // Set speaking state IMMEDIATELY to prevent speech recognition from capturing greeting audio
            setLlmState('speaking');
            setSpokenText(greeting);
            setVoiceModeEnabled(true);
            // Play greeting regardless of mute status (welcome message should always play)
            playTextToSpeech(greeting, true); // bypassMute = true for greeting
          }}
          elevenLabsApiKey={elevenLabsApiKey || ''}
          llmState={llmState}
          spokenText={spokenText}
          displayMode={voiceDisplayMode}
          onDisplayModeChange={(mode) => {
            setVoiceDisplayMode(mode);
            if (mode === 'voice-chat') {
              setVoiceOverlayOpen(false);
            }
          }}
          onSettingsClick={() => setSettingsOpen(true)}
          inputLanguage={inputLanguage || 'en-US'}
          voiceModeActive={voiceModeEnabled}
          onInterrupt={() => {
            // Talk-to-interrupt: stop TTS and switch to listening
            if (audioRef.current) {
              audioRef.current.pause();
              audioRef.current = null;
            }
            setSpokenText('');
            setLlmState('listening');
          }}
          onLlmStateChange={setLlmState}
          currentTheme={themeMode === 'system_default' ? userTheme : themeMode}
        />
      )}
      {/* Voice Chat Popup - for voice-chat mode */}
      {elevenLabsApiKey && voiceModeType === 'voice-chat' && (
        <VoiceChatPopup
          isOpen={voiceChatPopupOpen}
          onClose={() => {
            setVoiceChatPopupOpen(false);
            setVoiceModeEnabled(false);
            setLlmState('idle');
            // Reset greeting flag so greeting plays on next open
            hasSpokenGreeting.current = false;
          }}
          isSpeaking={llmState === 'speaking'} // Pass speaking state to stop listening during TTS
          onGreet={() => {
            // Only greet once per session to prevent overlap
            if (hasSpokenGreeting.current) {
              setLlmState('listening');
              return;
            }
            hasSpokenGreeting.current = true;
            // Use localized greeting based on output language
            const preset = LANG_PRESETS[outputLanguage] || LANG_PRESETS['en'];
            const greeting = preset.greeting;
            // Set speaking state IMMEDIATELY to prevent speech recognition from capturing greeting audio
            setLlmState('speaking');
            setSpokenText(greeting);
            setVoiceModeEnabled(true);
            // Play greeting regardless of mute status (welcome message should always play)
            playTextToSpeech(greeting, true); // bypassMute = true for greeting
          }}
          onTranscript={(text) => {
            // Only set if we have actual text and it's different from current
            if (text && text.trim()) {
              setTranscribedText(text.trim());
              // Clear after ChatInput picks it up (use longer delay to ensure it's processed)
              setTimeout(() => {
                setTranscribedText(null);
              }, 500);
            }
          }}
          inputLanguage={inputLanguage || 'en-US'}
        />
      )}
    </>
  );
}
