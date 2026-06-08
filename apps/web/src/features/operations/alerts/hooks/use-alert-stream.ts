'use client';

import { SSE_EVENTS } from '@sally/shared-types';
import { useSseEvent } from '@/shared/realtime';
import { playAlertSound } from '@/shared/lib/alert-sounds';

/**
 * Side effects for alert:new — sound + browser notification when the tab
 * is unfocused. Mount once near the top of any layout that should react
 * to incoming alerts (dispatcher, admin).
 */
export function useAlertStream(): void {
  useSseEvent(SSE_EVENTS.ALERT_NEW, (alert) => {
    if (document.hasFocus()) return;
    if (alert.playSound) playAlertSound(alert.priority);
    if (alert.showBrowserNotification && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(alert.title, {
        body: alert.message,
        tag: `alert-${alert.alertId}`,
      });
    }
  });
}
