'use client';

import { useState, useCallback, useEffect } from 'react';
import { apiClient } from '@/shared/lib/api';
import { showSuccess, showError } from '@app/ui';

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window;
    setIsSupported(supported);
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }

    // Check for existing subscription on mount
    if (supported) {
      navigator.serviceWorker.ready
        .then((registration) => {
          registration.pushManager.getSubscription().then((sub) => {
            setIsSubscribed(!!sub);
          });
        })
        .catch(() => {
          // SW not registered yet — that's fine
        });
    }
  }, []);

  const subscribe = useCallback(async () => {
    if (!isSupported) return false;

    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        showError('Notifications blocked', 'Enable them in your browser settings');
        return false;
      }

      const { publicKey } = await apiClient<{ publicKey: string }>('/push/vapid-key');
      if (!publicKey) return false;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });

      await apiClient('/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });

      setIsSubscribed(true);
      showSuccess('Push notifications enabled');
      return true;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Push subscription failed:', error);
      showError('Failed to enable push notifications');
      return false;
    }
  }, [isSupported]);

  const unsubscribe = useCallback(async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        await apiClient('/push/unsubscribe', {
          method: 'DELETE',
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
      }
      setIsSubscribed(false);
      showSuccess('Push notifications disabled');
      return true;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Push unsubscribe failed:', error);
      showError('Failed to disable push notifications');
      return false;
    }
  }, []);

  return { permission, isSubscribed, isSupported, subscribe, unsubscribe };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
