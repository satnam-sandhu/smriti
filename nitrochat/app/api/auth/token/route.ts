import { NextRequest, NextResponse } from 'next/server';

/**
 * Exchanges authorization code for OAuth tokens
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { code, codeVerifier, tokenEndpoint, redirectUri: requestRedirectUri } = body;

        if (!code || !codeVerifier || !tokenEndpoint) {
            return NextResponse.json(
                { error: 'Missing required parameters' },
                { status: 400 }
            );
        }

        // Get OAuth config from environment
        const clientId = process.env.OAUTH_CLIENT_ID;
        const clientSecret = process.env.OAUTH_CLIENT_SECRET;
        // Use redirectUri from request if provided (for embed), otherwise use env (for main app)
        const redirectUri = requestRedirectUri || process.env.OAUTH_REDIRECT_URI || 'http://localhost:3003/api/auth/callback';

        if (!clientId || !clientSecret) {
            return NextResponse.json(
                { error: 'OAuth not configured' },
                { status: 500 }
            );
        }

        // Build token request parameters
        const tokenParams: Record<string, string> = {
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            client_id: clientId,
            client_secret: clientSecret,
            code_verifier: codeVerifier,
        };


        // Exchange code for tokens
        const tokenResponse = await fetch(tokenEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams(tokenParams),
        });

        if (!tokenResponse.ok) {
            const errorData = await tokenResponse.text();
            console.error('❌ Token exchange failed with status:', tokenResponse.status);
            console.error('❌ Error response from Auth0:', errorData);
            console.error('❌ Request details:', {
                tokenEndpoint,
                clientId,
                redirectUri,
                hasClientSecret: !!clientSecret,
                hasCode: !!code,
                hasCodeVerifier: !!codeVerifier,
            });
            return NextResponse.json(
                { error: 'Token exchange failed', details: errorData },
                { status: tokenResponse.status }
            );
        }

        const tokens = await tokenResponse.json();

        // Log token info for debugging

        // Calculate expiry timestamp
        const expiresIn = tokens.expires_in || 3600; // Default 1 hour
        const expiresAt = Date.now() + (expiresIn * 1000);

        // Create/update user in MongoDB if configured
        if (process.env.MONGODB_URI && process.env.MONGODB_DB_NAME) {
            try {
                const connectToDatabase = (await import('@/lib/db')).default;
                const User = (await import('@/models/User')).default;

                await connectToDatabase();

                // Fetch user info from OAuth provider
                const userInfoEndpoint = process.env.OAUTH_USERINFO_ENDPOINT ||
                    process.env.OAUTH_TOKEN_ENDPOINT?.replace('/oauth/token', '/userinfo') ||
                    process.env.OAUTH_TOKEN_ENDPOINT?.replace('/token', '/userinfo');

                if (userInfoEndpoint) {
                    const userInfoResponse = await fetch(userInfoEndpoint, {
                        headers: {
                            'Authorization': `Bearer ${tokens.access_token}`
                        }
                    });

                    if (userInfoResponse.ok) {
                        const userInfo = await userInfoResponse.json();
                        const email = userInfo.email;
                        const name = userInfo.name || userInfo.nickname || email;
                        const picture = userInfo.picture;

                        if (email) {
                            await User.findOneAndUpdate(
                                { email },
                                {
                                    email,
                                    name,
                                    picture,
                                    lastLogin: new Date()
                                },
                                { upsert: true, new: true }
                            );
                        }
                    }
                }
            } catch (dbError) {
                console.error('Failed to create/update user in MongoDB:', dbError);
                // Don't fail the login if DB operation fails
            }
        }

        return NextResponse.json({
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt,
            tokenType: tokens.token_type || 'Bearer',
        });
    } catch (error) {
        console.error('Token exchange error:', error);
        return NextResponse.json(
            { error: 'Failed to exchange code for tokens' },
            { status: 500 }
        );
    }
}
