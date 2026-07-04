import { NextRequest, NextResponse } from 'next/server';
import { generateCodeVerifier, generateCodeChallenge, generateState } from '@/lib/oauth';

/**
 * Initiates OAuth 2.1 login flow
 * Generates PKCE challenge and returns authorization URL
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { authorizationEndpoint, audience } = body;

        if (!authorizationEndpoint) {
            return NextResponse.json(
                { error: 'Authorization endpoint required' },
                { status: 400 }
            );
        }

        // Get OAuth config from environment
        const clientId = process.env.OAUTH_CLIENT_ID;
        const redirectUri = process.env.OAUTH_REDIRECT_URI || 'http://localhost:3003/api/auth/callback';

        if (!clientId) {
            return NextResponse.json(
                { error: 'OAuth not configured. Please set OAUTH_CLIENT_ID in .env' },
                { status: 500 }
            );
        }

        // Generate PKCE code verifier and challenge
        const codeVerifier = generateCodeVerifier();
        const codeChallenge = await generateCodeChallenge(codeVerifier);
        const state = generateState();

        // Construct authorization URL
        const authUrl = new URL(authorizationEndpoint);
        authUrl.searchParams.set('client_id', clientId);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', 'openid profile email'); // Adjust scopes as needed
        authUrl.searchParams.set('state', state);
        authUrl.searchParams.set('code_challenge', codeChallenge);
        authUrl.searchParams.set('code_challenge_method', 'S256');

        // Add audience if provided (critical for Auth0 to return JWT)
        if (audience) {
            authUrl.searchParams.set('audience', audience);
        }

        return NextResponse.json({
            authorizationUrl: authUrl.toString(),
            codeVerifier,
            state,
        });
    } catch (error) {
        console.error('OAuth login error:', error);
        return NextResponse.json(
            { error: 'Failed to initiate OAuth login' },
            { status: 500 }
        );
    }
}
