'use client';

import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SSE_EVENTS } from '@sally/shared-types';
import { useSseEvent } from '@/shared/realtime';
import { queryKeys } from '@/shared/constants/query-keys';
import { playAlertSound } from '@/shared/lib/alert-sounds';
import { openConsole } from '@/shared/lib/console-url';

const CONSOLE_URL_PREFIX = 'console:';
const TOAST_DURATION_MS = 5_000;

/**
 * Side effects for notification:new — toast with action link, sound +
 * browser notification when the tab is unfocused, plus a notifications
 * list invalidation.
 */
export function useNotificationStream(): void {
  const queryClient = useQueryClient();

  useSseEvent(SSE_EVENTS.NOTIFICATION_NEW, (n) => {
    if (!document.hasFocus()) {
      if (n.playSound) playAlertSound('medium');
      if (n.showBrowserNotification && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(n.title, { body: n.message, tag: `notification-${n.notificationId}` });
      }
    }

    queryClient.invalidateQueries({ queryKey: queryKeys.notifications.root });

    toast(n.title, {
      description: n.message,
      duration: TOAST_DURATION_MS,
      action: n.actionUrl
        ? {
            label: n.actionLabel ?? 'View',
            onClick: () => {
              const url = n.actionUrl!;
              if (url.startsWith(CONSOLE_URL_PREFIX)) {
                openConsole(url.slice(CONSOLE_URL_PREFIX.length));
              } else {
                window.location.assign(url);
              }
            },
          }
        : undefined,
    });
  });
}
