'use client';

import { MessageSquare, MessageSquarePlus, MessageCircle, Search, Settings, User, PanelLeftClose, PanelLeftOpen, Download, Trash2, LayoutPanelLeft, LogOut, Loader2, BetweenHorizonalEnd, BetweenHorizonalStart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect, useRef } from 'react';
import { useChatStore } from '@/lib/store';
import { getConfig } from '@/nitrochat.config';
import {
    fallbackStandaloneChatbotLogo,
    getCustomLogoUrlForSurface,
    resolveBrandingFaviconForSurface,
    withMergedRuntimeTheme,
    type ThemeSurface,
} from '@/lib/theme-runtime';
import type { ThemeV2 } from '@/lib/theme-runtime';

interface SidebarProps {
    isOpen: boolean;
    onToggle: () => void;
    onNewChat: () => void;
    onOpenSettings: () => void;
    /** When false, Settings button is hidden (no User/Voice/Model sections apply). */
    showSettings?: boolean;
    onLogout?: () => void;
    onDeleteChat?: () => void;
    chats?: { _id: string; title: string }[];
    onSelectChat?: (id: string) => void;
    currentChatId?: string | null;
    persistenceEnabled?: boolean;
    isCollapsed?: boolean;
    onCollapseToggle?: () => void;
    chatPage?: number;
    hasMoreChats?: boolean;
    loadingChats?: boolean;
    onLoadMore?: () => void;
    currentTheme?: 'dark' | 'light';
}

