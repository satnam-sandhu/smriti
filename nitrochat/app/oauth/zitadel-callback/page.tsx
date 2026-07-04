'use client';

import { useEffect } from 'react';

/**
 * Client-side companion to `/api/auth/zitadel/callback`.
 *
 * Mirrors `app/oauth/callback/page.tsx` but emits Zitadel-namespaced
 * postMessage types (`zitadel:success` / `zitadel:error`) and uses
 * Zitadel-prefixed query params for redirect hand-offs so the main
 * page can distinguish this flow from the pre-existing OAuth one.
 */
export default function ZitadelCallbackPage() {
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const state = params.get('state');
        const error = params.get('error');
        const errorDescription = params.get('error_description');

        if (window.opener) {
            if (error) {
                window.opener.postMessage(
                    {
                        type: 'zitadel:error',
                        error: errorDescription || error,
                    },
                    '*',
                );
            } else if (code && state) {
                window.opener.postMessage(
                    {
                        type: 'zitadel:success',
                        payload: { code, state },
                    },
                    '*',
                );
            }
            window.close();
        } else {
            if (error) {
                window.location.href = `/?zitadel_error=${encodeURIComponent(
                    errorDescription || error,
                )}`;
            } else if (code && state) {
                window.location.href = `/?zitadel_code=${encodeURIComponent(
                    code,
                )}&zitadel_state=${encodeURIComponent(state)}`;
            }
        }
    }, []);

    return (
        <div className="flex items-center justify-center h-screen bg-background">
            <div className="text-center">
                <div className="rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4 opacity-50"></div>
                <p className="text-muted">Completing Zitadel authentication...</p>
            </div>
        </div>
    );
}
