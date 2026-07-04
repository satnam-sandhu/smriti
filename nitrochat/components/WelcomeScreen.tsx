'use client';

import { Sparkles } from 'lucide-react';
import { McpPrompt } from '@/lib/store';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { NitroChatConfig } from '@/nitrochat.config';
import {
  getCustomLogoUrlForSurface,
  getRuntimeThemeSurface,
  type ThemeV2,
} from '@/lib/theme-runtime';

interface WelcomeScreenProps {
  prompts: McpPrompt[];
  onPromptClick: (prompt: McpPrompt) => void;
  onSuggestionClick: (suggestion: string) => void;
  /** Use inside scroll regions (e.g. standalone chat) instead of full-viewport flex layout */
  embedded?: boolean;
  /**
   * Merged runtime branding from the parent (same source as `/api/config`).
   * When set, the welcome hero matches server config on first paint and skips a duplicate fetch.
   */
  branding?: NitroChatConfig['branding'];
  /** Merged runtime theme_version_2 from the parent (same source as `/api/config`). */
  themeVersion2?: ThemeV2 | null;
  suggestedPrompts?: string[];
}

const defaultBrandingState = {
  name: 'NitroChat',
  tagline: 'AI-Powered Intelligent Assistant',
  logo: null as string | null,
};

function buildWelcomeState(
  branding: NitroChatConfig['branding'] | undefined,
  suggestedPrompts: string[] | undefined,
  themeVersion2: ThemeV2 | null | undefined,
) {
  return {
    branding: {
      name: branding?.name ?? defaultBrandingState.name,
      tagline: branding?.tagline ?? defaultBrandingState.tagline,
      logo: branding?.logo ?? defaultBrandingState.logo,
    },
    theme_version_2: themeVersion2 ?? null,
    chat: { suggestedPrompts: suggestedPrompts ?? [] },
    features: { showPrompts: true as const },
  };
}

export function WelcomeScreen({
  prompts,
  onPromptClick,
  onSuggestionClick,
  embedded = false,
  branding,
  themeVersion2,
  suggestedPrompts,
}: WelcomeScreenProps) {
  const [config, setConfig] = useState(() =>
    buildWelcomeState(branding, suggestedPrompts, themeVersion2),
  );

  useEffect(() => {
    if (branding !== undefined) {
      setConfig(buildWelcomeState(branding, suggestedPrompts, themeVersion2));
      return;
    }

    let cancelled = false;
    fetch('/api/config')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setConfig({
          branding: { ...defaultBrandingState, ...(data.branding || {}) },
          theme_version_2: data.theme_version_2 ?? null,
          chat: { suggestedPrompts: data.chat?.suggestedPrompts || [] },
          features: { showPrompts: true },
        });
      })
      .catch((err) => console.error('Failed to fetch config:', err));

    return () => {
      cancelled = true;
    };
  }, [branding, suggestedPrompts, themeVersion2]);

  const heroLogo = getCustomLogoUrlForSurface(
    { branding: config.branding, theme_version_2: config.theme_version_2 },
    getRuntimeThemeSurface({ theme_version_2: config.theme_version_2 }),
  );

  return (
    <div
      className={cn(
        embedded
          ? 'flex w-full flex-col items-center justify-center py-6 sm:py-8'
          : 'flex flex-1 items-center justify-center p-4 sm:p-6'
      )}
    >
      <div className="w-full max-w-5xl space-y-4 md:space-y-6">
        {/* Hero Section with reduced spacing */}
        <div className="text-center space-y-2 md:space-y-3">
          {heroLogo ? (
            <div className="inline-flex items-center justify-center mb-3">
              <img
                src={heroLogo}
                alt={config.branding.name}
                className="h-12 sm:h-16 md:h-20 object-contain drop-shadow-2xl"
              />
            </div>
          ) : (
            <>
              <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-lg bg-gradient-to-br from-primary via-secondary to-accent mb-3 shadow-2xl ring-2 ring-primary/20">
                <Sparkles className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 text-white" />
              </div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-medium bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent leading-tight">
                {config.branding.name}
              </h1>
            </>
          )}
          <p className="text-sm sm:text-base md:text-lg text-muted max-w-2xl mx-auto leading-relaxed">
            {config.branding.tagline}
          </p>
        </div>

        {/* Suggested prompts from config - e.g. "What can you help me with?", "demo", etc. */}
        {Array.isArray(config.chat?.suggestedPrompts) && config.chat.suggestedPrompts.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2 mt-6">
            {config.chat.suggestedPrompts.map((suggestion: string, i: number) => (
              <button
                key={i}
                type="button"
                onClick={() => onSuggestionClick(suggestion)}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  'bg-primary/10 hover:bg-primary/20 text-foreground border border-border'
                )}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {prompts.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2">
            {prompts.slice(0, 12).map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => onPromptClick(p)}
                className={cn(
                  'max-w-full truncate px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  'bg-card hover:bg-card/80 text-foreground border border-border'
                )}
                title={p.description || p.name}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


