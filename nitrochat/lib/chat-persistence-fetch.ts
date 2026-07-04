import { getZitadelTokens } from './zitadel';
import { getOrRefreshZitadelToken } from './zitadel-refresh';
import { getTokens, isTokenExpired, refreshAccessToken, saveTokens } from './oauth';

/**
 * Resolves the currently active access token.
 * Triggers refresh flows automatically if a session is expired but has a refresh token.
 */
export async function getActiveToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  // 1. Resolve Zitadel Session if present
  const zitadelTokens = getZitadelTokens();
  if (zitadelTokens) {
    return getOrRefreshZitadelToken();
  }

  // 2. Resolve Legacy OAuth Session if present
  const oauthTokens = getTokens();
  if (oauthTokens) {
    if (!isTokenExpired(oauthTokens)) {
      return oauthTokens.accessToken;
    }
    if (oauthTokens.refreshToken) {
      // Look up oauth token endpoint from storage or settings
      const tokenEndpoint = localStorage.getItem('nitrochat_oauth_token_endpoint') || '';
      if (tokenEndpoint) {
        try {
          const refreshed = await refreshAccessToken(oauthTokens.refreshToken, tokenEndpoint);
          if (refreshed) {
            saveTokens(refreshed);
            return refreshed.accessToken;
          }
        } catch (err) {
          console.error('[OAuth] Silent refresh failed:', err);
        }
      }
    }
  }

  return null;
}

/**
 * Unified fetch wrapper for database persistence endpoints.
 * Automatically injects the active bearer token (Zitadel or Legacy OAuth)
 * and resolves silent refreshes behind the scenes.
 */
export async function fetchChatPersistenceApi(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const token = await getActiveToken();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(url, { ...init, headers });
}
