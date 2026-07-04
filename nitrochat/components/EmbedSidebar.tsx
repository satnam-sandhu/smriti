'use client';

import { X, Loader2 } from 'lucide-react';
import { useRef } from 'react';

interface Chat {
    _id: string;
    title?: string;
    messages?: any[];
    createdAt: string;
    updatedAt: string;
}

interface EmbedSidebarProps {
    isOpen: boolean;
    onClose: () => void;
    chats: Chat[];
    currentChatId: string | null;
    onSelectChat: (id: string) => void;
    loading?: boolean;
    hasMore?: boolean;
    loadingMore?: boolean;
    onLoadMore?: () => void;
}

export function EmbedSidebar({
    isOpen,
    onClose,
    chats,
    currentChatId,
    onSelectChat,
    loading = false,
    hasMore = false,
    loadingMore = false,
    onLoadMore
}: EmbedSidebarProps) {
    const chatsContainerRef = useRef<HTMLDivElement>(null);
    
    if (!isOpen) return null;

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        return date.toLocaleDateString();
    };

    const getChatTitle = (chat: Chat) => {
        if (chat.title) return chat.title;
        const firstUserMessage = chat.messages?.find(m => m.role === 'user');
        if (firstUserMessage) {
            return firstUserMessage.content.slice(0, 50) + (firstUserMessage.content.length > 50 ? '...' : '');
        }
        return 'New Chat';
    };

    return (
        <>
            {/* Overlay */}
            <div
                className="fixed inset-0 bg-black/50 z-40"
                onClick={onClose}
            />

            {/* Sidebar */}
            <div className="fixed right-0 top-0 bottom-0 w-64 bg-background border-l border-border z-50 flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h2 className="font-normal text-sm">Chat History</h2>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-muted rounded transition-colors"
                        aria-label="Close sidebar"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Chat List */}
                <div 
                    ref={chatsContainerRef}
                    className="flex-1 overflow-y-auto"
                    onScroll={(e) => {
                        const target = e.currentTarget;
                        const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
                        
                        // Load more when within 100px of bottom
                        if (scrollBottom < 100 && hasMore && !loadingMore && onLoadMore) {
                            onLoadMore();
                        }
                    }}
                >
                    {loading && chats.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                            <div className="opacity-50">Loading chats...</div>
                        </div>
                    ) : chats.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                            No chat history yet
                        </div>
                    ) : (
                        <div className="p-2 space-y-1">
                            {chats.map((chat) => (
                                <button
                                    key={chat._id}
                                    onClick={() => onSelectChat(chat._id)}
                                    className={`w-full text-left p-3 rounded-lg transition-colors ${currentChatId === chat._id
                                        ? 'bg-primary/10 border border-primary/20'
                                        : 'hover:bg-muted'
                                        }`}
                                >
                                    <div className="font-medium text-sm truncate">
                                        {getChatTitle(chat)}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1">
                                        {formatDate(chat.updatedAt)}
                                    </div>
                                    {chat.messages && (
                                        <div className="text-xs text-muted-foreground">
                                            {chat.messages.length} messages
                                        </div>
                                    )}
                                </button>
                            ))}
                            
                            {/* Loading indicator for infinite scroll */}
                            {loadingMore && (
                                <div className="flex items-center justify-center p-4">
                                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
