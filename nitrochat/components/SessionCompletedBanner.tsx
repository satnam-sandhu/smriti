'use client';

import type { CSSProperties } from 'react';
import { StandaloneChatbotAvatar } from '@/components/StandaloneChatbotAvatar';
import { defaultConfig, getConfig, isSessionCompletedUiEnabled } from '@/nitrochat.config';
import {
  getRuntimeThemeSurface,
  resolveStandaloneChatbotLogo,
  type ThemeSurface,
} from '@/lib/theme-runtime';
import { cn } from '@/lib/utils';

function isSafeSessionCtaHref(href: string): boolean {
  const t = href.trim().toLowerCase();
  if (!t) return false;
  if (t.startsWith('javascript:') || t.startsWith('data:') || t.startsWith('vbscript:')) return false;
  return true;
}

interface SessionCompletedBannerProps {
  /** When true, footer sits in standalone chrome (no extra horizontal padding; parent supplies gutters). */
  standaloneLayout?: boolean;
  currentTheme?: 'dark' | 'light';
  /** Assistant avatar; defaults to the same resolution as {@link ChatMessage} standalone. */
  chatbotLogo?: string;
  style?: CSSProperties;
  description?: string;
  /** When false, the entire banner (description + CTA) is hidden. Default true. */
  ctaEnabled?: boolean;
  /** CTA label; shown only with a non-empty {@link ctaUrl} after trim. */
  ctaLabel?: string;
  /** CTA href; shown only with a non-empty {@link ctaLabel} after trim. */
  ctaUrl?: string;
  /** CTA background (CSS color). Empty/unset uses theme `primary` (`bg-primary`). */
  ctaBackground?: string;
  /** CTA label color (CSS color). When set, overrides default `text-primary-foreground`. */
  ctaColor?: string;
}

/**
 * Replaces the ChatInput when a session-end MCP tool has fired successfully.
 * Uses the same assistant row + bubble treatment as {@link ChatMessage} in standalone mode.
 */
export function SessionCompletedBanner({
  standaloneLayout = false,
  currentTheme,
  chatbotLogo: chatbotLogoProp,
  style,
  description = defaultConfig.chat.sessionCompletedDescription,
  ctaEnabled = isSessionCompletedUiEnabled(defaultConfig.chat),
  ctaLabel,
  ctaUrl,
  ctaBackground,
  ctaColor,
}: SessionCompletedBannerProps) {
  if (!ctaEnabled) return null;

  const config = getConfig();
  const surface: ThemeSurface =
    currentTheme === 'dark'
      ? 'dark'
      : currentTheme === 'light'
        ? 'light'
        : getRuntimeThemeSurface(config);
  const avatarSrc =
    chatbotLogoProp?.trim() || resolveStandaloneChatbotLogo(config, surface);

  const ctaLabelTrimmed = ctaLabel?.trim() ?? '';
  const ctaUrlTrimmed = ctaUrl?.trim() ?? '';
  const showCta =
    ctaEnabled &&
    Boolean(ctaLabelTrimmed && ctaUrlTrimmed && isSafeSessionCtaHref(ctaUrlTrimmed));

  const ctaBg = ctaBackground?.trim() ?? '';
  const ctaFg = ctaColor?.trim() ?? '';

  return (
    <div
      className={cn('w-full flex justify-start', standaloneLayout ? 'pb-3' : 'px-4 pb-6 md:px-6')}
      style={style}
    >
      <div className="flex min-w-0 w-full items-start gap-2 sm:gap-3">
        <StandaloneChatbotAvatar src={avatarSrc} surface={surface} variant="message" />
        <div
          role="status"
          aria-live="polite"
          className="min-w-0 flex-1 rounded-xl border border-border/70 bg-aiBubbleBg px-3 py-2.5 text-aiBubbleText shadow-sm sm:rounded-2xl sm:px-4 sm:py-3 md:px-5 md:py-3.5"
        >
          <div className="flex items-start gap-2 sm:gap-2.5">

            <div className="min-w-0 flex-1 text-left">
              <p className="text-sm leading-relaxed text-muted md:text-[0.9375rem]">{description}</p>
              {showCta ? (
                <a
                  href={ctaUrlTrimmed}
                  className={cn(
                    'mt-3 inline-flex w-fit max-w-full items-center justify-center rounded-lg px-4 py-2 text-sm font-medium shadow-sm transition-opacity duration-150 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                    !ctaBg && 'bg-primary',
                    !ctaFg && 'text-primary-foreground',
                    !ctaBg && !ctaFg && 'shadow-primary/15',
                    (ctaBg || ctaFg) && 'border border-border/60',
                  )}
                  style={
                    ctaBg || ctaFg
                      ? {
                          ...(ctaBg ? { backgroundColor: ctaBg } : {}),
                          ...(ctaFg ? { color: ctaFg } : {}),
                        }
                      : undefined
                  }
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <span className="truncate">{ctaLabelTrimmed}</span>
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
