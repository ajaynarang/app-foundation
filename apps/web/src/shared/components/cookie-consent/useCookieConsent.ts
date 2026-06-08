'use client';

import { useState, useEffect, useCallback } from 'react';
import { STORAGE_KEYS } from '@/shared/constants';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface CookiePreferences {
  essential: boolean; // always true, locked
  analytics: boolean;
}

export interface CookieConsentState {
  preferences: CookiePreferences;
  hasConsented: boolean | null; // null = loading
  showBanner: boolean;
  showManage: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const COOKIE_KEY = 'sally-cookies';
const CONSENT_EVENT = 'sally:open-cookie-manage';

const DEFAULT_PREFERENCES: CookiePreferences = {
  essential: true,
  analytics: false,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? ';Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax${secure}`;
}

function persist(preferences: CookiePreferences) {
  const payload = JSON.stringify(preferences);
  try {
    localStorage.setItem(STORAGE_KEYS.COOKIE_CONSENT, payload);
  } catch {
    // localStorage may be disabled (private browsing, storage full, etc.)
    // Cookie fallback below will still run
  }
  setCookie(COOKIE_KEY, payload, 365);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useCookieConsent() {
  const [preferences, setPreferences] = useState<CookiePreferences>(DEFAULT_PREFERENCES);
  const [hasConsented, setHasConsented] = useState<boolean | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showManage, setShowManage] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.COOKIE_CONSENT);
      if (stored) {
        const parsed = JSON.parse(stored) as CookiePreferences;
        setPreferences({ ...parsed, essential: true });
        setHasConsented(true);
        setShowBanner(false);
      } else {
        setHasConsented(false);
        setShowBanner(true);
      }
    } catch {
      setHasConsented(false);
      setShowBanner(true);
    }
  }, []);

  // Listen for global event to re-open manage panel from footer link
  useEffect(() => {
    const handler = () => {
      setShowBanner(true);
      setShowManage(true);
    };
    window.addEventListener(CONSENT_EVENT, handler);
    return () => window.removeEventListener(CONSENT_EVENT, handler);
  }, []);

  const acceptAll = useCallback(() => {
    const prefs: CookiePreferences = { essential: true, analytics: true };
    setPreferences(prefs);
    persist(prefs);
    setHasConsented(true);
    setShowBanner(false);
    setShowManage(false);
  }, []);

  const rejectAll = useCallback(() => {
    const prefs: CookiePreferences = { essential: true, analytics: false };
    setPreferences(prefs);
    persist(prefs);
    setHasConsented(true);
    setShowBanner(false);
    setShowManage(false);
  }, []);

  const savePreferences = useCallback((updated: CookiePreferences) => {
    const prefs = { ...updated, essential: true };
    setPreferences(prefs);
    persist(prefs);
    setHasConsented(true);
    setShowBanner(false);
    setShowManage(false);
  }, []);

  const openManage = useCallback(() => setShowManage(true), []);
  const closeManage = useCallback(() => setShowManage(false), []);
  const closeBanner = useCallback(() => {
    setShowBanner(false);
    setShowManage(false);
  }, []);

  return {
    preferences,
    hasConsented,
    showBanner,
    showManage,
    acceptAll,
    rejectAll,
    savePreferences,
    openManage,
    closeManage,
    closeBanner,
  };
}

// ─── Global dispatch helper ───────────────────────────────────────────────────
export function openCookiePreferences() {
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT));
}
