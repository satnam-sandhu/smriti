import { NextRequest, NextResponse } from 'next/server';

/**
 * Zitadel OIDC callback redirect handler.
 *
 * Zitadel calls back here (`/api/auth/zitadel/callback?code=…&state=…`);
 * we relay to the main page using Zitadel-prefixed query params so
 * the client dispatcher in `app/page.tsx` can distinguish this flow
 * from the pre-existing generic OAuth flow which uses `auth_code=` /
 * `auth_state=`.
 *
 * Gated by `ZITADEL_ENABLED === 'true'`.
 */

/**
 * Without these, Next.js statically renders the route at build time when
 * `ZITADEL_ENABLED` is unset (the early-return path returns a deterministic
 * redirect that does not touch `request.nextUrl.searchParams`). The cached
 * response then locks in the build-time `appUrl` fallback (`http://localhost:3003`)
 * and `ZITADEL_ENABLED !== 'true'` branch — so every callback the deployed pod
 * receives, even after NitroCloud sets `ZITADEL_ENABLED=true` and the deployed
 * `APP_URL`, is served as a stale 307 to localhost with `x-nextjs-cache: HIT`.
 * `/api/config/route.ts` opts out for the same reason; mirror it here.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * The login route encodes the caller's original URL querystring (e.g.
 * `standaloneMode=true&prompt=…`) into the OAuth `state` as
 * `<random>.<base64url(returnQuery)>` so the callback can land back on the
 * same page without a separate cookie or server-side store. State is opaque
 * to Zitadel so this is safe; `.` is not part of the base64url alphabet, so
 * the random CSRF portion never collides with the separator.
 *
 * Returns `''` when the state has no embedded query (older clients, signin
 * started without a returnQuery, or a malformed payload — failing soft keeps
 * auth working even when the round-trip preservation isn't available).
 */
function decodeReturnQueryFromState(state: string | null): string {
  if (!state) return '';
  const dotIdx = state.indexOf('.');
  if (dotIdx === -1) return '';
  const encoded = state.slice(dotIdx + 1);
  if (!encoded) return '';
  try {
    const padded =
      encoded.replace(/-/g, '+').replace(/_/g, '/') +
      '='.repeat((4 - (encoded.length % 4)) % 4);
    return Buffer.from(padded, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

/**
 * Build a redirect URL that preserves the caller's original query params and
 * appends the auth round-trip params. `extras` always wins over `returnQuery`
 * so a stray `zitadel_code` in the saved query cannot shadow the fresh one.
 */
function buildReturnUrl(
  appUrl: string,
  returnQuery: string,
  extras: Record<string, string>,
): URL {
  const url = new URL('/', appUrl);
  if (returnQuery) {
    const original = new URLSearchParams(returnQuery);
    for (const [key, value] of original.entries()) {
      url.searchParams.append(key, value);
    }
  }
  for (const [key, value] of Object.entries(extras)) {
    url.searchParams.set(key, value);
  }
  return url;
}

export async function GET(request: NextRequest) {
  const appUrl =
    process.env.APP_URL ||
    process.env.ZITADEL_REDIRECT_URI?.replace('/api/auth/zitadel/callback', '') ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3003';

  // Read state up front so every error path (including the ZITADEL_ENABLED
  // gate below) lands the user back on the page they came from
  // (e.g. `/?standaloneMode=true&prompt=…`). Failing-soft on decode keeps
  // the existing behaviour for callers that didn't send a `returnQuery`.
  const searchParams = request.nextUrl.searchParams;
  const stateParam = searchParams.get('state');
  const returnQuery = decodeReturnQueryFromState(stateParam);

  try {
    if (process.env.ZITADEL_ENABLED !== 'true') {
      return NextResponse.redirect(
        buildReturnUrl(appUrl, returnQuery, {
          zitadel_error: 'Zitadel login not enabled',
        }),
      );
    }

    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      const errorDescription =
        searchParams.get('error_description') || 'Authentication failed';
      return NextResponse.redirect(
        buildReturnUrl(appUrl, returnQuery, {
          zitadel_error: errorDescription,
        }),
      );
    }

    if (!code || !stateParam) {
      return NextResponse.redirect(
        buildReturnUrl(appUrl, returnQuery, {
          zitadel_error: 'Invalid callback parameters',
        }),
      );
    }

    return NextResponse.redirect(
      buildReturnUrl(appUrl, returnQuery, {
        zitadel_code: code,
        // Forward the full composite state so the client's CSRF check
        // (`getZitadelState() === zitadel_state`) still matches what was
        // saved when login was initiated.
        zitadel_state: stateParam,
      }),
    );
  } catch (error) {
    console.error('[Zitadel] Callback error:', error);
    return NextResponse.redirect(
      buildReturnUrl(appUrl, returnQuery, {
        zitadel_error: 'Callback processing failed',
      }),
    );
  }
}
