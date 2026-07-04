/**
 * Undici often throws `TypeError: fetch failed` with the real reason on
 * `error.cause` (DNS, TLS, ECONNREFUSED, etc.). Use this in API routes
 * when logging or returning diagnostics.
 */
export function formatFetchErrorChain(error: unknown): string {
  const segments: string[] = [];
  let current: unknown = error;
  const seen = new Set<unknown>();

  for (let depth = 0; current != null && depth < 10; depth += 1) {
    if (seen.has(current)) break;
    seen.add(current);

    if (current instanceof Error) {
      const msg = current.message?.trim();
      if (msg) segments.push(msg);
      const code = (current as NodeJS.ErrnoException).code;
      if (typeof code === 'string' && !msg?.includes(code)) {
        segments.push(code);
      }
      current = current.cause;
      continue;
    }

    if (typeof current === 'object') {
      const o = current as NodeJS.ErrnoException & { hostname?: string };
      const extra = [o.code, o.errno, o.syscall, o.hostname]
        .filter((v) => v != null && v !== '')
        .join(' ');
      if (extra) segments.push(extra);
      break;
    }

    segments.push(String(current));
    break;
  }

  return segments.join(' → ') || 'unknown';
}
