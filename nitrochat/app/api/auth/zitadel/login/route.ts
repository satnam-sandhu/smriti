import { NextRequest, NextResponse } from 'next/server';
import {
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
} from '@/lib/oauth';

/**
 * Cap the round-tripped query so a hostile or oversized inbound URL
 * (e.g. someone hand-crafting `?prompt=<10MB>`) cannot blow up the OAuth
 * `state` parameter past Zitadel's accepted limits.
 */
const MAX_RETURN_QUERY_LENGTH = 1024;

/**
 * Strip the auth round-trip params before encoding the caller's URL.
 * If a previous failed attempt left `zitadel_code=…` in the URL, we must not
 * echo it back into the state — the fresh callback's params always win.
 */
function sanitizeReturnQuery(raw: string): string {
  const search = raw.startsWith('?') ? raw.slice(1) : raw;
  if (!search) return '';
  const params = new URLSearchParams(search);
  const drop = [
    'zitadel_code',
    'zitadel_state',
    'zitadel_error',
    'auth_code',
    'auth_state',
    'auth_error',
    'code',
    'state',
  ];
  for (const key of drop) params.delete(key);
  return params.toString();
}

/**
 * Compose the OAuth state as `<random>.<base64url(returnQuery)>`. The random
 * prefix remains the CSRF token (the client exact-matches it on callback);
 * the suffix is a transparent payload the callback decodes to rebuild the
 * caller's original URL. State is opaque to Zitadel, so this is a safe place
 * to stash a small amount of round-trip data without a session store.
 */
function composeStateWithReturnQuery(
  randomState: string,
  returnQuery: string,
): string {
  const cleaned = sanitizeReturnQuery(returnQuery).slice(
    0,
    MAX_RETURN_QUERY_LENGTH,
  );
  if (!cleaned) return randomState;
  const encoded = Buffer.from(cleaned, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${randomState}.${encoded}`;
}

/**
 * Initiates the Zitadel OIDC login flow (parallel to `/api/auth/login`).
 *
 * Gated by `ZITADEL_ENABLED === 'true'`. Returns 503 otherwise so
 * the endpoint stays inert when the flag is off — mirrors the
 * server-side contract described in the plan.
 *
 * Body (optional): `{ audience?: string, returnQuery?: string, idpHint?: string }`.
 * When `returnQuery` is provided (typically `window.location.search`), it is
 * embedded into the OAuth `state` so the callback can land the user back
 * on the same page (e.g. `/?standaloneMode=true&prompt=…`) instead of
 * dropping their original params. When `idpHint` is provided it overrides
 * the server-side `ZITADEL_IDP_HINT` env var; Zitadel then skips its own
 * hosted login page and redirects directly to the specified external IdP
 * (Google, GitHub, etc.). All other endpoint configuration comes from
 * `ZITADEL_*` env vars or is derived from `ZITADEL_ISSUER`. A runtime
 * body never overrides the server-side client id / client secret.
 */
export async function POST(request: NextRequest) {
  try {
    if (process.env.ZITADEL_ENABLED !== 'true') {
      return NextResponse.json(
        { error: 'Zitadel login not enabled' },
        { status: 503 },
      );
    }

    const issuer = (process.env.ZITADEL_ISSUER || '').replace(/\/+$/, '');
    const clientId = process.env.ZITADEL_CLIENT_ID;
    const audience = process.env.ZITADEL_AUDIENCE || clientId;

    if (!issuer || !clientId) {
      return NextResponse.json(
        { error: 'Zitadel not configured. Set ZITADEL_ISSUER and ZITADEL_CLIENT_ID.' },
        { status: 503 },
      );
    }

    const appUrl =
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'http://localhost:3003';
    const redirectUri =
      process.env.ZITADEL_REDIRECT_URI || `${appUrl.replace(/\/+$/, '')}/api/auth/zitadel/callback`;

    // Allow caller to pass an explicit audience, the page's current querystring,
    // and an IdP hint; fall back to env defaults for all three.
    let effectiveAudience = audience;
    let returnQuery = '';
    // Env is the default; POST body may override for multi-provider button UIs.
    let effectiveIdpHint = process.env.ZITADEL_IDP_HINT?.trim() || '';
    try {
      const body = await request.json();
      if (body && typeof body.audience === 'string' && body.audience.length > 0) {
        effectiveAudience = body.audience;
      }
      if (body && typeof body.returnQuery === 'string') {
        returnQuery = body.returnQuery;
      }
      if (body && typeof body.idpHint === 'string' && body.idpHint.trim().length > 0) {
        effectiveIdpHint = body.idpHint.trim();
      }
    } catch {
      // Body is optional; ignore parse errors and use env defaults.
    }

    // Resolve human-readable provider names to their configured Zitadel IdP IDs.
    // When no real UUID is configured, drop the hint entirely so Zitadel falls
    // back to its hosted login page instead of 404-ing on the abstract name.
    if (effectiveIdpHint === 'google') {
      effectiveIdpHint = process.env.ZITADEL_IDP_GOOGLE_ID?.trim() || '';
    } else if (effectiveIdpHint === 'github') {
      effectiveIdpHint = process.env.ZITADEL_IDP_GITHUB_ID?.trim() || '';
    }

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = composeStateWithReturnQuery(generateState(), returnQuery);

    /**
     * Multi-tenant Zitadel: without this scope, self-registration lands in the
     * instance default org. Reserved scope pins login/register UI and new users
     * to the client's organization — see
     * https://zitadel.com/docs/apis/openidoauth/authrequest (Organization policies and branding).
     */
    const orgId =
      process.env.ZITADEL_ORGANIZATION_ID?.trim() ||
      process.env.ZITADEL_ORG_ID?.trim();
    const baseScopes = 'openid profile email offline_access';
    let scope = orgId
      ? `${baseScopes} urn:zitadel:iam:org:id:${orgId}`
      : baseScopes;
    /**
     * Flow B: when a project id is provisioned for this NitroChat
     * deployment (NitroCloud `instance.zitadelConfig.zitadelProjectId`),
     * request the project-audience + all-projects-roles scopes so the
     * access token carries the role grants we enforce in the token
     * exchange route. Missing in legacy / un-backfilled instances —
     * those keep working with org-scope-only tokens.
     */
    const projectId = process.env.ZITADEL_PROJECT_ID?.trim();
    if (projectId) {
      scope += ` urn:zitadel:iam:org:project:id:${projectId}:aud urn:zitadel:iam:org:projects:roles`;
    }

    const authUrl = new URL(`${issuer}/oauth/v2/authorize`);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scope);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    if (effectiveAudience) {
      authUrl.searchParams.set('audience', effectiveAudience);
    }

    // When an IdP hint is configured, Zitadel skips its own hosted login
    // page and redirects directly to the specified external provider.
    if (effectiveIdpHint) {
      authUrl.searchParams.set('idp_hint', effectiveIdpHint);
      // Don't add prompt=login when using idp_hint — the two are
      // contradictory. prompt=login forces Zitadel to show its own
      // login screen, while idp_hint tells it to skip directly to
      // the external provider.
    } else if (process.env.ZITADEL_PROMPT) {
      // Only apply prompt when there's no IdP hint redirect.
      authUrl.searchParams.set('prompt', process.env.ZITADEL_PROMPT);
    }

    return NextResponse.json({
      authorizationUrl: authUrl.toString(),
      codeVerifier,
      state,
    });
  } catch (error) {
    console.error('[Zitadel] Login init error:', error);
    return NextResponse.json(
      { error: 'Failed to initiate Zitadel login' },
      { status: 500 },
    );
  }
}
