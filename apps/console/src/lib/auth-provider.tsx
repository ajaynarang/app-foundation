'use client';

import { useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import { useAuthStore } from './auth-store';

/**
 * Reads #token=...&user=... hash fragment relayed by the main app's login page.
 * Sets Zustand auth state + app-auth cookie so middleware won't redirect again.
 * Returns true if a token relay was consumed (so onAuthStateChanged can skip clearAuth).
 */
function consumeTokenRelay(): boolean {
  if (typeof window === 'undefined') return false;
  const hash = window.location.hash;
  if (!hash.startsWith('#token=')) return false;

  try {
    const params = new URLSearchParams(hash.slice(1)); // strip leading #
    const token = params.get('token');
    const userJson = params.get('user');

    if (!token || !userJson) return false;

    // URLSearchParams already decodes percent-encoding, so just parse the JSON
    const user = JSON.parse(userJson);
    const { setTokens, setUser, setInitialized } = useAuthStore.getState();

    setTokens(token);
    setUser(user); // also sets app-auth cookie + isAuthenticated
    setInitialized(true);

    // Clean up URL: remove hash and ?sso=1 query param
    const url = new URL(window.location.href);
    url.hash = '';
    url.searchParams.delete('sso');
    window.history.replaceState(null, '', url.pathname + (url.search || ''));
    return true;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const setFirebaseUser = useAuthStore((s) => s.setFirebaseUser);
  const setInitialized = useAuthStore((s) => s.setInitialized);
  const _hasHydrated = useAuthStore((s) => s._hasHydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const listenerSet = useRef(false);
  const tokenRelayConsumed = useRef(false);

  // Consume token relay from main app (must run before onAuthStateChanged)
  useEffect(() => {
    if (!_hasHydrated || tokenRelayConsumed.current) return;
    tokenRelayConsumed.current = consumeTokenRelay();
  }, [_hasHydrated]);

  useEffect(() => {
    if (!_hasHydrated || listenerSet.current) return;
    listenerSet.current = true;

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setFirebaseUser(firebaseUser);
        if (accessToken) {
          setInitialized(true);
        }
      } else {
        // Don't clear auth if:
        // 1. We just consumed a token relay from the main app, OR
        // 2. We have a valid access token from localStorage (page reload)
        // Firebase may not have a session for Console's domain, but the JWT is valid
        const hasValidToken = !!useAuthStore.getState().accessToken;
        if (!tokenRelayConsumed.current && !hasValidToken) {
          clearAuth();
        }
        setInitialized(true);
      }
    });

    return () => unsubscribe();
  }, [_hasHydrated, accessToken, setFirebaseUser, setInitialized, clearAuth]);

  return <>{children}</>;
}
