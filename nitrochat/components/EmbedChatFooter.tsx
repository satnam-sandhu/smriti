'use client';

import type { CSSProperties, ReactNode } from 'react';
import {
  STANDALONE_FOOTER_INNER_CLASS,
  STANDALONE_FOOTER_OUTER_CLASS,
} from '@/lib/standalone-layout';
import { cn } from '@/lib/utils';

interface EmbedChatFooterProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/**
 * Input/footer strip — themed chat-area background; matches standalone footer chrome.
 */
export function EmbedChatFooter({ children, className, style }: EmbedChatFooterProps) {
  return (
    <div className={cn(STANDALONE_FOOTER_OUTER_CLASS, className)} style={style}>
      <div className={STANDALONE_FOOTER_INNER_CLASS}>{children}</div>
    </div>
  );
}
