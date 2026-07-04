/**
 * Zitadel login utilities for NitroChat.
 *
 * Fully parallel to `lib/oauth.ts` — same flow shape, separate
 * storage keys, separate refresh endpoint, separate helpers. PKCE
 * primitives (`generateCodeVerifier`, `generateCodeChallenge`,
 * `generateState`, `parseJwtExpiryMs`) are re-exported from the
 * existing `lib/oauth.ts` so there is exactly one implementation.
 */

import { parseJwtExpiryMs } from './oauth';
import { getCookie, setCookie, deleteCookie } from './cookies';

// PKCE primitives are reused verbatim from the existing OAuth module.
export {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  parseJwtExpiryMs,
} from './oauth';

/**
 * Storage keys — deliberately distinct from `nitrochat_oauth_tokens`
 * so a user can have both sessions active at the same time.
 */
const ZITADEL_TOKEN_STORAGE_KEY = 'nitrochat_zitadel_tokens';
const ZITADEL_CODE_VERIFIER_KEY = 'nitrochat_zitadel_code_verifier';
const ZITADEL_STATE_KEY = 'nitrochat_zitadel_state';

export interface ZitadelTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  tokenType: string;
}

export function saveZitadelTokens(tokens: ZitadelTokens): void {
  localStorage.setItem(ZITADEL_TOKEN_STORAGE_KEY, JSON.stringify(tokens));
}

export function getZitadelTokens(): ZitadelTokens | null {
  const stored = localStorage.getItem(ZITADEL_TOKEN_STORAGE_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export function clearZitadelTokens(): void {
  localStorage.removeItem(ZITADEL_TOKEN_STORAGE_KEY);
}

export function isZitadelTokenExpired(tokens: ZitadelTokens | null): boolean {
  if (!tokens) return true;
  // 60s buffer so we refresh slightly before Zitadel actually rejects.
  return Date.now() >= tokens.expiresAt - 60_000;
}

export function getZitadelAccessToken(): string | null {
  const tokens = getZitadelTokens();
  if (!tokens || isZitadelTokenExpired(tokens)) return null;
  return tokens.accessToken;
}



export function saveZitadelCodeVerifier(verifier: string): void {
  sessionStorage.setItem(ZITADEL_CODE_VERIFIER_KEY, verifier);
  setCookie(ZITADEL_CODE_VERIFIER_KEY, verifier, 600); // 10 minutes expiry
}

export function getZitadelCodeVerifier(): string | null {
  return sessionStorage.getItem(ZITADEL_CODE_VERIFIER_KEY) || getCookie(ZITADEL_CODE_VERIFIER_KEY);
}

export function clearZitadelCodeVerifier(): void {
  sessionStorage.removeItem(ZITADEL_CODE_VERIFIER_KEY);
  deleteCookie(ZITADEL_CODE_VERIFIER_KEY);
}

export function saveZitadelState(state: string): void {
  sessionStorage.setItem(ZITADEL_STATE_KEY, state);
  setCookie(ZITADEL_STATE_KEY, state, 600); // 10 minutes expiry
}

export function getZitadelState(): string | null {
  return sessionStorage.getItem(ZITADEL_STATE_KEY) || getCookie(ZITADEL_STATE_KEY);
}

export function clearZitadelState(): void {
  sessionStorage.removeItem(ZITADEL_STATE_KEY);
  deleteCookie(ZITADEL_STATE_KEY);
}

/**
 * Exchange a refresh token for a new access token via the server-side
 * refresh route. Returns `null` when the server refuses (e.g. refresh
 * token has expired and the user must log in again).
 */
export async function refreshZitadelAccessToken(
  refreshToken: string,
): Promise<ZitadelTokens | null> {
  try {
    const response = await fetch('/api/auth/zitadel/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      console.error(
        '[Zitadel] Failed to refresh token:',
        response.statusText,
      );
      return null;
    }

    const data = await response.json();
    if (!data.accessToken) return null;

    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken || refreshToken,
      expiresAt: data.expiresAt,
      tokenType: data.tokenType || 'Bearer',
    };
  } catch (error) {
    console.error('[Zitadel] Error refreshing token:', error);
    return null;
  }
}

/** True when a non-expired Zitadel session exists in localStorage. */
export function isZitadelAuthenticated(): boolean {
  const tokens = getZitadelTokens();
  return tokens !== null && !isZitadelTokenExpired(tokens);
}

/**
 * Clear every Zitadel-local artifact (tokens, PKCE verifier, state).
 * Does NOT touch the existing OAuth session — they are independent.
 */
export function logoutZitadel(): void {
  clearZitadelTokens();
  clearZitadelCodeVerifier();
  clearZitadelState();
}

/**
 * Prefer JWT `exp` for accuracy when the provider returns an id_token
 * or JWT access token; fall back to `expires_in` seconds from the
 * token endpoint. Kept here so callers don't need to import both
 * modules just to compute an expiry.
 */
export function computeZitadelExpiryMs(
  accessToken: string,
  fallbackExpiresInSeconds?: number,
): number {
  const fromJwt = parseJwtExpiryMs(accessToken);
  if (typeof fromJwt === 'number') return fromJwt;
  const seconds = fallbackExpiresInSeconds ?? 3600;
  return Date.now() + seconds * 1000;
}
