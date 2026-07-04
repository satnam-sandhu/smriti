'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';
import { useChatStore } from '@/lib/store';

const TOAST_ID = 'nitrochat-persist-quota';

export function PersistStorageQuotaNotice() {
  const blocked = useChatStore((s) => s.persistStorageQuotaBlocked);

  useEffect(() => {
    if (!blocked) {
      toast.dismiss(TOAST_ID);
      return;
    }

    const finish = () => {
      useChatStore.getState().dismissPersistStorageQuotaNotice();
      toast.dismiss(TOAST_ID);
    };

    toast.error('Browser storage for this site is full', {
      id: TOAST_ID,
      description:
        'NitroChat cannot save your session until space is freed. Clear this chat or all local chats, or remove site data in your browser settings.',
      duration: Infinity,
      action: {
        label: 'Clear this chat',
        onClick: () => {
          useChatStore.getState().clearMessages();
          finish();
        },
      },
      cancel: {
        label: 'Clear all local',
        onClick: () => {
          useChatStore.getState().clearAllUrlPromptConversations();
          finish();
        },
      },
      onDismiss: () => {
        useChatStore.getState().dismissPersistStorageQuotaNotice();
      },
    });
  }, [blocked]);

  return null;
}
