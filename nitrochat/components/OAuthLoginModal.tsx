'use client';

import { useEffect, useState } from 'react';
import { LogIn, X } from 'lucide-react';

interface OAuthLoginModalProps {
    isOpen: boolean;
    onClose: () => void;
    serverName: string;
    serverLogo?: string;
    onLogin: () => void;
    isLoading?: boolean;
}

export function OAuthLoginModal({
    isOpen,
    onClose,
    serverName,
    serverLogo,
    onLogin,
    isLoading = false,
}: OAuthLoginModalProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted || !isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-[var(--color-card)] border border-white/10 rounded-lg shadow-2xl max-w-md w-full mx-4 overflow-hidden">
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/5 transition-colors text-muted hover:text-white"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Content */}
                <div className="p-8 text-center">
                    {/* Server Logo */}
                    {serverLogo ? (
                        <div className="mb-6 flex justify-center">
                            <img
                                src={serverLogo}
                                alt={serverName}
                                className="h-20 w-20 object-contain rounded-md"
                            />
                        </div>
                    ) : (
                        <div className="mb-6 flex justify-center">
                            <div className="h-20 w-20 rounded-md bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                                <span className="text-3xl font-medium text-white">
                                    {serverName.charAt(0).toUpperCase()}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Title */}
                    <h2 className="text-2xl font-medium mb-2">Authentication Required</h2>
                    <p className="text-muted mb-8">
                        {serverName} requires OAuth 2.1 authentication to access its services.
                    </p>

                    {/* Login Button */}
                    <button
                        onClick={onLogin}
                        disabled={isLoading}
                        className="w-full flex items-center justify-center gap-3 px-6 py-3 rounded-lg bg-primary hover:bg-primary/90 text-white font-medium transition-colors shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? (
                            <>
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full opacity-50" />
                                <span>Connecting...</span>
                            </>
                        ) : (
                            <>
                                <LogIn className="w-5 h-5" />
                                <span>Login with OAuth</span>
                            </>
                        )}
                    </button>

                    {/* Info */}
                    <p className="text-xs text-muted mt-6">
                        You will be redirected to the authentication server to complete the login process.
                    </p>
                </div>
            </div>
        </div>
    );
}
