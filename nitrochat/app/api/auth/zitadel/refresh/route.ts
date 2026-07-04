import { NextRequest, NextResponse } from 'next/server';

import { formatFetchErrorChain } from '@/lib/format-fetch-error-chain';
import { checkAccessTokenProjectRoles } from '@/lib/zitadel-auth';
import { verifyZitadelToken } from '@/lib/zitadel-jwks';

/**
 * Refresh a Zitadel access token using a refresh token (parallel to
 * `/api/auth/refresh`). Zitadel requires `offline_access` scope at
 * initial login to receive a refresh token.
 */
export async function POST(request: NextRequest) {
  try {
    if (process.env.ZITADEL_ENABLED !== 'true') {
      return NextResponse.json(
        { error: 'Zitadel login not enabled' },
        { status: 503 },
      );
    }

    const body = await request.json();
    const { refreshToken } = body as { refreshToken?: string };

    if (!refreshToken) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 },
      );
    }

    const issuer = (process.env.ZITADEL_ISSUER || '').replace(/\/+$/, '');
    if (!issuer) {
      return NextResponse.json(
        { error: 'Zitadel issuer not configured' },
        { status: 503 },
      );
    }
    const tokenEndpoint = `${issuer}/oauth/v2/token`;

    const clientId = process.env.ZITADEL_CLIENT_ID;
    const clientSecret = process.env.ZITADEL_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'Zitadel not configured' },
        { status: 503 },
      );
    }

    let tokenResponse: Response;
    try {
      tokenResponse = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });
    } catch (fetchErr) {
      const cause = formatFetchErrorChain(fetchErr);
      console.error('[Zitadel] Refresh token endpoint unreachable:', {
        tokenEndpoint,
        cause,
      });
      return NextResponse.json(
        { error: 'Zitadel token endpoint unreachable', cause },
        { status: 502 },
      );
    }

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('[Zitadel] Refresh failed:', tokenResponse.status, errorData);

      if (tokenResponse.status === 401) {
        return NextResponse.json(
          { error: 'Refresh token expired', requiresLogin: true },
          { status: 401 },
        );
      }

      return NextResponse.json(
        { error: 'Token refresh failed' },
        { status: tokenResponse.status },
      );
    }

    const tokens = await tokenResponse.json();
    const expiresIn = tokens.expires_in || 3600;
    const expiresAt = Date.now() + expiresIn * 1000;

    // Cryptographically verify access token signature using Zitadel JWKS keys
    try {
      await verifyZitadelToken(tokens.access_token);
    } catch (verifyErr) {
      console.error('[Zitadel] Refreshed access token signature validation failed:', verifyErr);
      return NextResponse.json(
        { error: 'Token signature verification failed', details: (verifyErr as Error).message },
        { status: 401 },
      );
    }

    /**
     * Flow B: re-check the project role grant on every refresh so a
     * revocation on Zitadel takes effect within an active session
     * (instead of waiting for the session to expire naturally).
     */
    const enforcement = checkAccessTokenProjectRoles(tokens.access_token);
    if (enforcement.enforced && !enforcement.ok) {
      console.warn('[Zitadel] Refresh denied — missing project role grant:', {
        projectId: enforcement.projectId,
        requiredRoleKeys: enforcement.requiredRoleKeys,
        reason: enforcement.reason,
      });
      return NextResponse.json(
        {
          error: 'No access to this NitroChat deployment',
          code: 'ZITADEL_FORBIDDEN',
          requiresLogin: true,
          requiredRoleKeys: enforcement.requiredRoleKeys,
        },
        { status: 403 },
      );
    }

    return NextResponse.json({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || refreshToken,
      expiresAt,
      tokenType: tokens.token_type || 'Bearer',
    });
  } catch (error) {
    const cause = formatFetchErrorChain(error);
    console.error('[Zitadel] Refresh route error:', cause, error);
    return NextResponse.json(
      { error: 'Failed to refresh token', cause },
      { status: 500 },
    );
  }
}
