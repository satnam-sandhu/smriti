'use client';

import { Toaster } from 'sonner';

export function AppToaster() {
  return (
    <Toaster
      position="top-center"
      richColors
      closeButton
      duration={6000}
      toastOptions={{
        classNames: {
          toast:
            'font-sans border border-[var(--color-border)] bg-[var(--color-alert-bg)] text-[var(--color-alert-text)]',
        },
      }}
    />
  );
}
