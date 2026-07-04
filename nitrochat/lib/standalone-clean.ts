const PENDING_CLEAN_KEY = 'nitrochat-pending-clean-on-refresh';

interface PendingCleanPayload {
  scope: string;
}

function isPendingCleanPayload(value: unknown): value is PendingCleanPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as PendingCleanPayload).scope === 'string' &&
    (value as PendingCleanPayload).scope.length > 0
  );
}

/** True when URL params request deferred clean-on-refresh after session-end tool success. */
export function shouldArmCleanOnRefresh(searchParams: URLSearchParams): boolean {
  return (
    searchParams.get('standaloneMode') === 'true' &&
    searchParams.get('clean') === 'true' &&
    Boolean(searchParams.get('sessionEndTool')?.trim())
  );
}

/** Record which prompt scope should be cleared on the next page load. */
export function armPendingCleanOnRefresh(scope: string): void {
  if (typeof window === 'undefined' || !scope) return;
  try {
    window.localStorage.setItem(PENDING_CLEAN_KEY, JSON.stringify({ scope }));
  } catch {
    // Quota or private mode — best-effort; refresh will keep history
  }
}

function readPendingCleanScope(remove: boolean): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PENDING_CLEAN_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isPendingCleanPayload(parsed)) {
      if (remove) window.localStorage.removeItem(PENDING_CLEAN_KEY);
      return null;
    }
    if (remove) window.localStorage.removeItem(PENDING_CLEAN_KEY);
    return parsed.scope;
  } catch {
    if (remove) {
      try {
        window.localStorage.removeItem(PENDING_CLEAN_KEY);
      } catch {
        // ignore
      }
    }
    return null;
  }
}

/** Read pending clean scope without removing the flag (for pre-hydration clear). */
export function peekPendingCleanOnRefresh(): string | null {
  return readPendingCleanScope(false);
}

/** Read and remove pending clean flag; returns scope to clear, or null if none. */
export function consumePendingCleanOnRefresh(): string | null {
  return readPendingCleanScope(true);
}

/** Remove pending clean flag without reading (idempotent). */
export function clearPendingCleanOnRefresh(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PENDING_CLEAN_KEY);
  } catch {
    // ignore
  }
}