export function Sidebar({ isOpen, onToggle, onNewChat, onOpenSettings, showSettings = true, onLogout, onDeleteChat, chats, onSelectChat, currentChatId, persistenceEnabled, isCollapsed = false, onCollapseToggle, chatPage = 1, hasMoreChats = false, loadingChats = false, onLoadMore, currentTheme }: SidebarProps) {
    const [config, setConfig] = useState<{
        branding: { name: string; logo?: string | null; favicon?: string | null; faviconDark?: string | null; faviconLight?: string | null };
        theme_version_2?: ThemeV2 | null;
    }>({
        branding: { name: 'NitroChat', logo: null, favicon: null, faviconDark: null, faviconLight: null },
        theme_version_2: null,
    });
    const { exportChat, clearMessages } = useChatStore();
    const chatsContainerRef = useRef<HTMLDivElement>(null);
    const loadMoreTriggeredRef = useRef(false);

    useEffect(() => {
        fetch('/api/config')
            .then((res) => res.json())
            .then((data) => setConfig(withMergedRuntimeTheme(getConfig(), data)))
            .catch((err) => console.error('Failed to fetch config:', err));
    }, []);

    return (
        <>
            {/* Mobile Overlay - Removed to prevent grey shadow */}

            {/* Enhanced Sidebar Container */}
            <div
                className={cn(
                    "fixed md:static inset-y-0 left-0 z-40 flex flex-col group",
                    "bg-[var(--color-sidebar)] backdrop-blur-xl",
                    "transition-all duration-300 ease-in-out",
                    // Mobile: completely hidden when closed, full width when open, no border or shadow on right
                    isOpen ? "w-[240px] translate-x-0" : "w-0 -translate-x-full border-r-0 overflow-hidden pointer-events-none",
                    // Desktop: respect collapsed state with smooth transition, add border
                    "md:w-[240px] md:translate-x-0 md:border-r md:border-border/50 md:overflow-visible md:pointer-events-auto md:transition-all md:duration-300 md:ease-in-out",
                    isCollapsed && "md:w-[70px]"
                )}
                style={{
                    ['--color-sidebar' as any]: 'var(--color-header-bg)',
                    ['--color-foreground' as any]: 'var(--color-header-text)',
                    ['--color-muted' as any]: 'var(--color-header-subtext)',
                    ['--color-muted-foreground' as any]: 'var(--color-header-subtext)',
                }}
            >
                {/* Enhanced Branding Header */}
                <div className={cn(
                    "p-5 flex items-center border-b border-border/50 relative",
                    "bg-[var(--color-sidebar)] md:bg-card/30",
                    "transition-all duration-300 ease-in-out",
                    isCollapsed ? "justify-center p-3" : "justify-between gap-3"
                )}>
                    {/* Favicon/Logo - Hidden when collapsed and hovered, shown when open */}
                    <div className={cn(
                        "flex items-center gap-3 transition-all duration-300 ease-in-out",
                        isCollapsed && "group-hover:opacity-0 group-hover:invisible"
                    )}>
                        {(() => {
                            const surface: ThemeSurface = currentTheme === 'dark' ? 'dark' : 'light';

                            const customLogo = getCustomLogoUrlForSurface(config, surface);
                            const logo =
                                customLogo ||
                                resolveBrandingFaviconForSurface(config.branding, surface) ||
                                fallbackStandaloneChatbotLogo(surface);

                            return (
                                <div
                                    className={cn(
                                        'flex shrink-0 items-center justify-center',
                                        isCollapsed ? 'h-8 w-8' : 'h-9 w-9'
                                    )}
                                >
                                    <img
                                        src={logo}
                                        alt={config.branding.name}
                                        className={cn(
                                            'max-h-full max-w-full object-contain transition-all duration-300 ease-in-out',
                                            isCollapsed ? 'h-6 w-6' : 'h-7 w-7'
                                        )}
                                    />
                                </div>
                            );
                        })()}
                    </div>
                    {/* Collapse Toggle Button - Always visible when open, visible on hover when collapsed */}
                    {onCollapseToggle && (
                        <button
                            onClick={onCollapseToggle}
                            className={cn(
                                "p-1.5 rounded-md",
                                "bg-card/90 backdrop-blur-sm",
                                "shadow-sm",
                                "transition-all duration-300 ease-in-out",
                                "hidden md:flex items-center justify-center",
                                isCollapsed ? "opacity-0 group-hover:opacity-100" : "opacity-100",
                                isCollapsed ? "absolute inset-0 m-auto z-10" : "relative"
                            )}
                            style={{ color: 'var(--color-header-text)' }}
                            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                        >
                            {isCollapsed ? (
                                <BetweenHorizonalStart className="w-5 h-5 transition-all duration-300" />
                            ) : (
                                <BetweenHorizonalEnd className="w-5 h-5 transition-all duration-300" />
                            )}
                        </button>
                    )}
                </div>

                {/* Enhanced New Chat Button */}
                {persistenceEnabled && (
                    <div className={cn(
                        "p-3 border-b border-border/50 transition-all duration-300 ease-in-out",
                        isCollapsed && "p-2"
                    )}>
                        <button
                            onClick={onNewChat}
                            className={cn(
                                "w-full flex items-center rounded-md",
                                "bg-gradient-to-r from-primary/20 to-accent/20",
                                "hover:from-primary/30 hover:to-accent/30",
                                "text-foreground font-medium transition-all duration-300 ease-in-out",
                                "border border-primary/30",
                                isCollapsed ? "justify-center p-2" : "gap-3 px-4 py-3"
                            )}
                            title={isCollapsed ? "New Chat" : undefined}
                        >
                            <MessageCircle className={cn(isCollapsed ? "w-4 h-4" : "w-4 h-4")} />
                            <span className={cn(
                                "text-sm transition-all duration-300 ease-in-out overflow-hidden",
                                isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100 ml-0"
                            )}>New Chat</span>
                        </button>
                    </div>
                )}

                {/* Enhanced Recent Chats - below New Chat */}
                {!isCollapsed && (
                    <div
                        ref={chatsContainerRef}
                        className="border-t border-border/50 p-3 overflow-y-auto min-h-0"
                        onScroll={(e) => {
                            const target = e.currentTarget;
                            const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight;

                            // Load more when within 200px of bottom (increased threshold for better UX)
                            if (scrollBottom < 200 && hasMoreChats && !loadingChats && onLoadMore && !loadMoreTriggeredRef.current) {
                                loadMoreTriggeredRef.current = true;
                                onLoadMore();
                                // Reset flag after a delay to allow next load
                                setTimeout(() => {
                                    loadMoreTriggeredRef.current = false;
                                }, 1000);
                            }
                        }}
                    >
                        {!isCollapsed && (
                            <h3
                                className="px-3 text-xs font-medium uppercase tracking-wider mb-3"
                                style={{ color: 'var(--color-header-text)' }}
                            >
                                Recent Chats
                            </h3>
                        )}
                        <div className="space-y-1">
                            {chats && chats.length > 0 ? (
                                chats.map((chat) => (
                                    <button
                                        key={chat._id}
                                        onClick={() => onSelectChat?.(chat._id)}
                                        className={cn(
                                            "w-full rounded-none",
                                            "hover:bg-white/5 text-sm transition-colors duration-150",
                                            "flex items-center",
                                            currentChatId === chat._id
                                                ? currentTheme === 'light'
                                                    ? "bg-black/10 text-black border-l-2 border-accent shadow-sm"
                                                    : "bg-white/10 text-white border-l-2 border-accent shadow-sm"
                                                : "text-muted hover:text-foreground",
                                            isCollapsed
                                                ? "justify-center p-2"
                                                : "text-left px-3 py-2.5 gap-2 truncate"
                                        )}
                                        title={isCollapsed ? (chat.title || 'Untitled Chat') : undefined}
                                    >
                                        {isCollapsed && (
                                            <MessageSquare className={cn(
                                                "shrink-0 w-5 h-5",
                                                currentChatId === chat._id ? "text-accent" : "opacity-50"
                                            )} />
                                        )}
                                        {!isCollapsed && (
                                            <span className="truncate">{chat.title || 'Untitled Chat'}</span>
                                        )}
                                    </button>
                                ))
                            ) : (
                                !isCollapsed && !loadingChats && (
                                    <div
                                        className="px-3 py-2 text-sm italic"
                                        style={{ color: 'var(--color-header-subtext)' }}
                                    >
                                        No recent chats
                                    </div>
                                )
                            )}
                        </div>

                        {/* Infinite Scroll Loader */}
                        {loadingChats && (
                            <div className="flex items-center justify-center py-4">
                                <Loader2
                                    className="w-4 h-4 animate-spin"
                                    style={{ color: 'var(--color-header-subtext)', opacity: 0.6 }}
                                />
                            </div>
                        )}
                    </div>
                )}

                {!isCollapsed && <div className="flex-1" />}

                {/* Footer - Settings & Logout */}
                <div className="border-t border-border/50 p-3 space-y-1 mt-auto">
                    {showSettings && (
                        <button
                            onClick={onOpenSettings}
                            className={cn(
                                "w-full flex items-center rounded-md",
                                "hover:bg-primary/10 text-muted hover:text-primary",
                                "transition-all duration-300 ease-in-out border border-transparent",
                                "hover:border-primary/20",
                                isCollapsed ? "justify-center p-2" : "gap-3 px-3 py-2.5"
                            )}
                            title={isCollapsed ? "Settings" : undefined}
                        >
                            <Settings className="w-4 h-4" />
                            <span className={cn(
                                "text-sm font-medium transition-all duration-300 ease-in-out overflow-hidden",
                                isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"
                            )}>Settings</span>
                        </button>
                    )}
                    {onLogout && (
                        <button
                            onClick={onLogout}
                            className={cn(
                                "w-full flex items-center rounded-md",
                                "hover:bg-white/5 text-muted hover:text-white",
                                "transition-all duration-300 ease-in-out",
                                isCollapsed ? "justify-center p-2" : "gap-3 px-3 py-2.5"
                            )}
                            title={isCollapsed ? "Logout" : undefined}
                        >
                            <LogOut className="w-4 h-4" />
                            <span className={cn(
                                "text-sm font-medium transition-all duration-300 ease-in-out overflow-hidden",
                                isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"
                            )}>Logout</span>
                        </button>
                    )}
                </div>

            </div >
        </>
    );
}
