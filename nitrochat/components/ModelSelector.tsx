'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Cpu, Loader2, Sparkles, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModelOption {
    id: string;
    name: string;
    provider?: string;
}

interface ModelSelectorProps {
    selectedModel: string;
    availableModels: ModelOption[];
    modelsLoading?: boolean;
    onModelChange: (model: string) => void;
    isCollapsed?: boolean;
    currentTheme?: 'dark' | 'light';
    /** When true, dropdown opens above the trigger (e.g. when selector is at bottom of sidebar). */
    openUpward?: boolean;
    /** When false, hides the small "Model" heading (e.g. composer toolbar). */
    showLabel?: boolean;
    /** Compact trigger + right-aligned panel for top navbar placement. */
    variant?: 'default' | 'navbar';
    /** Navbar on standalone branded header (uses --color-secondary palette). */
    navbarStandalone?: boolean;
}

const AUTO_MODEL: ModelOption = {
    id: 'openrouter/auto',
    name: 'Auto (Smart Routing)',
    provider: 'OpenRouter',
};

/** Extract a short provider label from model id like "anthropic/claude-..." → "Anthropic" */
function extractProvider(modelId: string): string {
    const slash = modelId.indexOf('/');
    if (slash === -1) return '';
    const raw = modelId.substring(0, slash);
    return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function ModelSelector({
    selectedModel,
    availableModels,
    modelsLoading,
    onModelChange,
    isCollapsed,
    currentTheme = 'dark',
    openUpward = false,
    showLabel = true,
    variant = 'default',
    navbarStandalone = false,
}: ModelSelectorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const isLight = currentTheme === 'light';
    const isNavbar = variant === 'navbar';
    const openUp = isNavbar ? false : openUpward;

    // Close on outside click
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                setSearch('');
            }
        }
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') {
                setIsOpen(false);
                setSearch('');
            }
        }
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [isOpen]);

    // Focus search input when dropdown opens
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => searchInputRef.current?.focus(), 50);
        }
    }, [isOpen]);

    // Gateway list may include `openrouter/auto`; keep a single synthetic Auto row first.
    const allModels = useMemo(() => {
        const seen = new Set<string>([AUTO_MODEL.id]);
        const rest: ModelOption[] = [];
        for (const m of availableModels) {
            if (seen.has(m.id)) continue;
            seen.add(m.id);
            rest.push(m);
        }
        return [AUTO_MODEL, ...rest];
    }, [availableModels]);

    const filtered = useMemo(() => {
        if (!search.trim()) return allModels;
        const q = search.toLowerCase();
        return allModels.filter(
            (m) =>
                m.name.toLowerCase().includes(q) ||
                m.id.toLowerCase().includes(q) ||
                (m.provider || extractProvider(m.id)).toLowerCase().includes(q)
        );
    }, [allModels, search]);

    // Current selection label
    const currentModel = allModels.find((m) => m.id === selectedModel) || AUTO_MODEL;
    const currentProvider = currentModel.provider || extractProvider(currentModel.id);
    const triggerDetailTitle = `${currentModel.name}${currentProvider ? ` — ${currentProvider}` : ''}`;
    /** Navbar: one line + tooltip; "Auto" instead of long auto label */
    const navbarTriggerLabel =
        selectedModel === 'openrouter/auto' ? 'Auto' : currentModel.name;

    if (isCollapsed) return null;

    const showHeading = showLabel && !isNavbar;

    return (
        <div ref={containerRef} className={cn('relative', isNavbar && 'z-[70] min-w-0')}>
            {showHeading && (
                <h3 className={cn(
                    "px-1 text-[10px] font-semibold uppercase tracking-widest mb-1.5",
                    isLight ? "text-gray-400" : "text-muted/40"
                )}>
                    Model
                </h3>
            )}

            {/* Trigger Button */}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                disabled={modelsLoading}
                aria-expanded={isOpen}
                aria-haspopup="listbox"
                aria-label={`AI model: ${currentModel.name}`}
                title={isNavbar ? triggerDetailTitle : undefined}
                className={cn(
                    'flex items-center border transition-all duration-200 cursor-pointer group',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35',
                    isNavbar
                        ? cn(
                            'max-w-[10.5rem] gap-1.5 px-2.5 py-1.5 sm:max-w-[13rem] sm:gap-2 sm:px-3 sm:py-2',
                            navbarStandalone
                                ? cn(
                                    'w-auto min-w-0 rounded-full border-white/20 bg-black/10 text-[color:var(--color-secondary)]',
                                    'hover:bg-black/[0.14] hover:border-white/30',
                                    isOpen && 'border-white/35 bg-black/[0.18] ring-1 ring-white/25',
                                )
                                : cn(
                                    'w-full rounded-lg border-border/50 bg-card/70 backdrop-blur-md',
                                    'hover:bg-card/90 hover:border-border',
                                    isLight
                                        ? 'bg-white/90 hover:bg-white'
                                        : undefined,
                                    isOpen && (isLight
                                        ? 'border-primary/30 ring-1 ring-primary/20 bg-white'
                                        : 'border-primary/35 ring-1 ring-primary/25 bg-card'),
                                ),
                        )
                        : cn(
                            'w-full rounded-lg gap-2.5 px-3 py-2.5',
                            isLight
                                ? 'bg-gray-50 border-gray-200 hover:bg-gray-100 hover:border-gray-300'
                                : 'bg-white/[0.04] border-white/[0.08] hover:bg-white/[0.07] hover:border-white/[0.14]',
                            isOpen && (isLight
                                ? 'bg-gray-100 border-gray-300 ring-1 ring-primary/30'
                                : 'bg-white/[0.07] border-white/[0.14] ring-1 ring-primary/30'),
                        ),
                )}
            >
                {isNavbar ? (
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center sm:h-5 sm:w-5">
                        {modelsLoading ? (
                            <Loader2
                                className={cn(
                                    'animate-spin',
                                    navbarStandalone ? 'h-4 w-4 text-[color:var(--color-secondary)]' : 'h-4 w-4 text-primary',
                                )}
                            />
                        ) : selectedModel === 'openrouter/auto' ? (
                            <Sparkles
                                className={cn(
                                    'h-4 w-4',
                                    navbarStandalone
                                        ? 'text-[color:var(--color-secondary)]'
                                        : 'text-primary',
                                )}
                            />
                        ) : (
                            <Cpu
                                className={cn(
                                    'h-4 w-4',
                                    navbarStandalone
                                        ? 'text-[color:var(--color-secondary)]'
                                        : 'text-primary',
                                )}
                            />
                        )}
                    </span>
                ) : (
                    <div
                        className={cn(
                            'flex flex-shrink-0 items-center justify-center rounded-md border bg-gradient-to-br',
                            'h-7 w-7 border-primary/20 from-primary/20 to-accent/10',
                        )}
                    >
                        {modelsLoading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                        ) : selectedModel === 'openrouter/auto' ? (
                            <Sparkles className="h-3.5 w-3.5 text-primary" />
                        ) : (
                            <Cpu className="h-3.5 w-3.5 text-primary" />
                        )}
                    </div>
                )}

                <div className="min-w-0 flex-1 text-left">
                    {isNavbar ? (
                        <div
                            className={cn(
                                'truncate text-xs font-semibold leading-none tracking-tight sm:text-[13px]',
                                navbarStandalone
                                    ? 'text-[color:var(--color-secondary)]'
                                    : isLight
                                        ? 'text-gray-800'
                                        : 'text-foreground',
                            )}
                        >
                            {navbarTriggerLabel}
                        </div>
                    ) : (
                        <>
                            <div
                                className={cn(
                                    'truncate text-xs font-medium leading-tight',
                                    isLight ? 'text-gray-800' : 'text-foreground',
                                )}
                            >
                                {currentModel.name}
                            </div>
                            {currentProvider && (
                                <div
                                    className={cn(
                                        'mt-0.5 truncate text-[10px] leading-tight',
                                        isLight ? 'text-gray-400' : 'text-muted/50',
                                    )}
                                >
                                    {currentProvider}
                                </div>
                            )}
                        </>
                    )}
                </div>

                <ChevronDown
                    className={cn(
                        'flex-shrink-0 transition-transform duration-200',
                        isNavbar ? 'h-3.5 w-3.5 sm:h-4 sm:w-4' : 'h-3.5 w-3.5',
                        navbarStandalone && isNavbar
                            ? 'text-[color:var(--color-secondary)]/90'
                            : isLight
                                ? 'text-gray-500'
                                : 'text-muted/45',
                        isOpen && 'rotate-180',
                    )}
                />
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div
                    className={cn(
                        'absolute z-[80] rounded-xl overflow-hidden shadow-2xl',
                        isNavbar
                            ? cn(
                                'top-full right-0 left-auto mt-2 w-[min(calc(100vw-1.5rem),19.5rem)] min-w-[15rem] sm:min-w-[16.5rem]',
                                isLight ? 'ring-1 ring-stone-800/10' : 'ring-1 ring-white/[0.1]',
                                'animate-in fade-in slide-in-from-top-1 duration-150',
                            )
                            : cn(
                                'left-0 right-0',
                                openUp ? 'bottom-full mb-1.5' : 'mt-1.5',
                                openUp
                                    ? 'animate-in fade-in slide-in-from-bottom-2 duration-150'
                                    : 'animate-in fade-in slide-in-from-top-2 duration-150',
                            ),
                        isLight
                            ? isNavbar
                                ? 'border border-stone-300/50 bg-[#f5f2eb] shadow-[0_14px_44px_-10px_rgba(28,25,23,0.14),0_6px_18px_-8px_rgba(28,25,23,0.09)]'
                                : 'bg-white border border-gray-200 shadow-gray-200/60'
                            : isNavbar
                                ? 'border border-white/[0.12] bg-[#141416] shadow-xl shadow-black/50'
                                : 'bg-[#1a1a1a] border border-white/[0.1] shadow-black/60',
                    )}
                >
                    {/* Search */}
                    <div className={cn(
                        'border-b',
                        isNavbar ? 'px-2.5 pb-2.5 pt-2 sm:px-3 sm:pb-3 sm:pt-2.5' : 'p-2.5',
                        isLight && isNavbar && 'border-stone-200/65',
                        isLight && !isNavbar && 'border-slate-100',
                        !isLight && 'border-white/[0.06]',
                    )}>
                        {isNavbar && (
                            <p className={cn(
                                'mb-2 text-[10px] font-semibold uppercase tracking-[0.12em]',
                                isLight ? 'text-stone-600' : 'text-muted/45',
                            )}>
                                Models
                            </p>
                        )}
                        <div className="relative">
                            <Search className={cn(
                                "pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2",
                                isLight && isNavbar && 'text-stone-500',
                                isLight && !isNavbar && 'text-slate-400',
                                !isLight && 'text-muted/40',
                            )} />
                            <input
                                ref={searchInputRef}
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder={isNavbar ? 'Search by name or provider…' : 'Search models...'}
                                className={cn(
                                    'w-full rounded-lg pl-9 pr-3 text-[13px] focus:outline-none',
                                    'transition-[box-shadow,background-color] duration-150',
                                    isNavbar ? 'py-2' : 'py-2 text-xs',
                                    isNavbar && isLight
                                        ? 'border-0 bg-[#e8e4da] text-stone-900 shadow-[inset_0_0_0_1px_rgba(120,113,108,0.22)] placeholder:text-stone-500 focus:bg-[#f0ece4] focus:shadow-[inset_0_0_0_1px_rgba(91,33,182,0.28)]'
                                        : isNavbar && !isLight
                                            ? 'border-0 bg-white/[0.05] text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] placeholder:text-muted/35 focus:bg-white/[0.08] focus:shadow-[inset_0_0_0_1px_rgba(99,102,241,0.45)]'
                                            : isLight
                                                ? 'bg-gray-50 border border-gray-200 text-xs text-gray-800 placeholder:text-gray-400 focus:border-primary/40 focus:bg-white'
                                                : 'bg-white/[0.04] border border-white/[0.08] text-xs text-foreground placeholder:text-muted/30 focus:border-primary/40 focus:bg-white/[0.06]'
                                )}
                            />
                        </div>
                    </div>

                    {/* Model List */}
                    <div className={cn(
                        'overflow-y-auto scrollbar-hide',
                        isNavbar ? 'max-h-[min(40dvh,240px)] px-1 py-1.5 sm:max-h-[min(44dvh,280px)]' : 'max-h-[280px] py-1',
                    )}>
                        {filtered.length === 0 ? (
                            <div className={cn('text-center', isNavbar ? 'px-4 py-8' : 'px-4 py-6')}>
                                <p className={cn(
                                    isNavbar ? 'text-sm' : 'text-xs',
                                    isLight && isNavbar && 'text-stone-600',
                                    isLight && !isNavbar && 'text-slate-500',
                                    !isLight && 'text-muted/40',
                                )}>No models found</p>
                            </div>
                        ) : (
                            filtered.map((model) => {
                                const provider = model.provider || extractProvider(model.id);
                                const isSelected = model.id === selectedModel;
                                const isAuto = model.id === 'openrouter/auto';
                                const isFree = model.id.includes(':free');

                                return (
                                    <button
                                        key={model.id}
                                        type="button"
                                        onClick={() => {
                                            onModelChange(model.id);
                                            setIsOpen(false);
                                            setSearch('');
                                        }}
                                        className={cn(
                                            'mx-auto flex max-w-full items-start text-left transition-colors duration-100',
                                            isNavbar
                                                ? 'w-[calc(100%-10px)] gap-3 rounded-xl px-2.5 py-2.5 sm:px-3 sm:py-3'
                                                : 'w-[calc(100%-8px)] gap-2.5 rounded-lg px-3 py-2',
                                            isLight
                                                ? cn(
                                                    isNavbar ? 'hover:bg-stone-200/50' : 'hover:bg-slate-50',
                                                    isSelected && (isNavbar
                                                        ? 'bg-[#ebe6f7] hover:bg-[#ebe6f7]'
                                                        : 'bg-indigo-50/90 hover:bg-indigo-50'),
                                                    isNavbar && isSelected && 'ring-1 ring-inset ring-violet-300/70',
                                                    !isNavbar && isSelected && 'ring-1 ring-inset ring-indigo-200/80',
                                                )
                                                : cn(
                                                    'hover:bg-white/[0.06]',
                                                    isSelected && 'bg-primary/[0.1] hover:bg-primary/[0.14]',
                                                    isNavbar && isSelected && 'ring-1 ring-inset ring-primary/25',
                                                ),
                                        )}
                                    >
                                        <div
                                            className={cn(
                                                'flex flex-shrink-0 items-center justify-center rounded-lg border',
                                                isNavbar ? 'mt-0.5 h-8 w-8' : 'h-6 w-6 rounded-md',
                                                isSelected
                                                    ? 'border-primary/35 bg-primary/15'
                                                    : isLight && isNavbar
                                                        ? 'border-stone-300/65 bg-stone-200/45'
                                                        : isLight
                                                            ? 'border-slate-200/90 bg-slate-50'
                                                            : 'border-white/[0.08] bg-white/[0.04]',
                                            )}
                                        >
                                            {isSelected ? (
                                                <Check className={cn('text-primary', isNavbar ? 'h-4 w-4' : 'h-3 w-3')} />
                                            ) : isAuto ? (
                                                <Sparkles className={cn(
                                                    isNavbar ? 'h-4 w-4' : 'h-3 w-3',
                                                    isLight && isNavbar && 'text-stone-500',
                                                    isLight && !isNavbar && 'text-slate-400',
                                                    !isLight && 'text-muted/45',
                                                )} />
                                            ) : (
                                                <Cpu className={cn(
                                                    isNavbar ? 'h-4 w-4' : 'h-3 w-3',
                                                    isLight && isNavbar && 'text-stone-500',
                                                    isLight && !isNavbar && 'text-slate-400',
                                                    !isLight && 'text-muted/35',
                                                )} />
                                            )}
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-start gap-2">
                                                <div className="min-w-0 flex-1">
                                                    <div
                                                        className={cn(
                                                            'leading-snug',
                                                            isNavbar ? 'text-[13px] font-semibold tracking-tight' : 'text-xs font-medium leading-tight',
                                                            isSelected
                                                                ? 'text-primary'
                                                                : isLight && isNavbar
                                                                    ? 'text-stone-800'
                                                                    : isLight
                                                                        ? 'text-slate-900'
                                                                        : 'text-foreground/90',
                                                        )}
                                                    >
                                                        {model.name}
                                                    </div>
                                                    {provider && (
                                                        <div className={cn(
                                                            'mt-1 truncate leading-tight',
                                                            isNavbar ? 'text-[11px]' : 'text-[10px] mt-0.5',
                                                            isLight && isNavbar && 'text-stone-600',
                                                            isLight && !isNavbar && 'text-slate-500',
                                                            !isLight && 'text-muted/50',
                                                        )}>
                                                            {provider}
                                                        </div>
                                                    )}
                                                </div>
                                                {isFree && (
                                                    <span
                                                        className={cn(
                                                            'flex-shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ring-1',
                                                            isLight
                                                                ? 'bg-emerald-500/[0.12] text-emerald-700 ring-emerald-600/15'
                                                                : 'bg-emerald-500/10 text-emerald-400 ring-emerald-400/25',
                                                        )}
                                                    >
                                                        Free
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>

                    {/* Footer count */}
                    <div className={cn(
                        'flex items-center justify-between border-t',
                        isNavbar ? 'px-3 py-2 sm:py-2.5' : 'px-3 py-2',
                        isLight && isNavbar && 'border-stone-200/65',
                        isLight && !isNavbar && 'border-slate-100',
                        !isLight && 'border-white/[0.06]',
                    )}>
                        <span className={cn(
                            isNavbar
                                ? cn(
                                    'text-[11px] font-medium tabular-nums',
                                    isLight ? 'text-stone-600' : 'text-muted/45',
                                )
                                : cn('text-[10px]', isLight ? 'text-gray-400' : 'text-muted/30'),
                        )}>
                            {availableModels.length} model{availableModels.length !== 1 ? 's' : ''} available
                        </span>
                        {modelsLoading && (
                            <div className="flex items-center gap-1.5">
                                <Loader2 className="w-3 h-3 animate-spin text-primary/50" />
                                <span className="text-[10px] text-primary/50">Refreshing…</span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
