/**
 * Push notification utilities for the driver view.
 * Uses the Web Push API / Notification API.
 */

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function isPushEnabled(): boolean {
  if (!isPushSupported()) return false;
  return Notification.permission === 'granted';
}

export async function requestPushPermission(): Promise<NotificationPermission> {
  if (!isPushSupported()) return 'denied';
  return Notification.requestPermission();
}

export async function subscribeToPush(): Promise<boolean> {
  const permission = await requestPushPermission();
  if (permission !== 'granted') return false;

  // In a full implementation, register service worker + create PushSubscription
  // and send to backend. For now we just track the permission.
  return true;
}

export async function unsubscribeFromPush(): Promise<void> {
  // In a full implementation, unregister push subscription from backend
}
