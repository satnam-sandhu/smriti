'use client';

import { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '@/components/ChatMessage';
import { ChatInput } from '@/components/ChatInput';
import { WelcomeScreen } from '@/components/WelcomeScreen';
import { SettingsPanel } from '@/components/SettingsPanel';
import { Settings, Sparkles, Wrench, FileText, LogOut } from 'lucide-react';
import { ChatMessage as ChatMessageType, McpPrompt } from '@/lib/store';
import { NitroChatConfig } from '@/nitrochat.config';
import { getCustomLogoUrlForSurface, getRuntimeThemeSurface, resolveStandaloneChatbotLogo } from '@/lib/theme-runtime';

interface SplitViewTemplateProps {
    config: NitroChatConfig;
    messages: ChatMessageType[];
    isLoading: boolean;
    settingsOpen: boolean;
    prompts: McpPrompt[];
    tools: any[];
    resources: any[];
    onSendMessage: (content: string) => void;
    onPromptClick: (prompt: McpPrompt) => void;
    onNewChat: () => void;
    onOpenSettings: () => void;
    onCloseSettings: () => void;
    onLogout?: () => void;
}

export function SplitViewTemplate({
    config,
    messages,
    isLoading,
    settingsOpen,
    prompts,
    tools,
    resources,
    onSendMessage,
    onPromptClick,
    onNewChat,
    onOpenSettings,
    onCloseSettings,
    onLogout,
}: SplitViewTemplateProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [activeTab, setActiveTab] = useState<'prompts' | 'tools' | 'resources'>('prompts');
    const chatbotLogo = resolveStandaloneChatbotLogo(config, getRuntimeThemeSurface(config));

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div className="flex h-screen bg-background text-foreground">
            {/* Left: Chat Area */}
            <div className="flex-1 flex flex-col border-r border-white/5">
                {/* Header */}
                <header className="h-14 bg-background/80 backdrop-blur-md border-b border-white/5 flex items-center justify-between px-4">
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
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onOpenSettings}
                            className="p-2 rounded-lg hover:bg-foreground/5 text-foreground/70 hover:text-foreground transition-colors"
                            title="Settings"
                        >
                            <Settings className="w-5 h-5" />
                        </button>
                        {onLogout && (
                            <button
                                onClick={onLogout}
                                className="p-2 rounded-lg hover:bg-foreground/5 text-foreground/70 hover:text-foreground transition-colors"
                                title="Logout"
                            >
                                <LogOut className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                </header>

                {/* Chat Messages */}
                <main className="flex-1 overflow-y-auto scrollbar-hide">
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
                        <div className="px-4 py-6 space-y-3">
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

                {/* Input */}
                <div className="border-t border-white/5 bg-background/95 backdrop-blur-sm pb-4 pt-4 px-4">
                    <ChatInput
                        onSend={onSendMessage}
                        disabled={isLoading}
                        fileShareEnabled={config.chat?.enableImageUpload ?? false}
                    />
                </div>
            </div>

            {/* Right: Tools Panel - 30% of screen width, responsive */}
            <div className="hidden md:flex md:w-[30%] lg:w-[28%] xl:w-[25%] flex-col bg-[var(--color-sidebar)] border-l border-white/5 min-w-[200px] max-w-[350px]">
                {/* Tabs */}
                <div className="flex border-b border-white/5">
                    <button
                        onClick={() => setActiveTab('prompts')}
                        className={`flex-1 px-2 py-2 text-[10px] font-medium transition-colors ${activeTab === 'prompts' ? 'text-foreground border-b-2 border-primary' : 'text-muted hover:text-foreground'
                            }`}
                    >
                        <Sparkles className="w-3 h-3 mx-auto mb-0.5" />
                        <div>Prompts</div>
                    </button>
                    <button
                        onClick={() => setActiveTab('tools')}
                        className={`flex-1 px-2 py-2 text-[10px] font-medium transition-colors ${activeTab === 'tools' ? 'text-foreground border-b-2 border-primary' : 'text-muted hover:text-foreground'
                            }`}
                    >
                        <Wrench className="w-3 h-3 mx-auto mb-0.5" />
                        <div>Tools</div>
                    </button>
                    <button
                        onClick={() => setActiveTab('resources')}
                        className={`flex-1 px-2 py-2 text-[10px] font-medium transition-colors ${activeTab === 'resources' ? 'text-foreground border-b-2 border-primary' : 'text-muted hover:text-foreground'
                            }`}
                    >
                        <FileText className="w-3 h-3 mx-auto mb-0.5" />
                        <div>Resources</div>
                    </button>
                </div>

                {/* Content - Scrollable with vertical margins */}
                <div className="flex-1 overflow-y-auto p-2">
                    {activeTab === 'prompts' && prompts.map((prompt) => (
                        <button
                            key={prompt.name}
                            onClick={() => onPromptClick(prompt)}
                            className="block p-2 my-2 rounded-md bg-white/5 hover:bg-white/10 transition-colors text-left w-full"
                        >
                            <div className="font-medium text-[11px] leading-tight">{prompt.name}</div>
                            {prompt.description && (
                                <div className="text-[9px] text-muted mt-0.5 line-clamp-2 leading-tight">{prompt.description}</div>
                            )}
                        </button>
                    ))}
                    {activeTab === 'tools' && tools.map((tool) => (
                        <div key={tool.name} className="block p-2 my-2 rounded-md bg-white/5 w-full">
                            <div className="font-medium text-[11px] leading-tight">{tool.name}</div>
                            {tool.description && (
                                <div className="text-[9px] text-muted mt-0.5 line-clamp-2 leading-tight">{tool.description}</div>
                            )}
                        </div>
                    ))}
                    {activeTab === 'resources' && resources.map((resource) => (
                        <div key={resource.uri} className="block p-2 my-2 rounded-md bg-white/5 w-full">
                            <div className="font-medium text-[11px] truncate leading-tight">{resource.name}</div>
                            {resource.description && (
                                <div className="text-[9px] text-muted mt-0.5 line-clamp-2 leading-tight">{resource.description}</div>
                            )}
                        </div>
                    ))}
                </div>
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
