'use client';

import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { X, Minimize2, Plus, MessageCircle, Clock, Trash2 } from 'lucide-react';
import { ChatMessage as ChatMessageComponent } from '@/components/ChatMessage';
import { ChatInputEmbed } from '@/components/ChatInputEmbed';
import { AuthModal } from '@/components/AuthModal';
import { EmbedChatFooter } from '@/components/EmbedChatFooter';
import { EmbedStandaloneHeader } from '@/components/EmbedStandaloneHeader';
import { StandaloneChatbotAvatar } from '@/components/StandaloneChatbotAvatar';
import { EmbedSidebar } from '@/components/EmbedSidebar';
import { useChatStore, ChatMessage, urlPromptScopeKeyFromRaw } from '@/lib/store';
import { consumeChatStream } from '@/lib/chat-stream-sse';
import { getConfig } from '@/nitrochat.config';
import { buildChatApiRequestBody } from '@/lib/chat-api-payload';
import { MAX_TOOL_ROUNDS, ToolExecutionCache } from '@/lib/tool-call-chain';
import { processLlmToolCalls } from '@/lib/process-llm-tool-round';
import { filterVisibleMessages, decodeUrlPromptParam } from '@/lib/utils';
import {
    applyRuntimeThemeToRoot,
    fallbackStandaloneChatbotLogo,
    firstNonEmptyString,
    getCustomLogoUrlForSurface,
    getRuntimeThemeSurface,
    resolveBrandColor,
    resolveStandaloneChatbotLogo,
    withMergedRuntimeTheme,
    type ThemeSurface,
} from '@/lib/theme-runtime';
import { getMcpClient } from '@/lib/mcp-client';
import { toast } from 'sonner';
import { MCP_TOAST_DISCONNECTED, MCP_TOAST_STILL_CONNECTING } from '@/lib/mcp-user-feedback';
import {
    generateCodeVerifier,
    generateCodeChallenge,
    generateState,
    saveCodeVerifier,
    saveState,
    getTokens,
    saveTokens,
    isTokenExpired,
    refreshAccessToken,
    parseJwtExpiryMs,
    type OAuthTokens,
} from '@/lib/oauth';
import { chatApiRequestHeaders } from '@/lib/chat-api-headers';

// Generate unique IDs to avoid hydration mismatches
let idCounter = 0;
const generateId = () => `msg-${Date.now()}-${++idCounter}`;

interface EmbedContentProps {
    className?: string;
}

