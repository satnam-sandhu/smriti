'use client';

import { useState } from 'react';
import { X, User, Mic, Download, Trash2, ExternalLink } from 'lucide-react';
import { ConfirmModal } from '@/components/ConfirmModal';

export interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** Show User section (export, delete all, ToS, Privacy) */
  isAuthenticated?: boolean;
  onExportChat?: () => void;
  onDeleteAllChats?: () => Promise<void>;
  termsOfServiceUrl?: string;
  privacyPolicyUrl?: string;
  /** Show Voice settings section; button opens voice modal */
  elevenLabsEnabled?: boolean;
  onOpenVoiceSettings?: () => void;
}

export function SettingsPanel({
  isOpen,
  onClose,
  isAuthenticated,
  onExportChat,
  onDeleteAllChats,
  termsOfServiceUrl,
  privacyPolicyUrl,
  elevenLabsEnabled,
  onOpenVoiceSettings,
}: SettingsPanelProps) {
  const [deleteAllConfirmOpen, setDeleteAllConfirmOpen] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  if (!isOpen) return null;

  const hasUserSection = !!isAuthenticated;
  const hasVoiceSection = !!elevenLabsEnabled;

  const handleDeleteAllClick = () => setDeleteAllConfirmOpen(true);

  const handleDeleteAllConfirm = () => {
    setDeleteAllConfirmOpen(false);
    if (!onDeleteAllChats) return;
    setDeletingAll(true);
    onDeleteAllChats()
      .then(() => onClose())
      .finally(() => setDeletingAll(false));
  };

  const handleOpenVoiceSettings = () => {
    onClose();
    onOpenVoiceSettings?.();
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
        <div
          className="absolute inset-0 bg-background/80 backdrop-blur-sm"
          onClick={onClose}
        />

        <div className="relative w-full sm:w-[90vw] sm:max-w-2xl bg-card border border-border rounded-t-lg sm:rounded-lg shadow-2xl max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 z-10 flex items-center justify-between p-4 sm:p-6 border-b border-border bg-card/95 backdrop-blur-sm">
            <h2 className="text-lg sm:text-xl font-normal">Settings</h2>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-background transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 sm:p-6 space-y-6">
            {/* User section */}
            {hasUserSection && (
              <section className="space-y-3">
                <h3 className="text-sm font-medium flex items-center gap-2 text-muted">
                  <User className="w-4 h-4" />
                  Account & data
                </h3>
                <div className="space-y-2">
                  {onExportChat && (
                    <button
                      type="button"
                      onClick={() => {
                        onExportChat();
                        onClose();
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border border-border hover:bg-background transition-colors text-left text-sm"
                    >
                      <Download className="w-4 h-4 flex-shrink-0" />
                      <span>Export current chat</span>
                    </button>
                  )}
                  {onDeleteAllChats && (
                    <button
                      type="button"
                      onClick={handleDeleteAllClick}
                      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border border-border hover:bg-error/10 hover:border-error/30 transition-colors text-left text-sm text-foreground"
                    >
                      <Trash2 className="w-4 h-4 flex-shrink-0" />
                      <span>Delete all chats</span>
                    </button>
                  )}
                  {termsOfServiceUrl && (
                    <a
                      href={termsOfServiceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border border-border hover:bg-background transition-colors text-left text-sm"
                    >
                      <ExternalLink className="w-4 h-4 flex-shrink-0" />
                      <span>Terms of Service</span>
                    </a>
                  )}
                  {privacyPolicyUrl && (
                    <a
                      href={privacyPolicyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border border-border hover:bg-background transition-colors text-left text-sm"
                    >
                      <ExternalLink className="w-4 h-4 flex-shrink-0" />
                      <span>Privacy Policy</span>
                    </a>
                  )}
                </div>
              </section>
            )}

            {/* Voice settings section */}
            {hasVoiceSection && onOpenVoiceSettings && (
              <section className="space-y-3">
                <h3 className="text-sm font-medium flex items-center gap-2 text-muted">
                  <Mic className="w-4 h-4" />
                  Voice
                </h3>
                <button
                  type="button"
                  onClick={handleOpenVoiceSettings}
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border border-border hover:bg-background transition-colors text-left text-sm"
                >
                  <Mic className="w-4 h-4 flex-shrink-0" />
                  <span>Voice settings</span>
                </button>
              </section>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={deleteAllConfirmOpen}
        onClose={() => setDeleteAllConfirmOpen(false)}
        onConfirm={handleDeleteAllConfirm}
        title="Delete all chats"
        message="Are you sure you want to delete all your chats? This cannot be undone."
        confirmText="Delete all"
        cancelText="Cancel"
        variant="danger"
      />
    </>
  );
}
