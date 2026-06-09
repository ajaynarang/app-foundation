'use client';

/**
 * AuthProvider - Firebase auth sync + cross-subdomain SSO relay handler
 *
 * 1. Keeps firebaseUser in sync with Firebase auth state.
 * 2. On mount, checks for `#sso-relay=...` hash fragment. If present,
 *    hydrates the Zustand auth store from the relayed token + user.
 *    This solves the localStorage-is-origin-scoped problem: when a user
 *    logs in on the bare domain and gets redirected to a tenant subdomain,
 *    the auth state must be carried in the URL hash because localStorage
 *    on the new origin is empty.
 */

import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, isFirebaseConfigured } from '@/shared/lib/firebase';
import { useAuthStore } from '@/features/auth';

const SSO_RELAY_PREFIX = '#sso-relay=';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const setFirebaseUser = useAuthStore((state) => state.setFirebaseUser);

  // Cross-subdomain SSO relay: hydrate auth store from hash fragment
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (!hash.startsWith(SSO_RELAY_PREFIX)) return;

    try {
      const payload = decodeURIComponent(hash.slice(SSO_RELAY_PREFIX.length));
      const { accessToken, user } = JSON.parse(payload);
      if (accessToken && user) {
        const { setTokens, setUser } = useAuthStore.getState();
        setTokens(accessToken);
        setUser(user);
      }
    } catch {
      // Invalid relay payload — ignore, auth will fall through to login
    }

    // Always clear the hash to avoid token leaking in history/bookmarks
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);

  // Firebase auth state sync — skipped until Firebase is configured so a fresh
  // clone of the starter renders without crashing.
  useEffect(() => {
    if (!isFirebaseConfigured || !auth) return;

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setFirebaseUser(firebaseUser);
    });

    return () => unsubscribe();
  }, [setFirebaseUser]);

  return <>{children}</>;
}
