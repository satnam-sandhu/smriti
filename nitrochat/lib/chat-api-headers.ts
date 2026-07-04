import { getActiveToken } from './chat-persistence-fetch';

/**
 * Returns headers with Authorization bearer token if an authenticated user session exists.
 * Merges with any custom headers provided.
 */
export async function chatApiRequestHeaders(customHeaders?: Record<string, string>): Promise<HeadersInit> {
  const headers = new Headers(customHeaders);
  
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const token = await getActiveToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return Object.fromEntries(headers.entries());
}
