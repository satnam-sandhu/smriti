'use client';

import { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '@/components/ChatMessage';
import { ChatInput } from '@/components/ChatInput';
import { WelcomeScreen } from '@/components/WelcomeScreen';
import { SettingsPanel } from '@/components/SettingsPanel';
import { Settings, Plus, MessageSquare, ChevronUp, Download, Trash2 } from 'lucide-react';
import { ChatMessage as ChatMessageType, McpPrompt, useChatStore } from '@/lib/store';
import { NitroChatConfig } from '@/nitrochat.config';
import { getCustomLogoUrlForSurface, getRuntimeThemeSurface, resolveStandaloneChatbotLogo } from '@/lib/theme-runtime';

interface CompactTemplateProps {
    config: NitroChatConfig;
    messages: ChatMessageType[];
    isLoading: boolean;
    settingsOpen: boolean;
    prompts: McpPrompt[];
    onSendMessage: (content: string) => void;
    onPromptClick: (prompt: McpPrompt) => void;
    onNewChat: () => void;
    onOpenSettings: () => void;
    onCloseSettings: () => void;
}

export function CompactTemplate({
    config,
    messages,
    isLoading,
    settingsOpen,
    prompts,
    onSendMessage,
    onPromptClick,
    onNewChat,
    onOpenSettings,
    onCloseSettings,
}: CompactTemplateProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const { exportChat, clearMessages } = useChatStore();
    const chatbotLogo = resolveStandaloneChatbotLogo(config, getRuntimeThemeSurface(config));

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div className="flex flex-col h-screen bg-background text-foreground relative">
            {/* Floating Action Button - Bottom Right */}
            <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="fixed bottom-20 right-4 z-50 w-12 h-12 rounded-full bg-primary shadow-lg shadow-primary/30 flex items-center justify-center text-white transition-colors duration-150"
            >
                <ChevronUp className={`w-5 h-5 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Bottom Sheet Menu */}
            <div
                className={`fixed bottom-0 left-0 right-0 bg-[var(--color-sidebar)] border-t border-white/10 z-40 ${menuOpen ? 'translate-y-0' : 'translate-y-full'
                    }`}
            >
                <div className="p-4 space-y-3 max-h-64 overflow-y-auto">
                    <button
                        onClick={() => { onNewChat(); setMenuOpen(false); }}
                        className="w-full flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                    >
                        <Plus className="w-5 h-5 text-primary" />
                        <span className="font-medium">New Chat</span>
                    </button>
                    <button
                        onClick={() => {
                            const chatData = exportChat();
                            const blob = new Blob([chatData], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `chat-${new Date().toISOString().split('T')[0]}.json`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                            setMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                    >
                        <Download className="w-5 h-5 text-muted" />
                        <span className="font-medium">Download Chat</span>
                    </button>
                    <button
                        onClick={() => {
                            if (confirm('Are you sure you want to delete this chat? This cannot be undone.')) {
                                clearMessages();
                                setMenuOpen(false);
                            }
                        }}
                        className="w-full flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                    >
                        <Trash2 className="w-5 h-5 text-muted" />
                        <span className="font-medium">Delete Chat</span>
                    </button>
                    <button
                        onClick={() => { onOpenSettings(); setMenuOpen(false); }}
                        className="w-full flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                    >
                        <Settings className="w-5 h-5 text-muted" />
                        <span className="font-medium">Settings</span>
                    </button>
                </div>
            </div>

            {/* Overlay */}
            {menuOpen && (
                <div
                    onClick={() => setMenuOpen(false)}
                    className="fixed inset-0 bg-black/50 z-30"
                />
            )}

            {/* Minimal Top Bar */}
            <header className="h-10 bg-background/80 backdrop-blur-md border-b border-white/5 flex items-center justify-center px-3">
                <div className="flex items-center gap-2">
                    {(() => {
                        const customLogo = getCustomLogoUrlForSurface(config, getRuntimeThemeSurface(config));
                        return customLogo ? (
                            <img src={customLogo} alt={config.branding?.name || 'NitroChat'} className="h-5 object-contain" />
                        ) : (
                            <MessageSquare className="w-4 h-4 text-primary" />
                        );
                    })()}
                    <span className="font-normal text-xs">{config.branding?.name || 'NitroChat'}</span>
                </div>
            </header>

            {/* Chat Area - Full Height */}
            <main className="flex-1 overflow-y-auto scrollbar-hide pb-16">
                {messages.length === 0 && !isLoading ? (
                    <WelcomeScreen
                        prompts={prompts}
                        onPromptClick={onPromptClick}
                        onSuggestionClick={onSendMessage}
                        branding={config.branding}
                            themeVersion2={config.theme_version_2}
                        suggestedPrompts={config.chat?.suggestedPrompts}
                    />
                ) : (
                    <div className="px-3 py-4 space-y-4">
                        {messages.map((message) => (
                            <ChatMessage
                                key={message.id}
                                message={message}
                                brandName={config.branding?.name}
                                chatbotLogo={chatbotLogo}
                            />
                        ))}
                        {isLoading && (
                            <div className="flex items-center justify-center py-6">
                                <div className="flex items-center gap-2 text-muted">
                                    <div className="w-2 h-2 bg-primary rounded-full animate-dot-opacity" style={{ animationDelay: '0ms' }}></div>
                                    <div className="w-2 h-2 bg-primary rounded-full animate-dot-opacity" style={{ animationDelay: '200ms' }}></div>
                                    <div className="w-2 h-2 bg-primary rounded-full animate-dot-opacity" style={{ animationDelay: '400ms' }}></div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                )}
            </main>

            {/* Compact Input - Fixed Bottom */}
            <div className="border-t border-white/5 bg-background/95 backdrop-blur-sm pb-2 pt-2 px-2">
                <ChatInput
                    onSend={onSendMessage}
                    disabled={isLoading}
                    fileShareEnabled={config.chat?.enableImageUpload ?? false}
                />
            </div>

            {/* Settings Panel */}
            {settingsOpen && (
                <SettingsPanel
                    isOpen={settingsOpen}
                    onClose={onCloseSettings}
                />
            )}
        </div>
    );
}
