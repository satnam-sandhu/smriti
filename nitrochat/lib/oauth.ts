/**
 * OAuth 2.1 Utilities for NitroChat
 * Handles PKCE, token storage, and OAuth flow
 */

import { getCookie, setCookie, deleteCookie } from './cookies';

// PKCE (Proof Key for Code Exchange) utilities
export function generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return base64URLEncode(array);
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return base64URLEncode(new Uint8Array(hash));
}

function base64URLEncode(buffer: Uint8Array): string {
    const base64 = btoa(String.fromCharCode(...buffer));
    return base64
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

// Generate random state for CSRF protection
export function generateState(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return base64URLEncode(array);
}

// Token storage in localStorage
const TOKEN_STORAGE_KEY = 'nitrochat_oauth_tokens';
const CODE_VERIFIER_KEY = 'nitrochat_code_verifier';
const STATE_KEY = 'nitrochat_oauth_state';

export interface OAuthTokens {
    accessToken: string;
    refreshToken?: string;
    expiresAt: number; // Unix timestamp
    tokenType: string;
}

export function saveTokens(tokens: OAuthTokens): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
}

export function getTokens(): OAuthTokens | null {
    if (typeof window === 'undefined') return null;
    const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!stored) return null;

    try {
        return JSON.parse(stored);
    } catch {
        return null;
    }
}

/** JWT `exp` claim as milliseconds since epoch, or null if missing or not a JWT. */
export function parseJwtExpiryMs(accessToken: string): number | null {
    try {
        const parts = accessToken.split('.');
        if (parts.length < 2) return null;
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
        const payload = JSON.parse(atob(padded)) as { exp?: unknown };
        return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
    } catch {
        return null;
    }
}

export function clearTokens(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export function isTokenExpired(tokens: OAuthTokens | null): boolean {
    if (!tokens) return true;
    // Add 60 second buffer to refresh before actual expiry
    return Date.now() >= (tokens.expiresAt - 60000);
}

export function getAccessToken(): string | null {
    const tokens = getTokens();
    if (!tokens || isTokenExpired(tokens)) {
        return null;
    }
    return tokens.accessToken;
}



// PKCE code verifier storage (temporary, for OAuth flow)
export function saveCodeVerifier(verifier: string): void {
    sessionStorage.setItem(CODE_VERIFIER_KEY, verifier);
    setCookie(CODE_VERIFIER_KEY, verifier, 600); // 10 minutes expiry
}

export function getCodeVerifier(): string | null {
    return sessionStorage.getItem(CODE_VERIFIER_KEY) || getCookie(CODE_VERIFIER_KEY);
}

export function clearCodeVerifier(): void {
    sessionStorage.removeItem(CODE_VERIFIER_KEY);
    deleteCookie(CODE_VERIFIER_KEY);
}

// State storage (temporary, for CSRF protection)
export function saveState(state: string): void {
    sessionStorage.setItem(STATE_KEY, state);
    setCookie(STATE_KEY, state, 600); // 10 minutes expiry
}

export function getState(): string | null {
    return sessionStorage.getItem(STATE_KEY) || getCookie(STATE_KEY);
}

export function clearState(): void {
    sessionStorage.removeItem(STATE_KEY);
    deleteCookie(STATE_KEY);
}

export async function refreshAccessToken(refreshToken: string, tokenEndpoint: string): Promise<OAuthTokens | null> {
    try {
        const response = await fetch('/api/auth/refresh', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                refreshToken,
                tokenEndpoint,
            }),
        });

        if (!response.ok) {
            console.error('Failed to refresh token:', response.statusText);
            return null;
        }

        const data = await response.json();
        if (data.accessToken) {
            return {
                accessToken: data.accessToken,
                refreshToken: data.refreshToken || refreshToken, // Use new refresh token if provided, else keep old
                expiresAt: data.expiresAt,
                tokenType: data.tokenType || 'Bearer',
            };
        }
        return null;
    } catch (error) {
        console.error('Error refreshing token:', error);
        return null;
    }
}



// Check if user is authenticated
export function isAuthenticated(): boolean {
    const tokens = getTokens();
    return tokens !== null && !isTokenExpired(tokens);
}

// Logout
export function logout(): void {
    clearTokens();
    clearCodeVerifier();
    clearState();
}
