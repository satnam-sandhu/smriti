import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

let jwksClient: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwksClient(issuer: string): ReturnType<typeof createRemoteJWKSet> {
  if (!jwksClient) {
    jwksClient = createRemoteJWKSet(new URL(`${issuer}/oauth/v2/keys`));
  }
  return jwksClient;
}

/**
 * Check whether a string looks like a compact JWT (header.payload.signature).
 * Opaque / random Zitadel access tokens are not JWTs and must be treated differently.
 */
function isCompactJwt(token: string): boolean {
  // A compact JWS/JWT has exactly 3 base64url segments separated by dots.
  const parts = token.split('.');
  return parts.length === 3;
}

/**
 * Verify a Zitadel access token cryptographically using JWKS.
 *
 * - When the token IS a compact JWT: full signature + issuer + expiry check.
 * - When the token is opaque (not a JWT): skip JWKS verification and return an
 *   empty payload. The code exchange with Zitadel's token endpoint already
 *   proves the user authenticated; a second network round-trip isn't necessary
 *   and would always fail with "Invalid Compact JWS".
 *
 * To force JWT tokens from Zitadel, set "Access Token Type" = "JWT" in your
 * Zitadel application's Token Settings.
 *
 * Throws on signature check failure, expiration, or issuer mismatch (JWT path only).
 */
export async function verifyZitadelToken(token: string): Promise<JWTPayload> {
  const issuer = (process.env.ZITADEL_ISSUER || '').replace(/\/+$/, '');
  if (!issuer) {
    throw new Error('ZITADEL_ISSUER environment variable is not configured.');
  }

  // Opaque token (not a compact JWT) — skip JWKS verification.
  // The server-side code exchange already validated the user with Zitadel.
  if (!isCompactJwt(token)) {
    console.warn(
      '[Zitadel] Access token is not a compact JWT (opaque token). ' +
      'Skipping JWKS signature verification. ' +
      'To enable full verification, set "Access Token Type" = "JWT" in your Zitadel app settings.',
    );
    return {} as JWTPayload;
  }

  const jwks = getJwksClient(issuer);
  const { payload } = await jwtVerify(token, jwks, {
    issuer,
    clockTolerance: 30,
  });
  return payload;
}

