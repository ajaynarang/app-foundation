'use client';

import { useAuthStore } from '@/features/auth';

const CONSOLE_BASE = process.env.NEXT_PUBLIC_CONSOLE_URL || 'http://localhost:3002';

/**
 * Generate a URL to the SALLY Console app.
 *
 * Simple version — returns a plain URL string for server components and
 * non-interactive contexts (e.g. `<meta>` tags).
 */
export function consoleUrl(path: string = '/'): string {
  return `${CONSOLE_BASE}${path}`;
}

/**
 * Navigate to the SALLY Console with a token relay.
 *
 * Reads the current access token and user from the auth store, appends them
 * as a hash fragment so the console can authenticate in one step — no
 * round-trip through the login page.
 *
 * Works on both same-domain (staging/prod) and cross-origin (localhost).
 * On same-domain the cookie is already shared, but the token relay
 * pre-fills the console's Zustand store so there's zero flash.
 */
export function openConsole(path: string = '/'): void {
  const { accessToken, user } = useAuthStore.getState();
  const base = `${CONSOLE_BASE}${path}`;

  if (accessToken && user) {
    const hash = `#token=${encodeURIComponent(accessToken)}&user=${encodeURIComponent(JSON.stringify(user))}`;
    window.open(`${base}?sso=1${hash}`, '_blank', 'noopener');
  } else {
    // Not authenticated — let the console middleware handle it
    window.open(base, '_blank', 'noopener');
  }
}

/**
 * Navigate to the SALLY Product Manual in the Console app.
 * Opens in same tab — user is leaving to learn, will come back via "Open App".
 * Uses token relay for seamless SSO.
 */
export function openDocs(path: string = ''): void {
  const { accessToken, user } = useAuthStore.getState();
  const base = `${CONSOLE_BASE}/docs/manual${path}`;

  if (accessToken && user) {
    const hash = `#token=${encodeURIComponent(accessToken)}&user=${encodeURIComponent(JSON.stringify(user))}`;
    window.location.href = `${base}?sso=1${hash}`;
  } else {
    window.location.href = base;
  }
}
