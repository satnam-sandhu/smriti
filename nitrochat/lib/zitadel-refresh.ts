import {
  getZitadelTokens,
  isZitadelTokenExpired,
  refreshZitadelAccessToken,
  saveZitadelTokens,
  logoutZitadel,
  type ZitadelTokens,
} from './zitadel';

let activeRefreshPromise: Promise<ZitadelTokens | null> | null = null;

/**
 * Get the current active Zitadel access token, performing a silent background
 * refresh using the refresh token if the access token has expired or is about to.
 * Ensures that concurrent calls do not trigger multiple parallel refresh API requests.
 */
export async function getOrRefreshZitadelToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  const tokens = getZitadelTokens();
  if (!tokens) return null;

  if (!isZitadelTokenExpired(tokens)) {
    return tokens.accessToken;
  }

  if (!tokens.refreshToken) {
    logoutZitadel();
    return null;
  }

  if (activeRefreshPromise) {
    const refreshed = await activeRefreshPromise;
    return refreshed ? refreshed.accessToken : null;
  }

  activeRefreshPromise = (async () => {
    try {
      const refreshed = await refreshZitadelAccessToken(tokens.refreshToken!);
      if (refreshed) {
        saveZitadelTokens(refreshed);
        return refreshed;
      } else {
        logoutZitadel();
        return null;
      }
    } catch (error) {
      console.error('[Zitadel] Refresh failed in interceptor:', error);
      return null;
    } finally {
      activeRefreshPromise = null;
    }
  })();

  const refreshed = await activeRefreshPromise;
  return refreshed ? refreshed.accessToken : null;
}

/**
 * Client-side fetch wrapper that automatically manages the Zitadel
 * authorization header and executes silent token refreshes on demand.
 */
export async function fetchWithZitadelRefresh(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const token = await getOrRefreshZitadelToken();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(url, { ...init, headers });
}
