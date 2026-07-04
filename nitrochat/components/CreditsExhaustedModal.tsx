'use client';

import { X, Zap, ArrowRight, ShieldAlert, CreditCard, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CreditsExhaustedModalProps {
    isOpen: boolean;
    onClose: () => void;
    creditsLimit?: number;
    creditsUsed?: number;
}

export function CreditsExhaustedModal({
    isOpen,
    onClose,
    creditsLimit = 0,
    creditsUsed = 0
}: CreditsExhaustedModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 backdrop-blur-md bg-black/60 animate-in fade-in duration-300">
            <div
                className={cn(
                    "relative w-full max-w-lg overflow-hidden rounded-3xl",
                    "bg-[#0f0f0f] border border-white/[0.08]",
                    "shadow-[0_0_50px_-12px_rgba(255,229,0,0.15)]",
                    "flex flex-col",
                    "animate-in zoom-in-95 slide-in-from-bottom-4 duration-500 ease-out"
                )}
            >
                {/* Background Accents */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[300px] bg-primary/10 blur-[100px] rounded-full pointer-events-none" />
                <div className="absolute -bottom-24 -right-24 w-[200px] h-[200px] bg-accent/5 blur-[80px] rounded-full pointer-events-none" />

                {/* Header/Banner */}
                <div className="relative h-32 flex items-center justify-center overflow-hidden bg-gradient-to-b from-white/[0.03] to-transparent">
                    {/* Animated Ring Decor */}
                    <div className="absolute w-[200px] h-[200px] border border-primary/10 rounded-full animate-pulse" />
                    <div className="absolute w-[140px] h-[140px] border border-primary/20 rounded-full" />

                    <div className="relative z-10 w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border border-primary/20 flex items-center justify-center shadow-2xl shadow-primary/20">
                        <Zap className="w-10 h-10 text-primary fill-primary/10" />
                    </div>
                </div>

                {/* Content */}
                <div className="relative px-8 pb-10 pt-6 text-center space-y-6">
                    <div className="space-y-2">
                        <h2 className="text-3xl font-bold text-foreground tracking-tight">
                            Credits Exhausted
                        </h2>
                        <p className="text-muted/60 text-sm max-w-[320px] mx-auto leading-relaxed">
                            You've utilized all available intelligence credits for this billing period.
                        </p>
                    </div>

                    {/* Usage Stats Card */}
                    <div className="grid grid-cols-2 gap-3 p-1">
                        <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-4 flex flex-col items-center gap-1 group hover:bg-white/[0.04] transition-colors">
                            <span className="text-[10px] font-semibold text-muted/40 uppercase tracking-widest">Limit</span>
                            <span className="text-lg font-medium text-foreground">${(creditsLimit / 100).toFixed(2)}</span>
                        </div>
                        <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-4 flex flex-col items-center gap-1 group hover:bg-white/[0.04] transition-colors">
                            <span className="text-[10px] font-semibold text-muted/40 uppercase tracking-widest">Utilized</span>
                            <span className="text-lg font-medium text-primary">${(creditsUsed / 100).toFixed(2)}</span>
                        </div>
                    </div>

                    {/* Features Reminder */}
                    <div className="py-4 space-y-4">
                        <div className="flex items-center justify-center gap-2 text-[11px] font-medium text-muted/30 uppercase tracking-[0.2em] mb-2">
                            <div className="h-[1px] w-8 bg-white/[0.05]" />
                            Premium Access
                            <div className="h-[1px] w-8 bg-white/[0.05]" />
                        </div>
                        <div className="flex flex-wrap justify-center gap-x-6 gap-y-3">
                            <div className="flex items-center gap-1.5 text-xs text-muted/60">
                                <Sparkles className="w-3.5 h-3.5 text-primary/60" />
                                Advanced Models
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-muted/60">
                                <ShieldAlert className="w-3.5 h-3.5 text-primary/60" />
                                Priority Support
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-muted/60">
                                <Zap className="w-3.5 h-3.5 text-primary/60" />
                                Instant Processing
                            </div>
                        </div>
                    </div>

                    {/* Action Button */}
                    <div className="pt-4 flex flex-col gap-3">
                        <button
                            onClick={onClose}
                            className={cn(
                                "group relative w-full h-12 rounded-xl flex items-center justify-center font-semibold text-sm transition-all overflow-hidden",
                                "bg-primary text-black hover:scale-[1.02] active:scale-[0.98]",
                                "shadow-[0_8px_30px_rgb(255,229,0,0.2)] hover:shadow-[0_8px_30px_rgb(255,229,0,0.3)]"
                            )}
                        >
                            <div className="absolute inset-x-0 bottom-0 h-[100%] bg-white/20 -translate-y-[100%] group-hover:translate-y-0 transition-transform duration-500 ease-in-out pointer-events-none" />
                            <span className="relative flex items-center gap-2 underline">
                                Continue Exploration
                                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                            </span>
                        </button>
                        <p className="text-[10px] text-muted/30">
                            Credits reset at the start of every month. Need more? <span className="text-primary/40 cursor-pointer hover:text-primary transition-colors">Contact Support</span>
                        </p>
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
