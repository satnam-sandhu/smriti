/** Standalone chrome — full viewport width with side inset. */

/** ~1rem horizontal inset for header + messages (full width). */
export const STANDALONE_GUTTERS_CLASS = 'w-full px-4';

export const STANDALONE_HEADER_INNER_CLASS = [
  STANDALONE_GUTTERS_CLASS,
  'flex min-h-[76px] items-center justify-between gap-3 py-2.5 sm:min-h-[80px] sm:gap-4 sm:py-3',
].join(' ');

export const STANDALONE_MESSAGES_COLUMN_CLASS = [
  STANDALONE_GUTTERS_CLASS,
  'space-y-2 pb-3 pt-2 sm:space-y-3 sm:pb-4 sm:pt-3',
].join(' ');

export const STANDALONE_FOOTER_OUTER_CLASS =
  'flex-shrink-0 border-t border-border/50 bg-background/95 pb-2 pt-1.5 backdrop-blur-xl';

/** Centered input strip with extra horizontal inset vs messages. */
export const STANDALONE_FOOTER_INNER_CLASS =
  'mx-auto w-full max-w-4xl px-8 sm:max-w-5xl sm:px-10 md:px-12';

export const STANDALONE_CHAT_INPUT_WRAPPER_CLASS = 'w-full pb-4 my-2';

/** @deprecated Use STANDALONE_GUTTERS_CLASS */
export const STANDALONE_CONTENT_SHELL_CLASS = STANDALONE_GUTTERS_CLASS;
