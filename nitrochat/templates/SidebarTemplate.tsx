'use client';

import { useState, useRef, useEffect } from 'react';
import { PanelLeftOpen, Download, Trash2, Settings, Sun, Moon, MoreHorizontal, AlignJustify, Mic, RotateCcw } from 'lucide-react';
import { Sidebar } from '@/components/Sidebar';
import { ChatMessage } from '@/components/ChatMessage';
import { ChatInput } from '@/components/ChatInput';
import { SessionCompletedBanner } from '@/components/SessionCompletedBanner';
import { WelcomeScreen } from '@/components/WelcomeScreen';
import { SettingsPanel } from '@/components/SettingsPanel';
import { ConfirmModal } from '@/components/ConfirmModal';
import { Navbar } from '@/components/Navbar';
import { VoiceSettingsModal } from '@/components/VoiceSettingsModal';
import { StandaloneChatbotAvatar } from '@/components/StandaloneChatbotAvatar';
import { ModelSelector } from '@/components/ModelSelector';
import { ChatMessage as ChatMessageType, McpPrompt, useChatStore } from '@/lib/store';
import { isSessionCompletedUiEnabled, NitroChatConfig } from '@/nitrochat.config';
import {
    STANDALONE_CHAT_INPUT_WRAPPER_CLASS,
    STANDALONE_FOOTER_INNER_CLASS,
    STANDALONE_FOOTER_OUTER_CLASS,
    STANDALONE_HEADER_INNER_CLASS,
    STANDALONE_MESSAGES_COLUMN_CLASS,
} from '@/lib/standalone-layout';
import { cn } from '@/lib/utils';
import { getContextUsage } from '@/lib/context-utils';
import {
    fallbackStandaloneChatbotLogo,
    getCustomLogoUrlForSurface,
    getRuntimeThemeSurface,
    resolveStandaloneChatbotLogo,
} from '@/lib/theme-runtime';

interface SidebarTemplateProps {
    config: NitroChatConfig;
    messages: ChatMessageType[];
    isLoading: boolean;
    settingsOpen: boolean;
    prompts: McpPrompt[];
    onSendMessage: (content: string) => void;
    onStopGeneration?: () => void;
    onPromptClick: (prompt: McpPrompt) => void;
    onNewChat: () => void;
    onOpenSettings: () => void;
    onCloseSettings: () => void;
    /** When false, Settings option is hidden in sidebar. */
    showSettings?: boolean;
    onExportChat?: () => void;
    onDeleteAllChats?: () => Promise<void>;
    settingsIsAuthenticated?: boolean;
    termsOfServiceUrl?: string;
    privacyPolicyUrl?: string;
    elevenLabsEnabled?: boolean;
    onLogout?: () => void;
    onDeleteChat?: () => void;
    chats?: { _id: string; title: string }[];
    onSelectChat?: (id: string) => void;
    currentChatId?: string | null;
    themeMode?: 'dark' | 'light' | 'system_default';
    currentTheme?: 'dark' | 'light';
    onToggleTheme?: () => void;
    chatPage?: number;
    hasMoreChats?: boolean;
    loadingChats?: boolean;
    onLoadMore?: () => void;
    transcribedText?: string | null; // Transcribed text from voice popup
    onTranscribedTextClear?: () => void; // Callback to clear transcribed text
    // Model selection props (gateway integration)
    modelSelectionEnabled?: boolean;
    selectedModel?: string;
    availableModels?: Array<{ id: string; name: string; provider?: string }>;
    modelsLoading?: boolean;
    onModelChange?: (model: string) => void;
    standaloneMode?: boolean;
    /** When true with standaloneMode, hide config welcomeText / empty WelcomeScreen (e.g. `?prompt=` deep link). */
    suppressStandaloneWelcome?: boolean;
    /**
     * When true (typically with standaloneMode after a session-end MCP tool fires),
     * the completion banner is shown inline after messages (scrolls with the thread), and the composer is read-only.
     */
    sessionCompleted?: boolean;
    /** When true, chat input is disabled while the thread bootstrap sequence runs. */
    isBootstrapping?: boolean;
    /** Non-null when bootstrap has failed; shown as an inline error banner above the composer. */
    bootstrapError?: string | null;
    /** Callback for the Retry button shown when bootstrapError is set. */
    onRetryBootstrap?: () => void;
}

