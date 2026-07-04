'use client';

import { Clock, MessageCircle, Trash2, X } from 'lucide-react';
import { StandaloneChatbotAvatar } from '@/components/StandaloneChatbotAvatar';
import {
  fallbackStandaloneChatbotLogo,
  getCustomLogoUrlForSurface,
  getRuntimeThemeSurface,
  type ThemeSurface,
} from '@/lib/theme-runtime';
import type { NitroChatConfig } from '@/nitrochat.config';
import { STANDALONE_HEADER_INNER_CLASS } from '@/lib/standalone-layout';

interface EmbedStandaloneHeaderProps {
  config: NitroChatConfig;
  surfaceTheme?: ThemeSurface;
  onClose: () => void;
  persistenceEnabled?: boolean;
  showPersistenceActions?: boolean;
  chatId?: string | null;
  onNewChat?: () => void;
  onToggleHistory?: () => void;
  onDeleteChat?: () => void;
}

export function EmbedStandaloneHeader({
  config,
  surfaceTheme,
  onClose,
  persistenceEnabled = false,
  showPersistenceActions = false,
  chatId,
  onNewChat,
  onToggleHistory,
  onDeleteChat,
}: EmbedStandaloneHeaderProps) {
  const surface = surfaceTheme ?? getRuntimeThemeSurface(config);
  const logoUrl = getCustomLogoUrlForSurface(config, surface) || fallbackStandaloneChatbotLogo(surface);
  const standaloneFontStyle = config.branding?.fontFamily
    ? ({ fontFamily: config.branding.fontFamily } as const)
    : undefined;
  const headerControlStyle = { color: 'var(--color-header-subtext)' } as const;

  const headerText =
    config.standaloneMode?.headerText || config.branding?.name || 'NitroChat';
  const headerSubText = config.standaloneMode?.headerSubText;

  const iconBtnClass =
    'cursor-pointer rounded-lg p-2 transition-colors duration-200 hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30';

  return (
    <div
      className="sticky top-0 z-50 shrink-0 border-b border-secondary/25 shadow-sm backdrop-blur-md"
      style={{
        backgroundColor: 'var(--color-header-bg)',
        ...standaloneFontStyle,
      }}
    >
      <div className={STANDALONE_HEADER_INNER_CLASS}>
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
          {logoUrl ? (
            <StandaloneChatbotAvatar
              src={logoUrl}
              surface={surface}
              alt={config.branding?.name || 'Chat'}
              variant="header"
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-secondary via-accent to-primary sm:h-11 sm:w-11">
              <span className="text-xs font-bold text-black sm:text-sm">N</span>
            </div>
          )}

          <div className="flex min-w-0 flex-col justify-center">
            <span
              className="leading-tight tracking-[-0.02em]"
              style={{
                color: 'var(--color-header-text)',
                fontSize: `clamp(0.875rem, 2.4vw, ${config.standaloneMode?.headerTextStyle?.fontSize || '1.25rem'})`,
                fontWeight: config.standaloneMode?.headerTextStyle?.fontWeight || '600',
                ...standaloneFontStyle,
              }}
            >
              {headerText}
            </span>
            {headerSubText ? (
              <span
                className="mt-1 max-w-prose leading-snug text-balance"
                style={{
                  color: 'var(--color-header-subtext)',
                  fontSize: `clamp(0.75rem, 1.5vw, ${config.standaloneMode?.headerSubTextStyle?.fontSize || '0.8125rem'})`,
                  fontWeight: config.standaloneMode?.headerSubTextStyle?.fontWeight || '400',
                  ...standaloneFontStyle,
                }}
              >
                {headerSubText}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          {persistenceEnabled && showPersistenceActions && (
            <>
              {onNewChat ? (
                <button
                  type="button"
                  onClick={onNewChat}
                  className={iconBtnClass}
                  style={headerControlStyle}
                  aria-label="New chat"
                  title="New chat"
                >
                  <MessageCircle className="h-5 w-5" />
                </button>
              ) : null}
              {onToggleHistory ? (
                <button
                  type="button"
                  onClick={onToggleHistory}
                  className={iconBtnClass}
                  style={headerControlStyle}
                  aria-label="Chat history"
                  title="Chat history"
                >
                  <Clock className="h-5 w-5" />
                </button>
              ) : null}
              {chatId && onDeleteChat ? (
                <button
                  type="button"
                  onClick={onDeleteChat}
                  className={iconBtnClass}
                  style={headerControlStyle}
                  aria-label="Delete chat"
                  title="Delete chat"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              ) : null}
            </>
          )}

          <button
            type="button"
            onClick={onClose}
            className={iconBtnClass}
            style={headerControlStyle}
            aria-label="Close chat"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