export function EmbedContent({ className }: EmbedContentProps) {
    const themeRootRef = useRef<HTMLDivElement>(null);
    const [config, setConfig] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [tools, setTools] = useState<any[]>([]);
    const [prompts, setPrompts] = useState<any[]>([]);
    const [systemInstruction, setSystemInstruction] = useState<string>('');
    const [mcpConnected, setMcpConnected] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
    const [mounted, setMounted] = useState(false);

    // OAuth state
    const [oauthRequired, setOauthRequired] = useState(false);
    const [oauthTokens, setOauthTokens] = useState<OAuthTokens | null>(null);
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [pendingMessage, setPendingMessage] = useState<{ content: string; imageData?: any } | null>(null);
    const initialToolExecuted = useRef(false);
    const urlPromptExecuted = useRef(false);
    /** Per-user-turn cache of MCP results so duplicate (tool, args) calls hit the network once. */
    const toolExecutionCacheRef = useRef<ToolExecutionCache>(new ToolExecutionCache());
    const lastPromptQueryRef = useRef<string | null>(null);
    const sendFromUrlPromptEmbedRef = useRef<(text: string) => void>(() => {});
    /** Last `?accessToken=` value applied (re-apply when parent sends a new token on same URL). */
    const lastAppliedAccessTokenFromUrl = useRef<string | null>(null);
    const searchParams = useSearchParams();
    const promptQuery = searchParams.get('prompt');
    const discardHistoryParam = searchParams.get('retainHistory') === 'false';

    useLayoutEffect(() => {
        const scope = urlPromptScopeKeyFromRaw(promptQuery);
        useChatStore.getState().setActiveUrlPromptScope(scope);
        if (discardHistoryParam && promptQuery?.trim()) {
            useChatStore.getState().clearMessages();
        }
    }, [promptQuery, discardHistoryParam]);

    useEffect(() => {
        return useChatStore.persist.onFinishHydration(() => {
            if (typeof window === 'undefined') return;
            const params = new URLSearchParams(window.location.search);
            const rawPrompt = params.get('prompt');
            useChatStore.getState().setActiveUrlPromptScope(urlPromptScopeKeyFromRaw(rawPrompt));
            if (params.get('retainHistory') === 'false' && rawPrompt?.trim()) {
                useChatStore.getState().clearMessages();
            }
        });
    }, []);

    // Persistence state
    const [persistenceEnabled, setPersistenceEnabled] = useState(false);
    const [chatId, setChatId] = useState<string | null>(null);
    const [chats, setChats] = useState<any[]>([]);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [loadingChats, setLoadingChats] = useState(false);
    const [chatPage, setChatPage] = useState(1);
    const [hasMoreChats, setHasMoreChats] = useState(true);
    const CHATS_PER_PAGE = 20;

    const { messages, addMessage, clearMessages, setMessages } = useChatStore();
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Prevent SSR hydration issues
    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        const current = searchParams.get('prompt') ?? '';
        if (lastPromptQueryRef.current !== current) {
            lastPromptQueryRef.current = current;
            urlPromptExecuted.current = false;
        }
    }, [searchParams]);

    // Fetch config
    useEffect(() => {
        fetch('/api/config')
            .then(res => res.json())
            .then((data) => {
                setConfig(withMergedRuntimeTheme(getConfig(), data));
                // Check if persistence is enabled
                if (data.persistence?.enabled) {
                    setPersistenceEnabled(true);
                }
                // Check if OAuth is required
                if (data.mcp?.oauth?.required) {
                    setOauthRequired(true);
                }
            })
            .catch(err => console.error('Failed to load config:', err));
    }, []);

    // Check for existing OAuth tokens (shared with main app)
    useEffect(() => {
        if (!config) return;

        // Check if tokens exist in localStorage (from main app or previous embed session)
        const existingTokens = getTokens();
        if (existingTokens) {
            setOauthTokens(existingTokens);
        }
    }, [config, oauthRequired]);

    // ?accessToken=… deep link — useLayoutEffect so localStorage/oauth state is ready before paint (pairs with oauthRequired gates).
    useLayoutEffect(() => {
        if (typeof window === 'undefined' || !mounted) return;
        const raw = searchParams.get('accessToken');
        if (!raw?.trim()) return;
        const accessToken = raw.trim();
        if (lastAppliedAccessTokenFromUrl.current === accessToken) return;
        lastAppliedAccessTokenFromUrl.current = accessToken;
        const expiresAt = parseJwtExpiryMs(accessToken) ?? Date.now() + 3_600_000;
        const tok: OAuthTokens = { accessToken, expiresAt, tokenType: 'Bearer' };
        saveTokens(tok);
        setOauthTokens(tok);
    }, [mounted, searchParams]);

    // Load chats if persistence is enabled and user is authenticated
    // Only trigger when oauthTokens actually change (not just persistenceEnabled)
    useEffect(() => {
        if (persistenceEnabled && oauthTokens?.accessToken) {
            loadChats();
        }
    }, [oauthTokens?.accessToken]); // Only depend on accessToken, not persistenceEnabled
    // Initialize MCP client and fetch tools with retry logic
    useEffect(() => {
        if (!config) return;

        const MAX_RETRIES = 5;
        const RETRY_DELAY_MS = 2000; // Start with 2 seconds
        let retryCount = 0;
        let retryTimeout: NodeJS.Timeout;

        const initialize = async () => {
            try {
                setConnectionStatus('connecting');
                setMcpConnected(false);

                // Use singleton MCP client for widget compatibility
                const client = getMcpClient();

                // Build headers with OAuth token or API key
                const headers: any = {};
                if (oauthTokens?.accessToken) {
                    headers['Authorization'] = `Bearer ${oauthTokens.accessToken}`;
                } else if (config.mcp.apiKey) {
                    headers['Authorization'] = `Bearer ${config.mcp.apiKey}`;
                }


                await client.connect({
                    serverUrl: config.mcp.serverUrl,
                    basePath: '/mcp',
                    headers: Object.keys(headers).length > 0 ? headers : undefined,
                });

                // Check connection
                const connected = await client.ping();

                if (!connected) {
                    throw new Error('MCP server ping failed');
                }

                // Connection successful
                setMcpConnected(true);
                setConnectionStatus('connected');
                toast.dismiss('nitrochat-mcp-embed');
                toast.dismiss('nitrochat-mcp-embed-connecting');
                retryCount = 0; // Reset retry count on success

                // Load tools
                const toolsResponse = await client.listTools();
                if (toolsResponse.success && toolsResponse.data) {
                    const toolsList = (toolsResponse.data as any).tools || [];
                    setTools(toolsList);
                    // Store tools in chat store for widget rendering
                    useChatStore.setState({ tools: toolsList });
                }


                // Load prompts
                const promptsResponse = await client.listPrompts();
                if (promptsResponse.success && promptsResponse.data) {
                    const promptsList = (promptsResponse.data as any).prompts || [];
                    setPrompts(promptsList);

                    // Check for system/instruction prompts to auto-inject
                    const systemPrompt = promptsList.find((p: any) =>
                        ['system', 'instruction', 'instructions', 'guide'].includes(p.name.toLowerCase())
                    );

                    if (systemPrompt) {
                        try {
                            const promptResult = await client.getPrompt(systemPrompt.name, {});

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
                    console.error('❌ Failed to load prompts:', promptsResponse.error);
                }
            } catch (error) {
                console.error(`❌ MCP connection failed (attempt ${retryCount + 1}/${MAX_RETRIES}):`, error);
                setMcpConnected(false);

                // Retry with exponential backoff
                if (retryCount < MAX_RETRIES) {
                    retryCount++;
                    const delay = RETRY_DELAY_MS * Math.pow(2, retryCount - 1); // Exponential backoff
                    setConnectionStatus('connecting');

                    retryTimeout = setTimeout(() => {
                        initialize();
                    }, delay);
                } else {
                    console.error('❌ Max retry attempts reached. MCP server connection failed.');
                    setMcpConnected(false);
                    setConnectionStatus('disconnected');
                    toast.error(MCP_TOAST_DISCONNECTED, { id: 'nitrochat-mcp-embed' });
                }
            }
        };

        initialize();

        // Cleanup
        return () => {
            if (retryTimeout) {
                clearTimeout(retryTimeout);
            }
        };
    }, [config, oauthTokens]);

    // Auto-execute initial tool
    useEffect(() => {
        if (tools.length > 0 && !initialToolExecuted.current) {
            checkAndRunInitialTool();
        }
    }, [tools]);

    const checkAndRunInitialTool = async () => {
        const initialTool = tools.find(t => t._meta?.['tool/initial'] === true);
        if (!initialTool) return;

        initialToolExecuted.current = true;

        try {
            // Call the tool
            const response = await getMcpClient().callTool(initialTool.name, {});
            const result = response.success ? response.data : { error: response.error };


            // Add hidden user message to start conversation (required for API validity)
            const userMessage: ChatMessage = {
                id: generateId(),
                role: 'user',
                content: `Start initial tool: ${initialTool.name}`,
                timestamp: Date.now(),
                hidden: true
            };
            addMessage(userMessage);

            // Add hidden assistant message with tool call
            const toolCallId = `call_${Date.now()}_init`;
            const assistantMessage: ChatMessage = { // Using ChatMessage from lib/store (already imported)
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
            const toolResultMessage: ChatMessage = {
                id: generateId(),
                role: 'tool',
                content: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
                timestamp: Date.now(),
                toolCallId: toolCallId,
                toolName: initialTool.name,
                result: result,
            };
            addMessage(toolResultMessage);

        } catch (error) {
            console.error('❌ Initial tool execution failed:', error);
        }
    };

    // Auto-refresh tokens
    useEffect(() => {
        if (!oauthTokens || !config?.mcp?.oauth?.tokenEndpoint) return;

        const refreshInterval = setInterval(async () => {
            try {
                await refreshAccessToken(oauthTokens.refreshToken!, config.mcp.oauth.tokenEndpoint);
            } catch (error) {
                console.error('[Embed] Token refresh failed:', error);
            }
        }, 50 * 60 * 1000); // Refresh every 50 minutes

        return () => clearInterval(refreshInterval);
    }, [oauthTokens, config]);

    // Chat persistence functions
    const loadChats = async (page: number = 1, append: boolean = false) => {
        if (!persistenceEnabled || !oauthTokens) return;

        try {
            setLoadingChats(true);
            const response = await fetch(`/api/chats?page=${page}&limit=${CHATS_PER_PAGE}`, {
                headers: { 'Authorization': `Bearer ${oauthTokens.accessToken}` }
            });

            if (response.status === 401) {
                // Don't clear tokens or show modal here - the token might be valid for MCP but not for chat API
                // This is a known issue with Auth0 userinfo endpoint
                return;
            }

            if (response.ok) {
                const newChats = await response.json();

                if (append) {
                    setChats(prev => [...prev, ...newChats]);
                } else {
                    setChats(newChats || []);
                }

                setHasMoreChats(newChats.length === CHATS_PER_PAGE);
            }
        } catch (error) {
            console.error('[Embed] Failed to load chats:', error);
        } finally {
            setLoadingChats(false);
        }
    };

    const loadMoreChats = () => {
        if (!loadingChats && hasMoreChats) {
            const nextPage = chatPage + 1;
            setChatPage(nextPage);
            loadChats(nextPage, true);
        }
    };

    const syncChat = async (currentMessages: any[]) => {
        if (!persistenceEnabled || !oauthTokens || currentMessages.length === 0) {
            return;
        }


        try {
            const sanitizedMessages = currentMessages.map(msg => ({
                id: msg.id,
                role: msg.role,
                content: msg.content || '',
                timestamp: msg.timestamp,
                toolCalls: msg.toolCalls,
                toolCallId: msg.toolCallId,
                toolName: msg.toolName,
            }));

            if (chatId) {
                const response = await fetch(`/api/chats/${chatId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${oauthTokens.accessToken}`
                    },
                    body: JSON.stringify({ messages: sanitizedMessages })
                });

                if (response.status === 401) {
                    return;
                }

            } else {
                const response = await fetch('/api/chats', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${oauthTokens.accessToken}`
                    },
                    body: JSON.stringify({ messages: sanitizedMessages })
                });

                if (response.status === 401) {
                    return;
                }

                if (response.ok) {
                    const data = await response.json();
                    setChatId(data._id); // Use _id from MongoDB document
                } else {
                    console.error('[Embed] Failed to create chat:', response.status, await response.text());
                }
            }
        } catch (error) {
            console.error('[Embed] Failed to sync chat:', error);
        }
    };

    const createNewChat = () => {
        if (searchParams.get('standaloneMode') === 'true') {
            useChatStore.getState().setActiveUrlPromptScope(urlPromptScopeKeyFromRaw(searchParams.get('prompt')));
        }
        clearMessages();
        setChatId(null);
        setSidebarOpen(false);
    };

    const deleteChat = async () => {
        if (!chatId || !oauthTokens) return;

        try {
            const response = await fetch(`/api/chats/${chatId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${oauthTokens.accessToken}` }
            });

            if (response.status === 401) {
                return;
            }

            if (searchParams.get('standaloneMode') === 'true') {
                useChatStore.getState().setActiveUrlPromptScope(urlPromptScopeKeyFromRaw(searchParams.get('prompt')));
            }
            clearMessages();
            setChatId(null);
            await loadChats();
        } catch (error) {
            console.error('[Embed] Failed to delete chat:', error);
        }
    };

    const selectChat = async (id: string) => {
        if (!oauthTokens) return;

        try {
            // Show loading state
            setSidebarOpen(false); // Close sidebar immediately for better UX
            setIsLoading(true);

            const response = await fetch(`/api/chats/${id}`, {
                headers: { 'Authorization': `Bearer ${oauthTokens.accessToken}` }
            });

            if (response.status === 401) {
                setIsLoading(false);
                return;
            }

            if (response.ok) {
                const data = await response.json();
                setMessages(data.messages || []);
                setChatId(id);
            }
        } catch (error) {
            console.error('[Embed] Failed to load chat:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Auto-save chat when messages change
    useEffect(() => {

        if (messages.length > 0 && persistenceEnabled && oauthTokens) {
            const timeoutId = setTimeout(() => {
                syncChat(messages);
            }, 1000);

            return () => {
                clearTimeout(timeoutId);
            };
        }
    }, [messages, persistenceEnabled, oauthTokens]);

    // Automatic token refresh
    useEffect(() => {
        if (!oauthTokens) return;

        const checkAndRefreshToken = async () => {
            if (isTokenExpired(oauthTokens)) {

                if (!oauthTokens.refreshToken) {
                    setOauthTokens(null);
                    return;
                }

                const newTokens = await refreshAccessToken(
                    oauthTokens.refreshToken,
                    config.mcp.oauth.tokenEndpoint
                );

                if (newTokens) {
                    saveTokens(newTokens);
                    setOauthTokens(newTokens);
                } else {
                    console.error('❌ Failed to refresh token');
                    setOauthTokens(null);
                    addMessage({
                        id: generateId(),
                        role: 'assistant',
                        content: 'Your session has expired. Please authenticate again to continue.',
                        timestamp: Date.now(),
                    });
                }
            }
        };

        // Check immediately
        checkAndRefreshToken();

        // Check every minute
        const interval = setInterval(checkAndRefreshToken, 60000);

        return () => clearInterval(interval);
    }, [oauthRequired, oauthTokens, config]);

    // Handle tool calls from widgets via postMessage
    useEffect(() => {
        const handleWidgetMessage = async (event: MessageEvent) => {
            // Check if this is a tool call request from a widget
            if (event.data.type === 'nitro:call_tool') {
                const { toolName, arguments: toolArgs } = event.data;

                try {
                    setIsLoading(true);

                    const cache = toolExecutionCacheRef.current;
                    let result: any;
                    if (cache.has(toolName, toolArgs)) {
                        result = cache.get(toolName, toolArgs);
                    } else {
                        const response = await getMcpClient().callTool(toolName, toolArgs);
                        result = response.success ? response.data : { error: response.error };
                        cache.set(toolName, toolArgs, result);
                    }

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
                        result: result,
                    };

                    // Add both messages to the store
                    addMessage(assistantMessageWithToolCall);
                    addMessage(toolResultMessage);

                    // Create updated messages array for LLM continuation
                    const updatedMessages = [...currentMessages, assistantMessageWithToolCall, toolResultMessage];

                    // Continue the conversation with the tool result
                    await continueChatWithToolResults(updatedMessages);
                    setIsLoading(false);

                } catch (error: any) {
                    console.error('[Embed] Tool call failed:', error);
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
                    setIsLoading(false);
                }
            }
        };

        window.addEventListener('message', handleWidgetMessage);
        return () => window.removeEventListener('message', handleWidgetMessage);
    }, []);

    // Scope runtime theme variables to the embedded chat surface. This keeps
    // host/demo pages from inheriting the chatbot's theme_version_2 colors.
    useEffect(() => {
        if (!config || !themeRootRef.current) return;

        applyRuntimeThemeToRoot(themeRootRef.current, config);

        // Notify parent that widget is ready
        window.parent.postMessage({ type: 'nitrochat:ready' }, '*');
    }, [config]);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({
            behavior: isLoading ? 'auto' : 'smooth',
            block: 'end',
        });
    }, [messages, isLoading]);

    // Handle close button
    const handleClose = () => {
        window.parent.postMessage({ type: 'nitrochat:close' }, '*');
    };

    // Handle OAuth authentication
    const handleAuthenticate = async () => {
        try {
            setShowAuthModal(false);

            // Generate PKCE parameters
            const codeVerifier = generateCodeVerifier();
            const codeChallenge = await generateCodeChallenge(codeVerifier);
            const state = generateState();

            // Save for later verification
            saveCodeVerifier(codeVerifier);
            saveState(state);

            // Build authorization URL
            const authUrl = new URL(config.mcp.oauth.authorizationEndpoint);
            // Use client ID from config (same as main app)
            authUrl.searchParams.set('client_id', config.mcp.oauth.clientId || 'nitrochat');
            authUrl.searchParams.set('response_type', 'code');
            // Use /oauth/callback for popup flow (different from main app's redirect flow)
            authUrl.searchParams.set('redirect_uri', `${window.location.origin}/oauth/callback`);
            authUrl.searchParams.set('state', state);
            authUrl.searchParams.set('code_challenge', codeChallenge);
            authUrl.searchParams.set('code_challenge_method', 'S256');
            if (config.mcp.oauth.audience) {
                authUrl.searchParams.set('audience', config.mcp.oauth.audience);
            }

            // Open popup for OAuth
            const popup = window.open(authUrl.toString(), 'oauth', 'width=600,height=700');

            if (!popup) {
                throw new Error('Popup blocked. Please allow popups for this site.');
            }

            // Listen for OAuth callback
            const handleMessage = async (event: MessageEvent) => {
                if (event.data.type === 'oauth:success') {
                    window.removeEventListener('message', handleMessage);

                    const { code } = event.data.payload;

                    // Exchange code for tokens
                    const response = await fetch('/api/auth/token', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            code,
                            codeVerifier,
                            tokenEndpoint: config.mcp.oauth.tokenEndpoint,
                            redirectUri: `${window.location.origin}/oauth/callback`, // Embed uses /oauth/callback
                        }),
                    });

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                        console.error('[Embed] Token exchange failed:', response.status, errorData);
                        throw new Error(`Token exchange failed: ${errorData.error || response.statusText}`);
                    }

                    const tokens = await response.json();

                    // Save tokens to localStorage
                    const oauthTokensData = {
                        accessToken: tokens.accessToken,
                        refreshToken: tokens.refreshToken,
                        expiresAt: tokens.expiresAt,
                        tokenType: tokens.tokenType || 'Bearer',
                    };

                    saveTokens(oauthTokensData);
                    setOauthTokens(oauthTokensData);

                    // Update MCP client headers with new OAuth token
                    const client = getMcpClient();
                    client.updateHeaders({
                        'Authorization': `Bearer ${tokens.accessToken}`,
                    });

                    // Send pending message if any
                    if (pendingMessage) {
                        const { content, imageData } = pendingMessage;
                        setPendingMessage(null);
                        setShowAuthModal(false);
                        // Wait a bit for MCP to reconnect with new tokens
                        setTimeout(() => {
                            handleSendMessage(content, imageData);
                        }, 500);
                    } else {
                        setShowAuthModal(false);
                    }
                } else if (event.data.type === 'oauth:error') {
                    window.removeEventListener('message', handleMessage);
                    throw new Error(event.data.error || 'Authentication failed');
                }
            };

            window.addEventListener('message', handleMessage);
        } catch (error: any) {
            console.error('Authentication failed:', error);
            addMessage({
                id: generateId(),
                role: 'assistant',
                content: `Authentication failed: ${error.message}. Please try again.`,
                timestamp: Date.now(),
            });
            setPendingMessage(null);
        }
    };

    // Handle send message with full tool calling support
    const handleSendMessage = async (content: string, imageData?: any, options?: { hidden?: boolean }) => {
        if (!content.trim() && !imageData) return;

        // Check localStorage for tokens (more reliable than state which may not have updated yet)
        const currentTokens = oauthTokens || getTokens();


        // Check if OAuth is required and user is not authenticated
        if (oauthRequired && !currentTokens) {
            setPendingMessage({ content, imageData });
            setShowAuthModal(true);
            return;
        }

        if (connectionStatus === 'connecting') {
            toast.message(MCP_TOAST_STILL_CONNECTING, { id: 'nitrochat-mcp-embed-connecting' });
            return;
        }
        if (!mcpConnected) {
            toast.error(MCP_TOAST_DISCONNECTED);
            return;
        }

        toolExecutionCacheRef.current.clear();

        const userMessage = {
            id: generateId(),
            role: 'user' as const,
            content,
            timestamp: Date.now(),
            imageData,
            hidden: options?.hidden,
        };

        setIsLoading(true);

        addMessage(userMessage);

        try {
            const chatHeaders = await chatApiRequestHeaders();
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: chatHeaders,
                body: JSON.stringify(
                    buildChatApiRequestBody({
                        messages: [...messages, userMessage],
                        mcpTools: tools,
                        mcpPrompts: prompts,
                        systemInstruction,
                        systemPrompt: config?.systemPrompt ?? undefined,
                        stream: true,
                        trim: { maxMessages: config?.chat?.maxRequestMessages ?? 20 },
                    })
                ),
            });

            if (!response.ok) throw new Error('Chat API error');

            const contentType = response.headers.get('Content-Type') || '';
            const isStreaming = contentType.includes('text/event-stream') && response.body != null;
            let data: { message?: { role: string; content: string; toolCalls?: any[] }; toolCalls?: any[] };
            let streamAssistantId: string | null = null;
            if (isStreaming) {
                const assistantId = generateId();
                streamAssistantId = assistantId;
                addMessage({
                    id: assistantId,
                    role: 'assistant',
                    content: '',
                    timestamp: Date.now(),
                });
                const { content: streamedContent, toolCalls: streamedToolCalls } = await consumeChatStream(
                    response,
                    (nextContent) => useChatStore.getState().updateMessage(assistantId, { content: nextContent })
                );
                data = {
                    message: { role: 'assistant', content: streamedContent, toolCalls: streamedToolCalls },
                    toolCalls: streamedToolCalls,
                };
                if (streamedToolCalls.length > 0) {
                    useChatStore.getState().updateMessage(assistantId, {
                        content: streamedContent,
                        toolCalls: streamedToolCalls,
                    });
                }
            } else {
                data = await response.json();
            }
            const assistantAlreadyAdded = isStreaming;

            const processed = await processLlmToolCalls({
                label: 'EmbedContent:handleSend',
                data,
                client: getMcpClient(),
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
                await continueChatWithToolResults(
                    [
                        ...messages,
                        userMessage,
                        processed.assistantForContinuation,
                        ...processed.toolResultMessages,
                    ],
                    0,
                );
            } else {
                // No tool calls, just add the message if it has content
                if (!assistantAlreadyAdded && data.message && data.message.content && data.message.content.trim()) {
                    addMessage({
                        id: generateId(),
                        role: 'assistant',
                        content: data.message.content,
                        timestamp: Date.now(),
                    });
                }
            }
        } catch (error) {
            console.error('Error sending message:', error);
            addMessage({
                id: generateId(),
                role: 'assistant',
                content: 'Sorry, I encountered an error. Please try again.',
                timestamp: Date.now(),
            });
        } finally {
            setIsLoading(false);
        }
    };

    sendFromUrlPromptEmbedRef.current = (text: string) => {
        void handleSendMessage(text, undefined, { hidden: true });
    };

    // Auto-send ?prompt=… when MCP ready (same retainHistory rules as app/page.tsx).
    // retainHistory=false clears only this prompt's bucket in messagesByUrlPrompt; other keys stay.
    // Skip if thread already has messages unless retainHistory=false will clear first.
    useEffect(() => {
        const urlPromptRaw = searchParams.get('prompt')?.trim();
        if (
            !urlPromptRaw ||
            !mcpConnected ||
            tools.length === 0 ||
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
                    if (persistenceEnabled && oauthTokens?.accessToken) {
                        try {
                            const response = await fetch('/api/chats', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${oauthTokens.accessToken}`,
                                },
                                body: JSON.stringify({ messages: [], provider: 'gateway' }),
                            });
                            if (response.ok) {
                                const newChat = await response.json();
                                setChatId(newChat._id);
                                setChats((prev) => {
                                    if (prev.some((c: any) => c._id === newChat._id)) return prev;
                                    return [{ _id: newChat._id, title: newChat.title || 'New Chat' }, ...prev];
                                });
                            }
                        } catch (err) {
                            console.error('[Embed] Failed to create chat for standalone URL prompt:', err);
                        }
                    }
                }
                sendFromUrlPromptEmbedRef.current(decodedPrompt);
            } catch (e) {
                console.error('[Embed] Standalone URL prompt session failed:', e);
                sendFromUrlPromptEmbedRef.current(decodedPrompt);
            }
        })();
    }, [
        mcpConnected,
        tools.length,
        isLoading,
        searchParams,
        persistenceEnabled,
        oauthTokens?.accessToken,
        clearMessages,
    ]);

    // Continue conversation with tool results
    const continueChatWithToolResults = async (messagesHistory: any[], toolRound = 0) => {
        try {
            if (toolRound >= MAX_TOOL_ROUNDS) {
                setIsLoading(false);
                return;
            }

            const chatHeaders = await chatApiRequestHeaders();
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: chatHeaders,
                body: JSON.stringify(
                    buildChatApiRequestBody({
                        messages: messagesHistory,
                        mcpTools: tools,
                        mcpPrompts: prompts,
                        systemInstruction,
                        systemPrompt: config?.systemPrompt ?? undefined,
                        stream: true,
                        trim: { maxMessages: config?.chat?.maxRequestMessages ?? 20 },
                    })
                ),
            });

            if (!response.ok) {
                throw new Error('Continuation request failed');
            }

            const contentType = response.headers.get('Content-Type') || '';
            const isStreaming = contentType.includes('text/event-stream') && response.body != null;
            let data: { message?: { role: string; content: string; toolCalls?: any[] }; toolCalls?: any[] };
            let continuationStreamAssistantId: string | null = null;
            if (isStreaming) {
                const assistantId = generateId();
                continuationStreamAssistantId = assistantId;
                addMessage({ id: assistantId, role: 'assistant', content: '', timestamp: Date.now() });
                const { content: streamedContent, toolCalls: streamedToolCalls } = await consumeChatStream(
                    response,
                    (nextContent) => useChatStore.getState().updateMessage(assistantId, { content: nextContent })
                );
                data = {
                    message: { role: 'assistant', content: streamedContent, toolCalls: streamedToolCalls },
                    toolCalls: streamedToolCalls,
                };
                if (streamedToolCalls.length > 0) {
                    useChatStore.getState().updateMessage(assistantId, {
                        content: streamedContent,
                        toolCalls: streamedToolCalls,
                    });
                }
            } else {
                data = await response.json();
            }
            const assistantAlreadyAdded = isStreaming;

            const processed = await processLlmToolCalls({
                label: 'EmbedContent:continueChatWithToolResults',
                data,
                client: getMcpClient(),
                generateId,
                addMessage,
                updateMessage: (id, patch) => useChatStore.getState().updateMessage(id, patch),
                streamAssistantId: continuationStreamAssistantId,
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
                await continueChatWithToolResults(
                    [
                        ...messagesHistory,
                        processed.assistantForContinuation,
                        ...processed.toolResultMessages,
                    ],
                    toolRound + 1,
                );
            } else {
                // No more tool calls, add final response if it has content
                if (!assistantAlreadyAdded && data.message && data.message.content && data.message.content.trim()) {
                    addMessage({
                        id: generateId(),
                        role: 'assistant',
                        content: data.message.content,
                        timestamp: Date.now(),
                    });
                }
            }
        } catch (error) {
            console.error('Error continuing chat:', error);
            addMessage({
                id: generateId(),
                role: 'assistant',
                content: 'Sorry, I encountered an error processing the tool results.',
                timestamp: Date.now(),
            });
        }
    };

    if (!mounted) {
        return null; // Prevent SSR hydration mismatch
    }

    if (!config) {
        return (
            <div className="flex items-center justify-center h-screen bg-background">
                <div className="text-muted">Loading...</div>
            </div>
        );
    }

    const surfaceTheme: ThemeSurface = getRuntimeThemeSurface(config);
    const chatbotLogoUrl = resolveStandaloneChatbotLogo(config, surfaceTheme);
    const brandLogoUrl = getCustomLogoUrlForSurface(config, surfaceTheme) || fallbackStandaloneChatbotLogo(surfaceTheme);
    const headerTitle =
        firstNonEmptyString(
            config.standaloneMode?.headerText,
            config.branding?.name
        ) || 'NitroChat';
    const embedFontStyle = config.branding?.fontFamily
        ? ({ fontFamily: config.branding.fontFamily } as const)
        : undefined;

    return (
        <div
            ref={themeRootRef}
            className={className || "flex flex-col h-screen bg-background text-foreground"}
        >
            <EmbedStandaloneHeader
                config={config}
                surfaceTheme={surfaceTheme}
                onClose={handleClose}
                persistenceEnabled={persistenceEnabled}
                showPersistenceActions={!!oauthTokens}
                chatId={chatId}
                onNewChat={createNewChat}
                onToggleHistory={() => setSidebarOpen(!sidebarOpen)}
                onDeleteChat={deleteChat}
            />

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center min-h-full text-center px-6 space-y-6 pt-12 pb-8">
                        {/* Logo or Brand */}
                        {brandLogoUrl ? (
                            <StandaloneChatbotAvatar
                                src={brandLogoUrl}
                                surface={surfaceTheme}
                                alt={config.branding?.name || 'Chat'}
                                variant="hero"
                                standaloneMode={true}
                            />
                        ) : (
                            <>
                                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary via-accent to-secondary flex items-center justify-center">
                                    <span className="text-black font-bold text-2xl">N</span>
                                </div>
                                <h2 className="text-lg font-semibold">{config.branding?.name || 'NitroChat'}</h2>
                            </>
                        )}

                        {/* Tagline */}
                        <p className="text-sm text-muted">{config.branding?.tagline || 'How can I help you today?'}</p>

                        {/* MCP Connection Status */}
                        <div className="flex items-center gap-2 text-xs">
                            <div className={`w-2 h-2 rounded-full ${connectionStatus === 'connected' ? 'bg-green-500' :
                                connectionStatus === 'connecting' ? 'bg-yellow-500 opacity-50' :
                                    'bg-red-500'
                                }`} />
                            <span className="text-muted">
                                {connectionStatus === 'connected' ? 'Connected' :
                                    connectionStatus === 'connecting' ? 'Connecting...' :
                                        'Disconnected'}
                            </span>
                        </div>

                        {/* Suggested Prompts */}
                        {prompts.length > 0 && (
                            <div className="w-full max-w-md space-y-2">
                                <p className="text-xs text-muted font-medium">Suggested prompts:</p>
                                <div className="grid gap-2">
                                    {prompts.slice(0, 3).map((prompt: any, index: number) => (
                                        <button
                                            key={index}
                                            onClick={() => {
                                                const promptText = prompt.description || prompt.name;
                                                handleSendMessage(promptText);
                                            }}
                                            className="px-4 py-2 text-sm text-left rounded-lg border border-border hover:bg-card transition-colors"
                                        >
                                            {prompt.description || prompt.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <>
                        <div className="pt-4">
                            {filterVisibleMessages(messages, tools).map((message) => (
                                <ChatMessageComponent
                                    key={message.id}
                                    message={message}
                                    brandName={config?.branding?.name}
                                    currentTheme={surfaceTheme}
                                    chatbotLogo={chatbotLogoUrl}
                                />
                            ))}
                        </div>
                        {isLoading && (
                            <div className="text-sm text-muted">Thinking...</div>
                        )}
                        <div ref={messagesEndRef} />
                    </>
                )}
            </div>

            <EmbedChatFooter style={embedFontStyle}>
                <ChatInputEmbed
                    onSend={handleSendMessage}
                    disabled={isLoading}
                    currentTheme={surfaceTheme}
                    fileShareEnabled={config?.chat?.enableImageUpload ?? false}
                />
            </EmbedChatFooter>

            {/* Auth Modal */}
            <AuthModal
                isOpen={showAuthModal}
                onAuthenticate={handleAuthenticate}
                onCancel={() => {
                    setShowAuthModal(false);
                    setPendingMessage(null);
                }}
                serverName={config?.mcp?.oauth?.serverName || 'MCP Server'}
                primaryColor={resolveBrandColor(config)}
            />

            {/* Chat History Sidebar */}
            <EmbedSidebar
                isOpen={sidebarOpen}
                onClose={() => setSidebarOpen(false)}
                chats={chats}
                currentChatId={chatId}
                onSelectChat={selectChat}
                loading={loadingChats && chats.length === 0}
                hasMore={hasMoreChats}
                loadingMore={loadingChats && chats.length > 0}
                onLoadMore={loadMoreChats}
            />
        </div>
    );
}