export function SidebarTemplate({
    config,
    messages,
    isLoading,
    settingsOpen,
    prompts,
    onSendMessage,
    onStopGeneration,
    onPromptClick,
    onNewChat,
    onOpenSettings,
    onCloseSettings,
    showSettings = true,
    onExportChat,
    onDeleteAllChats,
    settingsIsAuthenticated,
    termsOfServiceUrl,
    privacyPolicyUrl,
    elevenLabsEnabled = false,
    onLogout,
    onDeleteChat,
    chats,
    onSelectChat,
    currentChatId,
    themeMode,
    currentTheme,
    onToggleTheme,
    chatPage = 1,
    hasMoreChats = false,
    loadingChats = false,
    onLoadMore,
    transcribedText,
    onTranscribedTextClear,
    modelSelectionEnabled,
    selectedModel,
    availableModels = [],
    modelsLoading,
    onModelChange,
    standaloneMode = false,
    suppressStandaloneWelcome = false,
    sessionCompleted = false,
    isBootstrapping = false,
    bootstrapError = null,
    onRetryBootstrap,
}: SidebarTemplateProps) {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [voiceSettingsOpen, setVoiceSettingsOpen] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Get ElevenLabs API key from store to conditionally show Voice Mode menu
    const elevenLabsApiKey = useChatStore((state) => state.elevenLabsApiKey);

    // Collapsed state with localStorage persistence
    const [isCollapsed, setIsCollapsed] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('nitrochat-sidebar-collapsed');
            return saved === 'true';
        }
        return false;
    });

    const handleCollapseToggle = () => {
        const newState = !isCollapsed;
        setIsCollapsed(newState);
        if (typeof window !== 'undefined') {
            localStorage.setItem('nitrochat-sidebar-collapsed', String(newState));
        }
    };

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({
            behavior: isLoading ? 'auto' : 'smooth',
            block: 'end',
        });
    }, [messages, isLoading, sessionCompleted]);

    // Close menu when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setMenuOpen(false);
            }
        }

        if (menuOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [menuOpen]);

    const standaloneFontStyle = config.branding?.fontFamily
        ? ({ fontFamily: config.branding.fontFamily } as const)
        : undefined;

    const standaloneMessages = standaloneMode
        ? messages.filter((message) => {
            if (message.role !== 'assistant') return true;
            if (message.imageData) return true;
            const text = (message.content || '').trim();
            return /[\p{L}\p{N}]/u.test(text);
        })
        : messages;

    /** Same message list as send-time context checks in app/page.tsx */
    const contextUsage = getContextUsage(messages, config.chat?.contextMaxTokens);

    const standaloneSurface = currentTheme ?? getRuntimeThemeSurface(config);
    const standaloneChatbotLogo = resolveStandaloneChatbotLogo(config, standaloneSurface);
    const brandLogoUrl = getCustomLogoUrlForSurface(config, standaloneSurface) || fallbackStandaloneChatbotLogo(standaloneSurface);
    const standaloneHeaderControlStyle = { color: 'var(--color-header-subtext)' } as const;

    return (
        <div className="flex h-screen overflow-hidden bg-background text-foreground">
            {/* Sidebar - Hidden in standalone mode */}
            {!standaloneMode && (
                <Sidebar
                    isOpen={sidebarOpen}
                    onToggle={() => setSidebarOpen(!sidebarOpen)}
                    onNewChat={onNewChat}
                    onOpenSettings={onOpenSettings}
                    showSettings={showSettings}
                    onLogout={onLogout}
                    onDeleteChat={onDeleteChat}
                    chats={chats}
                    onSelectChat={onSelectChat}
                    currentChatId={currentChatId}
                    persistenceEnabled={config.persistence?.enabled}
                    isCollapsed={isCollapsed}
                    onCollapseToggle={handleCollapseToggle}
                    chatPage={chatPage}
                    hasMoreChats={hasMoreChats}
                    loadingChats={loadingChats}
                    onLoadMore={onLoadMore}
                    currentTheme={currentTheme}
                />
            )}

            {/* Main Content Area */}
            <div className={cn(
                "flex-1 flex flex-col min-w-0 relative",
                standaloneMode && "w-full"
            )}>
                {/* Enhanced Header - Fixed at top */}
                {standaloneMode ? (
                    <div
                        className="sticky top-0 left-0 right-0 z-50 border-b border-secondary/25 shadow-sm backdrop-blur-md"
                        style={{
                            backgroundColor: 'var(--color-header-bg)',
                            ...standaloneFontStyle,
                        }}
                    >
                        <div className={STANDALONE_HEADER_INNER_CLASS}>
                            <div className="flex min-w-0 flex-1 items-center gap-4 sm:gap-5 md:gap-6">
                                {brandLogoUrl && (
                                    <StandaloneChatbotAvatar
                                        src={brandLogoUrl}
                                        surface={standaloneSurface}
                                        alt={config.branding?.name || 'Chat'}
                                        variant="header"
                                    />
                                )}
                                <div className="flex min-w-0 flex-col justify-center">
                                    <span
                                        className="leading-tight tracking-[-0.02em]"
                                        style={{
                                            color: 'var(--color-header-text)',
                                            fontSize: `clamp(1.125rem, 2.8vw, ${config.standaloneMode?.headerTextStyle?.fontSize || '1.75rem'})`,
                                            fontWeight: config.standaloneMode?.headerTextStyle?.fontWeight || '600',
                                            ...standaloneFontStyle,
                                        }}
                                    >
                                        {config.standaloneMode?.headerText || config.branding?.name || 'NitroChat'}
                                    </span>
                                    {config.standaloneMode?.headerSubText && (
                                        <span
                                            className="mt-1.5 max-w-prose leading-snug text-balance"
                                            style={{
                                                color: 'var(--color-header-subtext)',
                                                fontSize: `clamp(0.8125rem, 1.6vw, ${config.standaloneMode?.headerSubTextStyle?.fontSize || '0.9375rem'})`,
                                                fontWeight: config.standaloneMode?.headerSubTextStyle?.fontWeight || '400',
                                                ...standaloneFontStyle,
                                            }}
                                        >
                                            {config.standaloneMode.headerSubText}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="flex flex-shrink-0 items-center gap-0.5 md:gap-1">
                                {modelSelectionEnabled && onModelChange && (
                                    <div className="min-w-0 max-w-[11rem] shrink sm:max-w-[13rem] md:max-w-[14rem]">
                                        <ModelSelector
                                            variant="navbar"
                                            navbarStandalone
                                            selectedModel={selectedModel ?? 'openrouter/auto'}
                                            availableModels={availableModels}
                                            modelsLoading={modelsLoading}
                                            onModelChange={onModelChange}
                                            currentTheme={currentTheme}
                                            showLabel={false}
                                        />
                                    </div>
                                )}
                                {elevenLabsApiKey && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (typeof window !== 'undefined') {
                                                window.dispatchEvent(new CustomEvent('open-voice-overlay'));
                                            }
                                        }}
                                        style={standaloneHeaderControlStyle}
                                        className="cursor-pointer rounded-lg p-2.5 transition-colors duration-200 hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
                                        aria-label="Voice mode"
                                    >
                                        <Mic className="h-5 w-5 md:h-6 md:w-6" />
                                    </button>
                                )}
                                {themeMode === 'system_default' && onToggleTheme && (
                                    <button
                                        type="button"
                                        onClick={() => onToggleTheme()}
                                        style={standaloneHeaderControlStyle}
                                        className="cursor-pointer rounded-lg p-2.5 transition-colors duration-200 hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
                                        aria-label={currentTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                                    >
                                        {currentTheme === 'dark' ? (
                                            <Sun className="h-5 w-5 md:h-6 md:w-6" />
                                        ) : (
                                            <Moon className="h-5 w-5 md:h-6 md:w-6" />
                                        )}
                                    </button>
                                )}
                                {showSettings && (
                                    <button
                                        type="button"
                                        onClick={() => onOpenSettings()}
                                        style={standaloneHeaderControlStyle}
                                        className="cursor-pointer rounded-lg p-2.5 transition-colors duration-200 hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
                                        aria-label="Settings"
                                    >
                                        <Settings className="h-5 w-5 md:h-6 md:w-6" />
                                    </button>
                                )}
                                <div className="relative" ref={menuRef}>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setMenuOpen(!menuOpen);
                                        }}
                                        style={standaloneHeaderControlStyle}
                                        className="cursor-pointer rounded-lg p-2.5 transition-colors duration-200 hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
                                        title="More options"
                                        aria-label="More options"
                                        aria-expanded={menuOpen}
                                    >
                                        <MoreHorizontal className="h-5 w-5 md:h-6 md:w-6" />
                                    </button>
                                    {menuOpen && (
                                        <div
                                            className={cn(
                                                'absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-md border border-border shadow-2xl shadow-black/20',
                                            )}
                                            style={{
                                                backgroundColor: 'var(--color-header-bg)',
                                                color: 'var(--color-header-text)',
                                                ['--color-sidebar' as any]: 'var(--color-header-bg)',
                                                ['--color-foreground' as any]: 'var(--color-header-text)',
                                                ['--color-muted' as any]: 'var(--color-header-subtext)',
                                                ['--color-muted-foreground' as any]: 'var(--color-header-subtext)',
                                            }}
                                        >
                                            <div className="py-1">
                                                {/* <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        if (onExportChat) {
                                                            onExportChat();
                                                        } else {
                                                            const chatData = JSON.stringify(
                                                                {
                                                                    messages,
                                                                    timestamp: Date.now(),
                                                                    provider: config.ai?.defaultProvider || 'gemini',
                                                                },
                                                                null,
                                                                2,
                                                            );
                                                            const blob = new Blob([chatData], { type: 'application/json' });
                                                            const url = URL.createObjectURL(blob);
                                                            const a = document.createElement('a');
                                                            a.href = url;
                                                            a.download = `nitrochat-${new Date().toISOString().split('T')[0]}.json`;
                                                            document.body.appendChild(a);
                                                            a.click();
                                                            document.body.removeChild(a);
                                                            URL.revokeObjectURL(url);
                                                        }
                                                        setMenuOpen(false);
                                                    }}
                                                    className={cn(
                                                        'flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-normal transition-colors duration-150 hover:bg-primary/10 hover:text-primary',
                                                    )}
                                                >
                                                    <Download className="h-4 w-4 flex-shrink-0" />
                                                    <span>Download chat</span>
                                                </button> */}
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setMenuOpen(false);
                                                        onNewChat();
                                                    }}
                                                    className={cn(
                                                        'flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-normal transition-colors duration-150 hover:bg-error/20 hover:text-error',
                                                    )}
                                                >
                                                    <RotateCcw className="h-4 w-4 flex-shrink-0" />
                                                    <span>Clear chat</span>
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                <div className={cn(
                    "sticky top-0 left-0 right-0 h-16",
                    "flex items-center justify-between px-4 md:px-6",
                    "z-50 bg-background/80 backdrop-blur-xl",
                    "gap-4"
                )}>
                    {/* Mobile Toggle (Left) */}
                    <div className="md:hidden flex items-center gap-3 flex-shrink-0">
                        <button
                            onClick={() => {
                                setSidebarOpen(!sidebarOpen);
                            }}
                            className={cn(
                                "p-2.5 rounded-md",
                                "bg-card/50 backdrop-blur-sm border border-border/50",
                                "hover:bg-card/70 transition-colors duration-150"
                            )}
                            aria-label="Toggle Sidebar"
                        >
                            <AlignJustify className="w-5 h-5" />
                        </button>
                        <div className="font-normal text-lg flex items-center gap-2">
                            {(() => {
                                const customLogo = getCustomLogoUrlForSurface(config, standaloneSurface);
                                return customLogo ? (
                                    <img src={customLogo} alt={config.branding?.name || 'NitroChat'} className="h-7 object-contain" />
                                ) : (
                                    <>
                                        <span className="w-7 h-7 rounded-md bg-primary/20 flex items-center justify-center text-xs text-primary font-medium">N</span>
                                        <span>{config.branding?.name || 'NitroChat'}</span>
                                    </>
                                );
                            })()}
                        </div>
                    </div>

                    {/* Desktop Left - Theme toggle and Branding */}
                    <div className="hidden md:flex items-center gap-3 flex-shrink-0">
                        {/* Theme Toggle Button - Visible when mode is auto */}
                        {themeMode === 'system_default' && onToggleTheme && (
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onToggleTheme();
                                }}
                                className={cn(
                                    "p-2.5 rounded-md",
                                    "bg-card/50 backdrop-blur-sm",
                                    "hover:bg-card/70",
                                    "transition-colors duration-150"
                                )}
                                title={`Switch to ${currentTheme === 'dark' ? 'Light' : 'Dark'} Mode`}
                                aria-label={`Switch to ${currentTheme === 'dark' ? 'Light' : 'Dark'} Mode`}
                            >
                                {currentTheme === 'dark' ? (
                                    <Sun className="w-5 h-5" />
                                ) : (
                                    <Moon className="w-5 h-5" />
                                )}
                            </button>
                        )}
                    </div>

                    {/* Navbar - Center (Desktop only) */}
                    <div className="hidden md:flex items-center flex-1 justify-center">
                        <Navbar
                            appName={config.branding?.name || 'NitroChat'}
                            prompts={prompts}
                            onPromptClick={onPromptClick}
                            onQuickAction={onSendMessage}
                            promptsLabel={config.ui.navbar?.promptsLabel}
                            enabled={config.ui.navbar?.enabled}
                        />
                    </div>

                    {/* Mobile/Desktop Actions (Right) - Model, theme toggle, three dots */}
                    <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
                        {modelSelectionEnabled && onModelChange && (
                            <div className="min-w-0 max-w-[9rem] shrink sm:max-w-[14rem]">
                                <ModelSelector
                                    variant="navbar"
                                    selectedModel={selectedModel ?? 'openrouter/auto'}
                                    availableModels={availableModels}
                                    modelsLoading={modelsLoading}
                                    onModelChange={onModelChange}
                                    currentTheme={currentTheme}
                                    showLabel={false}
                                />
                            </div>
                        )}
                        {/* Theme Toggle Button - Visible only on mobile when mode is auto */}
                        {themeMode === 'system_default' && onToggleTheme && (
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onToggleTheme();
                                }}
                                className={cn(
                                    "p-2.5 rounded-md",
                                    "bg-card/50 backdrop-blur-sm",
                                    "hover:bg-card/70",
                                    "transition-colors duration-150",
                                    "md:hidden" // Hide on desktop, show only on mobile
                                )}
                                title={`Switch to ${currentTheme === 'dark' ? 'Light' : 'Dark'} Mode`}
                                aria-label={`Switch to ${currentTheme === 'dark' ? 'Light' : 'Dark'} Mode`}
                            >
                                {currentTheme === 'dark' ? (
                                    <Sun className="w-5 h-5" />
                                ) : (
                                    <Moon className="w-5 h-5" />
                                )}
                            </button>
                        )}
                        {/* Three dots menu */}
                        <div className="relative" ref={menuRef}>
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setMenuOpen(!menuOpen);
                                }}
                                className={cn(
                                    "p-2.5 rounded-md",
                                    "bg-card/50 backdrop-blur-sm",
                                    "hover:bg-card/70",
                                    "transition-colors duration-150"
                                )}
                                title="More options"
                                aria-label="More options"
                            >
                                <MoreHorizontal className="w-5 h-5" />
                            </button>

                            {/* Dropdown Menu */}
                            {menuOpen && (
                                <div 
                                    className={cn(
                                        "absolute top-full right-0 mt-2 w-48",
                                        "border border-border rounded-md",
                                        "shadow-2xl shadow-black/20",
                                        "z-50 overflow-hidden"
                                    )}
                                    style={{
                                        backgroundColor: 'var(--color-header-bg)',
                                        color: 'var(--color-header-text)',
                                        ['--color-sidebar' as any]: 'var(--color-header-bg)',
                                        ['--color-foreground' as any]: 'var(--color-header-text)',
                                        ['--color-muted' as any]: 'var(--color-header-subtext)',
                                        ['--color-muted-foreground' as any]: 'var(--color-header-subtext)',
                                    }}
                                >
                                    <div className="py-1">
                                        <button
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                // Export chat data
                                                const chatData = JSON.stringify({
                                                    messages,
                                                    timestamp: Date.now(),
                                                    provider: config.ai?.defaultProvider || 'gemini'
                                                }, null, 2);
                                                const blob = new Blob([chatData], { type: 'application/json' });
                                                const url = URL.createObjectURL(blob);
                                                const a = document.createElement('a');
                                                a.href = url;
                                                a.download = `nitrochat-${new Date().toISOString().split('T')[0]}.json`;
                                                document.body.appendChild(a);
                                                a.click();
                                                document.body.removeChild(a);
                                                URL.revokeObjectURL(url);
                                                setMenuOpen(false);
                                            }}
                                            className={cn(
                                                "w-full text-left px-4 py-2.5 flex items-center gap-3",
                                                "hover:bg-primary/10 hover:text-primary",
                                                "transition-colors duration-150",
                                                "text-sm font-normal"
                                            )}
                                        >
                                            <Download className="w-4 h-4 flex-shrink-0" />
                                            <span>Download Chat</span>
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setShowDeleteConfirm(true);
                                                setMenuOpen(false);
                                            }}
                                            className={cn(
                                                "w-full text-left px-4 py-2.5 flex items-center gap-3",
                                                "hover:bg-error/20 hover:text-error",
                                                "transition-colors duration-150",
                                                "text-sm font-normal"
                                            )}
                                        >
                                            <Trash2 className="w-4 h-4 flex-shrink-0" />
                                            <span>Delete Chat</span>
                                        </button>
                                        {/* Theme Toggle - Only show in auto mode */}
                                        {themeMode === 'system_default' && onToggleTheme && (
                                            <button
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    onToggleTheme();
                                                    setMenuOpen(false);
                                                }}
                                                className={cn(
                                                    "w-full text-left px-4 py-2.5 flex items-center gap-3",
                                                    "hover:bg-primary/10 hover:text-primary",
                                                    "transition-colors duration-150",
                                                    "text-sm font-normal",
                                                    "border-t border-border/50 mt-1"
                                                )}
                                            >
                                                {currentTheme === 'dark' ? (
                                                    <Sun className="w-4 h-4 flex-shrink-0" />
                                                ) : (
                                                    <Moon className="w-4 h-4 flex-shrink-0" />
                                                )}
                                                <span>Switch to {currentTheme === 'dark' ? 'Light' : 'Dark'} Mode</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                )}

                {/* Chat Area */}
                {standaloneMode ? (
                    <>
                        <main
                            className="relative flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-hide"
                            style={standaloneFontStyle}
                        >
                            <div className={STANDALONE_MESSAGES_COLUMN_CLASS}>
                                {config.standaloneMode?.welcomeText && !suppressStandaloneWelcome && (
                                    <div className="flex items-start gap-2 sm:gap-3">
                                        {standaloneChatbotLogo && (
                                            <StandaloneChatbotAvatar
                                                src={standaloneChatbotLogo}
                                                surface={standaloneSurface}
                                                variant="message"
                                                standaloneMode={true}
                                            />
                                        )}
                                        <div
                                            className="min-w-0 max-w-full flex-1 rounded-xl border border-border/70 bg-aiBubbleBg px-3 py-2.5 text-aiBubbleText shadow-sm sm:rounded-2xl sm:px-4 sm:py-3 md:px-5 md:py-3.5"
                                            style={standaloneFontStyle}
                                        >
                                            {config.standaloneMode.welcomeText.split('\n').map((line, i) => (
                                                <p
                                                    key={i}
                                                    className="text-sm leading-relaxed md:text-[0.9375rem]"
                                                    style={{ marginTop: i > 0 ? '0.5rem' : 0 }}
                                                >
                                                    {line}
                                                </p>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {isBootstrapping && standaloneMessages.length === 0 && (
                                    <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
                                        <div className="flex items-center gap-1.5">
                                            <span className="inline-block h-2 w-2 animate-dot-bounce rounded-full bg-muted" style={{ animationDelay: '0ms' }} />
                                            <span className="inline-block h-2 w-2 animate-dot-bounce rounded-full bg-muted" style={{ animationDelay: '150ms' }} />
                                            <span className="inline-block h-2 w-2 animate-dot-bounce rounded-full bg-muted" style={{ animationDelay: '300ms' }} />
                                        </div>
                                        <span className="text-sm">Loading conversation…</span>
                                    </div>
                                )}

                                {!config.standaloneMode?.welcomeText &&
                                    standaloneMessages.length === 0 &&
                                    !isLoading &&
                                    !isBootstrapping &&
                                    !suppressStandaloneWelcome && (
                                    <WelcomeScreen
                                        prompts={prompts}
                                        onPromptClick={onPromptClick}
                                        onSuggestionClick={onSendMessage}
                                        embedded
                                        branding={config.branding}
                                        themeVersion2={config.theme_version_2}
                                        suggestedPrompts={config.chat?.suggestedPrompts}
                                    />
                                )}

                                {standaloneMessages.map((message) => (
                                    <ChatMessage
                                        key={message.id}
                                        message={message}
                                        currentTheme={currentTheme}
                                        brandName={config.branding?.name}
                                        standaloneMode
                                        chatbotLogo={standaloneChatbotLogo}
                                    />
                                ))}
                                {isLoading && (
                                    <div className="flex flex-wrap items-start justify-between gap-3 py-2">
                                        <div className="flex min-w-0 items-start gap-3">
                                            {standaloneChatbotLogo ? (
                                                <StandaloneChatbotAvatar
                                                    src={standaloneChatbotLogo}
                                                    surface={standaloneSurface}
                                                    variant="message"
                                                    standaloneMode={true}
                                                />
                                            ) : (
                                                <div className="mt-0.5 h-8 w-8 flex-shrink-0 rounded-full bg-muted/25 ring-1 ring-border/40 md:h-9 md:w-9" />
                                            )}
                                            <div
                                                className="flex min-w-[7.5rem] items-center justify-center gap-2 rounded-2xl border border-border/60 bg-aiBubbleBg px-5 py-4 text-aiBubbleText shadow-sm"
                                                role="status"
                                                aria-label="Assistant is typing"
                                            >
                                                <span className="inline-block h-2 w-2 animate-dot-bounce rounded-full bg-muted" style={{ animationDelay: '0ms' }} />
                                                <span className="inline-block h-2 w-2 animate-dot-bounce rounded-full bg-muted" style={{ animationDelay: '150ms' }} />
                                                <span className="inline-block h-2 w-2 animate-dot-bounce rounded-full bg-muted" style={{ animationDelay: '300ms' }} />
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {sessionCompleted && isSessionCompletedUiEnabled(config.chat) && (
                                    <SessionCompletedBanner
                                        standaloneLayout
                                        currentTheme={currentTheme}
                                        chatbotLogo={standaloneChatbotLogo}
                                        style={standaloneFontStyle}
                                        description={config.chat.sessionCompletedDescription}
                                        ctaEnabled={isSessionCompletedUiEnabled(config.chat)}
                                        ctaLabel={config.chat.sessionCompletedCtaLabel}
                                        ctaUrl={config.chat.sessionCompletedCtaUrl}
                                        ctaBackground={config.chat.sessionCompletedCtaBackground}
                                        ctaColor={config.chat.sessionCompletedCtaColor}
                                    />
                                )}
                                <div ref={messagesEndRef} />
                            </div>
                        </main>

                        <div
                            className={STANDALONE_FOOTER_OUTER_CLASS}
                            style={standaloneFontStyle}
                        >
                            {bootstrapError && (
                                <div className="w-full max-w-5xl mx-auto px-4 pb-2">
                                    <div className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 bg-red-950/30 rounded border border-red-800">
                                        <span className="flex-1">{bootstrapError}</span>
                                        {onRetryBootstrap && (
                                            <button
                                                type="button"
                                                className="underline hover:no-underline shrink-0"
                                                onClick={onRetryBootstrap}
                                            >
                                                Retry
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                            <div className={STANDALONE_FOOTER_INNER_CLASS}>
                                <ChatInput
                                    onSend={onSendMessage}
                                    disabled={isLoading || isBootstrapping}
                                    sessionEnded={sessionCompleted}
                                    onStop={isBootstrapping ? undefined : onStopGeneration}
                                    currentTheme={currentTheme}
                                    onOpenVoiceSettings={() => setVoiceSettingsOpen(true)}
                                    transcribedText={transcribedText || undefined}
                                    onTranscribedTextClear={onTranscribedTextClear}
                                    standaloneLayout
                                    modelSelectionEnabled={modelSelectionEnabled}
                                    hideModelSelector={!!(modelSelectionEnabled && onModelChange)}
                                    selectedModel={selectedModel}
                                    availableModels={availableModels}
                                    modelsLoading={modelsLoading}
                                    onModelChange={onModelChange}
                                    contextUsage={contextUsage}
                                    fileShareEnabled={config.chat?.enableImageUpload ?? false}
                                />
                            </div>
                        </div>
                    </>
                ) : messages.length === 0 && !isLoading ? (
                    <main className="flex-1 flex flex-col items-center justify-center overflow-y-auto scrollbar-hide relative">
                        <WelcomeScreen
                            prompts={prompts}
                            onPromptClick={onPromptClick}
                            onSuggestionClick={onSendMessage}
                            branding={config.branding}
                            themeVersion2={config.theme_version_2}
                            suggestedPrompts={config.chat?.suggestedPrompts}
                        />
                        {sessionCompleted && isSessionCompletedUiEnabled(config.chat) && (
                            <div className="w-full max-w-5xl mx-auto px-4 pb-4 shrink-0">
                                <SessionCompletedBanner
                                    currentTheme={currentTheme}
                                    chatbotLogo={standaloneChatbotLogo}
                                    style={standaloneFontStyle}
                                    description={config.chat.sessionCompletedDescription}
                                    ctaEnabled={isSessionCompletedUiEnabled(config.chat)}
                                    ctaLabel={config.chat.sessionCompletedCtaLabel}
                                    ctaUrl={config.chat.sessionCompletedCtaUrl}
                                    ctaBackground={config.chat.sessionCompletedCtaBackground}
                                    ctaColor={config.chat.sessionCompletedCtaColor}
                                />
                            </div>
                        )}
                        {/* Enhanced Input Area - Centered vertically when no messages */}
                        <div className="w-full bg-background/95 backdrop-blur-xl pt-4 pb-8 flex flex-col items-center gap-2">
                            {bootstrapError && (
                                <div className="w-full max-w-3xl px-4">
                                    <div className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 bg-red-950/30 rounded border border-red-800">
                                        <span className="flex-1">{bootstrapError}</span>
                                        {onRetryBootstrap && (
                                            <button
                                                type="button"
                                                className="underline hover:no-underline shrink-0"
                                                onClick={onRetryBootstrap}
                                            >
                                                Retry
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                            <ChatInput
                                onSend={onSendMessage}
                                disabled={isLoading || isBootstrapping}
                                sessionEnded={sessionCompleted}
                                onStop={isBootstrapping ? undefined : onStopGeneration}
                                currentTheme={currentTheme}
                                onOpenVoiceSettings={() => setVoiceSettingsOpen(true)}
                                transcribedText={transcribedText || undefined}
                                onTranscribedTextClear={onTranscribedTextClear}
                                modelSelectionEnabled={modelSelectionEnabled}
                                hideModelSelector={!!(modelSelectionEnabled && onModelChange)}
                                selectedModel={selectedModel}
                                availableModels={availableModels}
                                modelsLoading={modelsLoading}
                                onModelChange={onModelChange}
                                contextUsage={contextUsage}
                                fileShareEnabled={config.chat?.enableImageUpload ?? false}
                            />
                        </div>
                    </main>
                ) : (
                    <>
                        <main className="flex-1 overflow-y-auto scrollbar-hide relative">
                            <div className="w-full max-w-5xl mx-auto px-4 py-6 md:py-8 space-y-3 mt-14 md:mt-0">
                                {messages.map((message) => (
                                    <ChatMessage
                                        key={message.id}
                                        message={message}
                                        currentTheme={currentTheme}
                                        brandName={config.branding?.name}
                                        chatbotLogo={standaloneChatbotLogo}
                                    />
                                ))}
                                {isLoading && (
                                    <div className="px-4 md:px-6 py-4 flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3 text-muted">
                                            <div className="flex items-center gap-1.5 px-2">
                                                <span
                                                    className="w-2 h-2 rounded-full bg-primary inline-block animate-dot-opacity"
                                                    style={{ animationDelay: '0ms' }}
                                                ></span>
                                                <span
                                                    className="w-2 h-2 rounded-full bg-primary inline-block animate-dot-opacity"
                                                    style={{ animationDelay: '200ms' }}
                                                ></span>
                                                <span
                                                    className="w-2 h-2 rounded-full bg-primary inline-block animate-dot-opacity"
                                                    style={{ animationDelay: '400ms' }}
                                                ></span>
                                            </div>
                                            <span className="text-sm font-medium">Thinking...</span>
                                        </div>
                                    </div>
                                )}
                                {sessionCompleted && isSessionCompletedUiEnabled(config.chat) && (
                                    <SessionCompletedBanner
                                        currentTheme={currentTheme}
                                        chatbotLogo={standaloneChatbotLogo}
                                        style={standaloneFontStyle}
                                        description={config.chat.sessionCompletedDescription}
                                        ctaEnabled={isSessionCompletedUiEnabled(config.chat)}
                                        ctaLabel={config.chat.sessionCompletedCtaLabel}
                                        ctaUrl={config.chat.sessionCompletedCtaUrl}
                                        ctaBackground={config.chat.sessionCompletedCtaBackground}
                                        ctaColor={config.chat.sessionCompletedCtaColor}
                                    />
                                )}
                                <div ref={messagesEndRef} />
                            </div>
                        </main>

                        {/* Enhanced Input Area - At bottom when messages exist */}
                        <div className="bg-background/95 backdrop-blur-xl pt-4 flex flex-col items-center gap-2">
                            {bootstrapError && (
                                <div className="w-full max-w-3xl px-4">
                                    <div className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 bg-red-950/30 rounded border border-red-800">
                                        <span className="flex-1">{bootstrapError}</span>
                                        {onRetryBootstrap && (
                                            <button
                                                type="button"
                                                className="underline hover:no-underline shrink-0"
                                                onClick={onRetryBootstrap}
                                            >
                                                Retry
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                            <ChatInput
                                onSend={onSendMessage}
                                disabled={isLoading || isBootstrapping}
                                sessionEnded={sessionCompleted}
                                onStop={isBootstrapping ? undefined : onStopGeneration}
                                currentTheme={currentTheme}
                                onOpenVoiceSettings={() => setVoiceSettingsOpen(true)}
                                transcribedText={transcribedText || undefined}
                                onTranscribedTextClear={onTranscribedTextClear}
                                modelSelectionEnabled={modelSelectionEnabled}
                                hideModelSelector={!!(modelSelectionEnabled && onModelChange)}
                                selectedModel={selectedModel}
                                availableModels={availableModels}
                                modelsLoading={modelsLoading}
                                onModelChange={onModelChange}
                                contextUsage={contextUsage}
                                fileShareEnabled={config.chat?.enableImageUpload ?? false}
                            />
                        </div>
                    </>
                )}
            </div>

            {/* Settings Panel */}
            {settingsOpen && (
                <SettingsPanel
                    isOpen={settingsOpen}
                    onClose={onCloseSettings}
                    isAuthenticated={settingsIsAuthenticated}
                    onExportChat={onExportChat}
                    onDeleteAllChats={onDeleteAllChats}
                    termsOfServiceUrl={termsOfServiceUrl}
                    privacyPolicyUrl={privacyPolicyUrl}
                    elevenLabsEnabled={elevenLabsEnabled}
                    onOpenVoiceSettings={() => setVoiceSettingsOpen(true)}
                />
            )}

            {/* Delete Confirmation Modal */}
            <ConfirmModal
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={() => {
                    onDeleteChat?.();
                    // Close sidebar on mobile after delete
                    if (window.innerWidth < 768) {
                        setSidebarOpen(false);
                    }
                }}
                title="Delete Chat"
                message="Are you sure you want to delete this chat? This action cannot be undone and all messages will be permanently removed."
                confirmText="Delete"
                cancelText="Cancel"
                variant="danger"
            />

            {/* Voice Settings Modal */}
            <VoiceSettingsModal
                isOpen={voiceSettingsOpen}
                onClose={() => setVoiceSettingsOpen(false)}
                currentTheme={currentTheme}
            />
        </div>
    );
}
