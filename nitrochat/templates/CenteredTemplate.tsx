'use client';

import { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '@/components/ChatMessage';
import { ChatInput } from '@/components/ChatInput';
import { WelcomeScreen } from '@/components/WelcomeScreen';
import { SettingsPanel } from '@/components/SettingsPanel';
import { Settings, Plus, Download, Trash2 } from 'lucide-react';
import { ChatMessage as ChatMessageType, McpPrompt } from '@/lib/store';
import { NitroChatConfig } from '@/nitrochat.config';
import { useChatStore } from '@/lib/store';
import { getCustomLogoUrlForSurface, getRuntimeThemeSurface, resolveStandaloneChatbotLogo } from '@/lib/theme-runtime';

interface CenteredTemplateProps {
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

export function CenteredTemplate({
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
}: CenteredTemplateProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const { exportChat, clearMessages } = useChatStore();
    const chatbotLogo = resolveStandaloneChatbotLogo(config, getRuntimeThemeSurface(config));

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div className="flex flex-col h-screen bg-background text-foreground">
            {/* Minimal Header */}
            <header className="fixed top-0 left-0 right-0 h-14 bg-background/80 backdrop-blur-md border-b border-white/5 flex items-center justify-center px-4 z-30">
                <div className="flex items-center gap-2">
                    {(() => {
                        const customLogo = getCustomLogoUrlForSurface(config, getRuntimeThemeSurface(config));
                        return customLogo ? (
                            <img src={customLogo} alt={config.branding?.name || 'NitroChat'} className="h-6 object-contain" />
                        ) : (
                            <span className="font-normal text-sm">{config.branding?.name || 'NitroChat'}</span>
                        );
                    })()}
                </div>
            </header>

            {/* Chat Area - Centered */}
            <main className="flex-1 overflow-y-auto scrollbar-hide pt-14">
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
                    <div className="max-w-3xl mx-auto px-4 py-6 md:py-8 space-y-3">
                        {/* Action Buttons - Centered */}
                        <div className="flex items-center justify-center gap-2 pb-4 border-b border-white/5">
                            <button
                                onClick={onNewChat}
                                className="p-2 rounded-lg hover:bg-foreground/5 transition-colors"
                                title="New Chat"
                            >
                                <Plus className="w-4 h-4" style={{ color: 'var(--color-foreground)' }} />
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
                                }}
                                className="p-2 rounded-lg hover:bg-foreground/5 transition-colors"
                                title="Download Chat"
                            >
                                <Download className="w-4 h-4" style={{ color: 'var(--color-foreground)' }} />
                            </button>
                            <button
                                onClick={() => {
                                    if (confirm('Are you sure you want to delete this chat? This cannot be undone.')) {
                                        clearMessages();
                                    }
                                }}
                                className="p-2 rounded-lg hover:bg-foreground/5 transition-colors"
                                title="Delete Chat"
                            >
                                <Trash2 className="w-4 h-4" style={{ color: 'var(--color-foreground)' }} />
                            </button>
                            <button
                                onClick={onOpenSettings}
                                className="p-2 rounded-lg hover:bg-foreground/5 transition-colors"
                                title="Settings"
                            >
                                <Settings className="w-5 h-5" style={{ color: 'var(--color-foreground)' }} />
                            </button>
                        </div>

                        {messages.map((message) => (
                            <ChatMessage
                                key={message.id}
                                message={message}
                                brandName={config.branding?.name}
                                chatbotLogo={chatbotLogo}
                            />
                        ))}
                        {isLoading && (
                            <div className="flex items-center justify-center py-8">
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

            {/* Input Area - Centered */}
            <div className="border-t border-white/5 bg-background/95 backdrop-blur-sm pb-6 pt-4">
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
