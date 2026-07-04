import { NextRequest } from 'next/server';

/**
 * Server-side helper to extract Bearer token from incoming request headers
 * and return headers dictionary containing 'X-End-User-Token' if present.
 */
export function getEndUserGatewayHeaders(request: Request | NextRequest): Record<string, string> {
  const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token) {
      return {
        'X-End-User-Token': token,
      };
    }
  }
  return {};
}
