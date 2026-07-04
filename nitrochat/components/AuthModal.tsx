'use client';

import { X } from 'lucide-react';

interface AuthModalProps {
    isOpen: boolean;
    onAuthenticate: () => void;
    onCancel: () => void;
    serverName: string;
    primaryColor?: string;
}

export function AuthModal({ isOpen, onAuthenticate, onCancel, serverName, primaryColor = '#ffe500' }: AuthModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-card border border-border rounded-lg max-w-sm w-full p-6 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-normal">Authentication Required</h2>
                    <button
                        onClick={onCancel}
                        className="p-1 hover:bg-foreground/10 rounded transition-colors"
                        aria-label="Close"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <p className="text-sm text-muted mb-6">
                    Please authenticate with <span className="font-medium text-foreground">{serverName}</span> to continue chatting.
                </p>

                <div className="flex gap-3">
                    <button
                        onClick={onAuthenticate}
                        className="flex-1 px-4 py-2 rounded-lg font-medium transition-colors duration-150"
                        style={{
                            backgroundColor: primaryColor,
                            color: '#000'
                        }}
                    >
                        Authenticate
                    </button>
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 rounded-lg border border-border hover:bg-foreground/5 transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}
