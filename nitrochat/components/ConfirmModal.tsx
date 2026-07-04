'use client';

import { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'info';
    /** One dismiss button only; does not call onConfirm (e.g. informational alerts). */
    singleAction?: boolean;
}

export function ConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'danger',
    singleAction = false,
}: ConfirmModalProps) {
    // Close on Escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            return () => document.removeEventListener('keydown', handleEscape);
        }
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const variantColors = {
        danger: 'text-error',
        warning: 'text-warning',
        info: 'text-primary',
    };

    const variantBgColors = {
        danger: 'bg-error/10 hover:bg-error hover:text-white',
        warning: 'bg-warning/10 hover:bg-warning hover:text-white',
        info: 'bg-primary/10 hover:bg-primary hover:text-white',
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-card border border-white/10 rounded-lg shadow-2xl max-w-md w-full">
                {/* Header */}
                <div className="flex items-start justify-between p-6 pb-4">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${variantBgColors[variant]} transition-colors`}>
                            <AlertTriangle className={`w-5 h-5 ${variantColors[variant]}`} />
                        </div>
                        <h3 className="text-lg font-normal text-foreground">{title}</h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-lg text-muted hover:text-foreground hover:bg-white/5 transition-colors"
                        aria-label="Close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="px-6 pb-6">
                    <p className="text-muted leading-relaxed">{message}</p>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 px-6 pb-6">
                    {!singleAction && (
                        <button
                            onClick={onClose}
                            className="px-4 py-2 rounded-lg text-sm font-medium text-muted hover:text-foreground hover:bg-white/5 transition-colors"
                        >
                            {cancelText}
                        </button>
                    )}
                    <button
                        onClick={() => {
                            if (!singleAction) {
                                onConfirm();
                            }
                            onClose();
                        }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium ${variantBgColors[variant]} transition-colors shadow-lg`}
                    >
                        {singleAction ? confirmText || 'OK' : confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
