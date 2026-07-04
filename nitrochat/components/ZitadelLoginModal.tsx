'use client';

import { useEffect, useState } from 'react';
import { LogIn, X } from 'lucide-react';

/**
 * Parallel to `OAuthLoginModal` — same UX, Zitadel-branded copy.
 * Rendered only when `config.mcp.zitadel.enabled === true`.
 *
 * Keeping it as a separate component (instead of parameterising
 * `OAuthLoginModal`) preserves the "don't touch existing signIn"
 * invariant from the plan.
 */
interface ZitadelLoginModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Display label, typically from `config.mcp.zitadel.loginLabel`. */
    loginLabel?: string;
    onLogin: () => void;
    onPasswordLogin: (username: string, password: string) => void;
    onSocialLogin: (provider: 'google' | 'github') => void;
    isLoading?: boolean;
    /** Shown while exchanging `?zitadel_code=` after the OIDC redirect. */
    completingSignIn?: boolean;
    /** User-visible error from the code→token exchange (e.g. missing server secret). */
    errorMessage?: string | null;
}

export function ZitadelLoginModal({
    isOpen,
    onClose,
    loginLabel = 'Sign in with Zitadel',
    onLogin,
    onPasswordLogin,
    onSocialLogin,
    isLoading = false,
    completingSignIn = false,
    errorMessage = null,
}: ZitadelLoginModalProps) {
    const [mounted, setMounted] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted || !isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-[var(--color-card)] border border-white/10 rounded-lg shadow-2xl max-w-md w-full mx-4 overflow-hidden">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/5 transition-colors text-muted hover:text-white"
                >
                    <X className="w-5 h-5" />
                </button>

                <div className="p-8 text-center">
                    <div className="mb-6 flex justify-center">
                        <div className="h-16 w-16 rounded-md bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                            <span className="text-2xl font-medium text-white">Z</span>
                        </div>
                    </div>

                    <h2 className="text-2xl font-medium mb-2">Sign in with Zitadel</h2>
                    <p className="text-muted mb-6 text-sm">
                        {completingSignIn
                            ? 'Finishing sign-in with Zitadel…'
                            : 'Authenticate with your Zitadel identity or use a connected provider.'}
                    </p>

                    {errorMessage ? (
                        <p className="text-sm text-red-400 mb-6 text-left rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
                            {errorMessage}
                        </p>
                    ) : null}

                    {!completingSignIn ? (
                        <>
                            {/* Credentials Form */}
                            <form onSubmit={(e) => {
                                e.preventDefault();
                                if (username && password) {
                                    onPasswordLogin(username, password);
                                    setPassword('');
                                }
                            }} className="space-y-4 text-left mb-6">
                                <div>
                                    <label className="block text-xs font-medium text-muted mb-1">
                                        Username or Email
                                    </label>
                                    <input
                                        type="text"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        required
                                        className="w-full px-3 py-2 border border-white/10 rounded-lg bg-black/20 focus:outline-none focus:border-primary text-white text-sm"
                                        placeholder="Enter username"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-muted mb-1">
                                        Password
                                    </label>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        className="w-full px-3 py-2 border border-white/10 rounded-lg bg-black/20 focus:outline-none focus:border-primary text-white text-sm"
                                        placeholder="Enter password"
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full flex items-center justify-center gap-3 px-6 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-white font-medium transition-colors shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isLoading ? (
                                        <>
                                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full opacity-50 animate-spin" />
                                            <span>Signing in...</span>
                                        </>
                                    ) : (
                                        <>
                                            <LogIn className="w-5 h-5" />
                                            <span>Sign In</span>
                                        </>
                                    )}
                                </button>
                            </form>

                            {/* Separator */}
                            <div className="relative my-6">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-white/10" />
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-[var(--color-card)] px-2 text-muted text-xs">
                                        Or continue with
                                    </span>
                                </div>
                            </div>

                            {/* Social Buttons */}
                            <div className="grid grid-cols-2 gap-3 mb-6">
                                <button
                                    type="button"
                                    onClick={() => onSocialLogin('google')}
                                    disabled={isLoading}
                                    className="flex items-center justify-center gap-2 px-4 py-2 border border-white/10 rounded-lg hover:bg-white/5 transition-colors text-white text-sm font-medium disabled:opacity-50"
                                >
                                    <span>Google</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onSocialLogin('github')}
                                    disabled={isLoading}
                                    className="flex items-center justify-center gap-2 px-4 py-2 border border-white/10 rounded-lg hover:bg-white/5 transition-colors text-white text-sm font-medium disabled:opacity-50"
                                >
                                    <span>GitHub</span>
                                </button>
                            </div>

                            {/* Legacy Portal Option */}
                            <button
                                type="button"
                                onClick={onLogin}
                                disabled={isLoading}
                                className="text-xs text-primary hover:underline"
                            >
                                {loginLabel}
                            </button>
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-6">
                            <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
                            <p className="text-sm text-muted">Exchanging tokens, please wait...</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
