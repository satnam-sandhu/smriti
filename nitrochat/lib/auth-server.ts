import { NextRequest } from 'next/server';
import User from '@/models/User';
import connectToDatabase from '@/lib/db';
import { verifyZitadelToken } from '@/lib/zitadel-jwks';
import { checkAccessTokenProjectRoles } from '@/lib/zitadel-auth';

/**
 * Resolves the authenticated user from the request headers.
 * If ZITADEL is enabled, performs cryptographic signature verification via JWKS
 * and asserts required project roles (Flow B). Denies access on failure.
 * Otherwise, falls back to legacy decode-only validation.
 */
export async function getUserFromRequest(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const accessToken = authHeader.split(' ')[1];

  try {
    let payload: Record<string, any>;

    if (process.env.ZITADEL_ENABLED === 'true') {
      // 1. Verify token signature via Zitadel JWKS client
      payload = await verifyZitadelToken(accessToken) as Record<string, any>;

      // 2. Enforce Flow B project role grants
      const enforcement = checkAccessTokenProjectRoles(accessToken);
      if (enforcement.enforced && !enforcement.ok) {
        console.warn('[Zitadel] Access denied in getUserFromRequest:', enforcement.reason);
        return null;
      }
    } else {
      // Decode JWT without verification (legacy fallback)
      const parts = accessToken.split('.');
      if (parts.length !== 3) {
        console.error('Invalid JWT format');
        return null;
      }
      payload = JSON.parse(
        Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()
      );
    }

    // Extract user info from claims
    const email = payload.email || payload.sub; // Use sub as fallback
    const name = payload.name || payload.nickname || email;
    const picture = payload.picture;

    if (!email) {
      console.error('JWT missing email/sub claim');
      return null;
    }

    // Connect to DB and find/create user
    const db = await connectToDatabase();
    if (!db) return null;

    const user = await User.findOneAndUpdate(
      { email },
      {
        email,
        name,
        picture,
        lastLogin: new Date(),
      },
      { upsert: true, new: true }
    );

    return user;
  } catch (error) {
    console.error('Error getting user from JWT:', error);
    return null;
  }
}
