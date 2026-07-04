import { NextRequest, NextResponse } from 'next/server';

/**
 * Refreshes OAuth access token using refresh token
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { refreshToken, tokenEndpoint } = body;

        if (!refreshToken || !tokenEndpoint) {
            return NextResponse.json(
                { error: 'Missing required parameters' },
                { status: 400 }
            );
        }

        // Get OAuth config from environment
        const clientId = process.env.OAUTH_CLIENT_ID;
        const clientSecret = process.env.OAUTH_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
            return NextResponse.json(
                { error: 'OAuth not configured' },
                { status: 500 }
            );
        }

        // Request new access token using refresh token
        const tokenResponse = await fetch(tokenEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: clientId,
                client_secret: clientSecret,
            }),
        });

        if (!tokenResponse.ok) {
            const errorData = await tokenResponse.text();
            console.error('Token refresh failed:', errorData);

            // If refresh fails with 401, token is invalid - user needs to re-login
            if (tokenResponse.status === 401) {
                return NextResponse.json(
                    { error: 'Refresh token expired', requiresLogin: true },
                    { status: 401 }
                );
            }

            return NextResponse.json(
                { error: 'Token refresh failed' },
                { status: tokenResponse.status }
            );
        }

        const tokens = await tokenResponse.json();

        // Calculate expiry timestamp
        const expiresIn = tokens.expires_in || 3600; // Default 1 hour
        const expiresAt = Date.now() + (expiresIn * 1000);

        return NextResponse.json({
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || refreshToken, // Use new refresh token if provided
            expiresAt,
            tokenType: tokens.token_type || 'Bearer',
        });
    } catch (error) {
        console.error('Token refresh error:', error);
        return NextResponse.json(
            { error: 'Failed to refresh token' },
            { status: 500 }
        );
    }
}
