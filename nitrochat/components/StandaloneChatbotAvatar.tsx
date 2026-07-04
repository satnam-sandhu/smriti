'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { fallbackStandaloneChatbotLogo, type ThemeSurface } from '@/lib/theme-runtime';

export type StandaloneChatbotAvatarVariant = 'header' | 'message' | 'hero';

interface StandaloneChatbotAvatarProps {
  src: string;
  /** Used when `src` fails to load; swaps to theme-appropriate `/public` defaults. */
  surface: ThemeSurface;
  alt?: string;
  variant?: StandaloneChatbotAvatarVariant;
  className?: string;
  standaloneMode?: boolean;
}

/**
 * Marks from /public (often wide PNGs) look soft or cramped inside `rounded-full object-cover`.
 * This uses `object-contain` plus padding and a surface that fits each context (header vs chat).
 */
export function StandaloneChatbotAvatar({
  src,
  surface,
  alt = '',
  variant = 'message',
  className,
  standaloneMode = false,
}: StandaloneChatbotAvatarProps) {
  const [activeSrc, setActiveSrc] = useState(src);
  const didTryFallbackRef = useRef(false);

  useEffect(() => {
    setActiveSrc(src);
    didTryFallbackRef.current = false;
  }, [src]);

  const handleError = () => {
    if (didTryFallbackRef.current) return;
    didTryFallbackRef.current = true;
    setActiveSrc((cur) => {
      const fb = fallbackStandaloneChatbotLogo(surface);
      return cur !== fb ? fb : cur;
    });
  };

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden',
        variant === 'header' &&
          cn(
            'h-10 w-10 rounded-2xl sm:h-11 sm:w-11 md:h-12 md:w-12',
            'bg-transparent shadow-none ring-0',
          ),
        variant === 'message' &&
          (standaloneMode
            ? 'mt-0.5 h-10 w-10 rounded-2xl bg-transparent sm:h-11 sm:w-11'
            : 'mt-0.5 h-9 w-9 rounded-2xl border border-border/55 bg-card shadow-sm sm:h-10 sm:w-10'),
        variant === 'hero' &&
          (standaloneMode
            ? 'box-border flex h-24 w-24 items-center justify-center rounded-3xl bg-transparent p-0 sm:h-28 sm:w-28'
            : 'box-border flex h-20 w-20 items-center justify-center rounded-3xl border border-border/60 bg-card p-3 shadow-md sm:h-24 sm:w-24 sm:p-4'),
        className
      )}
    >
      <img
        src={activeSrc}
        alt={alt}
        decoding="async"
        onError={handleError}
        className={cn(
          'object-contain',
          variant === 'header' && 'h-[72%] w-[72%] max-h-full max-w-full sm:h-[70%] sm:w-[70%]',
          variant === 'message' &&
            (standaloneMode
              ? 'h-full w-full max-h-full max-w-full'
              : 'h-[78%] w-[78%] max-h-full max-w-full sm:h-[76%] sm:w-[76%]'),
          variant === 'hero' && 'max-h-full max-w-full'
        )}
      />
    </div>
  );
}
