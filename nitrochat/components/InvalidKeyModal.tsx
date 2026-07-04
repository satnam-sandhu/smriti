'use client';

import { X, ShieldAlert, ArrowRight, Lock, Key, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InvalidKeyModalProps {
    isOpen: boolean;
    onClose: () => void;
    message?: string;
}

export function InvalidKeyModal({
    isOpen,
    onClose,
    message = "The provided API key is either invalid, expired, or has been revoked. Please check your configuration."
}: InvalidKeyModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 backdrop-blur-md bg-black/60 animate-in fade-in duration-300">
            <div
                className={cn(
                    "relative w-full max-w-lg overflow-hidden rounded-3xl",
                    "bg-[#0f0f0f] border border-red-500/20",
                    "shadow-[0_0_50px_-12px_rgba(239,68,68,0.15)]",
                    "flex flex-col",
                    "animate-in zoom-in-95 slide-in-from-bottom-4 duration-500 ease-out"
                )}
            >
                {/* Background Accents */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[300px] bg-red-500/10 blur-[100px] rounded-full pointer-events-none" />
                <div className="absolute -bottom-24 -right-24 w-[200px] h-[200px] bg-red-500/5 blur-[80px] rounded-full pointer-events-none" />

                {/* Header/Banner */}
                <div className="relative h-32 flex items-center justify-center overflow-hidden bg-gradient-to-b from-red-500/[0.03] to-transparent">
                    {/* Animated Ring Decor */}
                    <div className="absolute w-[200px] h-[200px] border border-red-500/10 rounded-full animate-pulse" />
                    <div className="absolute w-[140px] h-[140px] border border-red-500/20 rounded-full" />

                    <div className="relative z-10 w-20 h-20 rounded-2xl bg-gradient-to-br from-red-500/20 via-red-500/10 to-transparent border border-red-500/20 flex items-center justify-center shadow-2xl shadow-red-500/20">
                        <ShieldAlert className="w-10 h-10 text-red-500 fill-red-500/10" />
                    </div>
                </div>

                {/* Content */}
                <div className="relative px-8 pb-10 pt-6 text-center space-y-6">
                    <div className="space-y-2">
                        <h2 className="text-3xl font-bold text-foreground tracking-tight">
                            Access Denied
                        </h2>
                        <p className="text-muted/60 text-sm max-w-[340px] mx-auto leading-relaxed">
                            {message}
                        </p>
                    </div>

                    {/* Alert Details */}
                    <div className="bg-red-500/[0.03] border border-red-500/10 rounded-2xl p-5 space-y-3">
                        <div className="flex items-center gap-3 text-left">
                            <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
                                <Lock className="w-4 h-4 text-red-500" />
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-foreground">Secure Connection Required</p>
                                <p className="text-[10px] text-muted/50">Verify your gateway credentials in settings.</p>
                            </div>
                        </div>
                        <div className="h-[1px] w-full bg-red-500/10" />
                        <div className="flex items-center gap-3 text-left">
                            <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
                                <Key className="w-4 h-4 text-red-500" />
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-foreground">Authentication Failure</p>
                                <p className="text-[10px] text-muted/50">The provided NitroChat API key is no longer active.</p>
                            </div>
                        </div>
                    </div>

                    {/* Action Button */}
                    <div className="pt-4 flex flex-col gap-3">
                        <button
                            onClick={onClose}
                            className={cn(
                                "group relative w-full h-12 rounded-xl flex items-center justify-center font-semibold text-sm transition-all overflow-hidden",
                                "bg-foreground text-background hover:scale-[1.02] active:scale-[0.98]",
                                "shadow-xl"
                            )}
                        >
                            <div className="absolute inset-x-0 bottom-0 h-[100%] bg-white/10 -translate-y-[100%] group-hover:translate-y-0 transition-transform duration-500 ease-in-out pointer-events-none" />
                            <span className="relative flex items-center gap-2">
                                Check Configuration
                                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                            </span>
                        </button>
                        <div className="flex items-center justify-center gap-2 text-[10px] text-muted/30">
                            <RefreshCw className="w-3 h-3" />
                            <span>Reload to use public features</span>
                        </div>
                    </div>
                </div>

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 p-2 rounded-full bg-white/[0.03] border border-white/[0.08] text-muted/30 hover:text-foreground hover:bg-white/[0.08] transition-all"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
