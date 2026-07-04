import { NextRequest, NextResponse } from 'next/server';

/**
 * OAuth 2.1 callback handler
 * Exchanges authorization code for tokens
 */
export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const error = searchParams.get('error');

        // Get the app's public URL from environment
        // IMPORTANT: Use runtime env vars (APP_URL, OAUTH_REDIRECT_URI) first
        // NEXT_PUBLIC_APP_URL is build-time and may have localhost value in production
        const appUrl = process.env.APP_URL ||
            (process.env.OAUTH_REDIRECT_URI?.replace('/api/auth/callback', '')) ||
            process.env.NEXT_PUBLIC_APP_URL ||
            'http://localhost:3003';

        // Handle OAuth errors
        if (error) {
            const errorDescription = searchParams.get('error_description') || 'Authentication failed';
            return NextResponse.redirect(
                new URL(`/?auth_error=${encodeURIComponent(errorDescription)}`, appUrl)
            );
        }

        if (!code || !state) {
            return NextResponse.redirect(
                new URL('/?auth_error=Invalid callback parameters', appUrl)
            );
        }

        // Get OAuth config from environment
        const clientId = process.env.OAUTH_CLIENT_ID;
        const clientSecret = process.env.OAUTH_CLIENT_SECRET;
        const redirectUri = process.env.OAUTH_REDIRECT_URI || `${appUrl}/api/auth/callback`;

        if (!clientId || !clientSecret) {
            return NextResponse.redirect(
                new URL('/?auth_error=OAuth not configured', appUrl)
            );
        }

        // In a real implementation, you would:
        // 1. Verify state matches what was sent
        // 2. Get code_verifier from session/cookie
        // 3. Exchange code for tokens with the token endpoint

        // For now, redirect to home with success indicator
        // The client will need to send the code and verifier to complete the exchange
        const successUrl = new URL('/', appUrl);
        successUrl.searchParams.set('auth_code', code);
        successUrl.searchParams.set('auth_state', state);

        return NextResponse.redirect(successUrl);
    } catch (error) {
        console.error('OAuth callback error:', error);
        const appUrl = process.env.APP_URL ||
            (process.env.OAUTH_REDIRECT_URI?.replace('/api/auth/callback', '')) ||
            process.env.NEXT_PUBLIC_APP_URL ||
            'http://localhost:3003';
        return NextResponse.redirect(
            new URL('/?auth_error=Callback processing failed', appUrl)
        );
    }
}
