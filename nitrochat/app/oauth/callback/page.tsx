'use client';

import { useEffect } from 'react';

export default function OAuthCallback() {
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const state = params.get('state');
        const error = params.get('error');
        const errorDescription = params.get('error_description');

        if (window.opener) {
            // Running in popup - send message to parent
            if (error) {
                window.opener.postMessage(
                    {
                        type: 'oauth:error',
                        error: errorDescription || error,
                    },
                    '*'
                );
            } else if (code && state) {
                window.opener.postMessage(
                    {
                        type: 'oauth:success',
                        payload: { code, state },
                    },
                    '*'
                );
            }
            // Close popup after sending message
            window.close();
        } else {
            // Running in main window - redirect back to app
            if (error) {
                window.location.href = `/?error=${encodeURIComponent(error)}`;
            } else if (code && state) {
                window.location.href = `/?auth_code=${code}&auth_state=${state}`;
            }
        }
    }, []);

    return (
        <div className="flex items-center justify-center h-screen bg-background">
            <div className="text-center">
                <div className="rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4 opacity-50"></div>
                <p className="text-muted">Completing authentication...</p>
            </div>
        </div>
    );
}
