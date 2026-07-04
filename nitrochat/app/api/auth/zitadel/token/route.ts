import { NextRequest, NextResponse } from 'next/server';

import { formatFetchErrorChain } from '@/lib/format-fetch-error-chain';
import {
  checkAccessTokenProjectRoles,
  decodeJwtPayload,
} from '@/lib/zitadel-auth';
import { verifyZitadelToken } from '@/lib/zitadel-jwks';

/**
 * Exchange an authorization code for Zitadel tokens (parallel to
 * `/api/auth/token`). Uses the PKCE verifier the client kept in
 * sessionStorage plus the server-side `ZITADEL_CLIENT_SECRET`
 * (HTTP Basic / client_secret_post).
 *
 * Optional side effect: when MongoDB is configured, call the Zitadel
 * userinfo endpoint and upsert a `User` row keyed by email — same
 * `models/User` collection the existing OAuth route writes to, so
 * downstream code paths need no changes.
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
    const {
      code,
      codeVerifier,
      redirectUri: requestRedirectUri,
      username,
      password,
    } = body as {
      code?: string;
      codeVerifier?: string;
      redirectUri?: string;
      username?: string;
      password?: string;
    };

    const isDirectPasswordFlow = !!(username && password);

    if (!isDirectPasswordFlow && (!code || !codeVerifier)) {
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
    // Always use server env — the exchange runs on this host; a client-supplied
    // URL (e.g. http://localhost:8080) would target the pod, not the operator's machine.
    const tokenEndpoint = `${issuer}/oauth/v2/token`;

    const clientId = process.env.ZITADEL_CLIENT_ID;
    const clientSecret = process.env.ZITADEL_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'Zitadel not configured' },
        { status: 503 },
      );
    }

    const appUrl =
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'http://localhost:3003';
    const redirectUri =
      requestRedirectUri ||
      process.env.ZITADEL_REDIRECT_URI ||
      `${appUrl.replace(/\/+$/, '')}/api/auth/zitadel/callback`;

    let tokenParams: Record<string, string>;

    if (isDirectPasswordFlow) {
      const orgId =
        process.env.ZITADEL_ORGANIZATION_ID?.trim() ||
        process.env.ZITADEL_ORG_ID?.trim();
      const baseScopes = 'openid profile email offline_access';
      let scope = orgId
        ? `${baseScopes} urn:zitadel:iam:org:id:${orgId}`
        : baseScopes;
      const projectId = process.env.ZITADEL_PROJECT_ID?.trim();
      if (projectId) {
        scope += ` urn:zitadel:iam:org:project:id:${projectId}:aud urn:zitadel:iam:org:projects:roles`;
      }

      tokenParams = {
        grant_type: 'password',
        username: username!,
        password: password!,
        scope,
        client_id: clientId,
        client_secret: clientSecret,
      };
    } else {
      tokenParams = {
        grant_type: 'authorization_code',
        code: code!,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
        code_verifier: codeVerifier!,
      };
    }

    let tokenResponse: Response;
    try {
      tokenResponse = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(tokenParams),
      });
    } catch (fetchErr) {
      const cause = formatFetchErrorChain(fetchErr);
      console.error('[Zitadel] Token endpoint unreachable:', {
        tokenEndpoint,
        cause,
      });
      return NextResponse.json(
        {
          error: 'Zitadel token endpoint unreachable',
          cause,
        },
        { status: 502 },
      );
    }

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('[Zitadel] Token exchange failed:', {
        status: tokenResponse.status,
        tokenEndpoint,
        clientId,
        redirectUri,
        body: errorData,
      });
      return NextResponse.json(
        { error: 'Token exchange failed', details: errorData },
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
      console.error('[Zitadel] Access token signature validation failed:', verifyErr);
      return NextResponse.json(
        { error: 'Token signature verification failed', details: (verifyErr as Error).message },
        { status: 401 },
      );
    }

    /**
     * Flow B: enforce project-role grant on this NitroChat instance.
     *
     * When `ZITADEL_PROJECT_ID` is configured we reject tokens that
     * don't carry one of `ZITADEL_REQUIRED_ROLE_KEYS` (default `member`)
     * on the matching Zitadel project. The check is skipped (legacy)
     * when no project id is configured, so un-backfilled deployments
     * keep working until they are explicitly opted in.
     */
    const enforcement = checkAccessTokenProjectRoles(tokens.access_token);
    if (enforcement.enforced && !enforcement.ok) {
      let heldRoleKeys: string[] = [];
      try {
        const payload = decodeJwtPayload(String(tokens.access_token));
        const claim =
          payload[`urn:zitadel:iam:org:project:${enforcement.projectId}:roles`] ??
          payload['urn:zitadel:iam:org:project:roles'];
        if (claim && typeof claim === 'object' && !Array.isArray(claim)) {
          heldRoleKeys = Object.keys(claim as Record<string, unknown>);
        }
      } catch {
        // ignore decode errors in logging
      }
      console.warn('[Zitadel] Access denied — missing project role grant:', {
        projectId: enforcement.projectId,
        requiredRoleKeys: enforcement.requiredRoleKeys,
        heldRoleKeys,
        reason: enforcement.reason,
      });
      return NextResponse.json(
        {
          error: 'No access to this NitroChat deployment',
          code: 'ZITADEL_FORBIDDEN',
          requiredRoleKeys: enforcement.requiredRoleKeys,
        },
        { status: 403 },
      );
    }

    // Optional: fetch userinfo + upsert into the shared `User`
    // collection so downstream API routes that already call
    // `getUserFromRequest` see a pre-populated profile.
    if (process.env.MONGODB_URI && process.env.MONGODB_DB_NAME) {
      try {
        const connectToDatabase = (await import('@/lib/db')).default;
        const User = (await import('@/models/User')).default;
        await connectToDatabase();

        const issuer = (process.env.ZITADEL_ISSUER || '').replace(/\/+$/, '');
        const userInfoEndpoint = issuer
          ? `${issuer}/oidc/v1/userinfo`
          : tokenEndpoint.replace(/\/oauth\/v2\/token$/, '/oidc/v1/userinfo');

        const userInfoResponse = await fetch(userInfoEndpoint, {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });

        if (userInfoResponse.ok) {
          const userInfo = await userInfoResponse.json();
          const email = userInfo.email;
          const name = userInfo.name || userInfo.nickname || email;
          const picture = userInfo.picture;

          if (email) {
            await User.findOneAndUpdate(
              { email },
              { email, name, picture, lastLogin: new Date() },
              { upsert: true, new: true },
            );
          }
        } else {
          console.warn(
            '[Zitadel] Userinfo fetch failed, skipping user upsert:',
            userInfoResponse.status,
          );
        }
      } catch (dbError) {
        console.error('[Zitadel] Failed to upsert user in MongoDB:', dbError);
        // Login should succeed even if user persistence fails.
      }
    }

    return NextResponse.json({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      idToken: tokens.id_token,
      expiresAt,
      tokenType: tokens.token_type || 'Bearer',
    });
  } catch (error) {
    const cause = formatFetchErrorChain(error);
    console.error('[Zitadel] Token route error:', cause, error);
    return NextResponse.json(
      { error: 'Failed to exchange code for tokens', cause },
      { status: 500 },
    );
  }
}
