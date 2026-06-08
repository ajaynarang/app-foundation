'use client';

import { useState, useEffect, useCallback } from 'react';
import { create } from 'zustand';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/store';
import { resolvePostLoginRedirect } from '@/shared/lib/navigation';
import { buildTenantRedirectUrl, buildTenantUrl } from '@/shared/lib/tenant-url';
import { showError } from '@sally/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { SESSION_KEYS } from '@/shared/constants';

/**
 * Dev tools visibility store.
 *
 * Dev tools (switcher trigger in header, banner at bottom) are invisible
 * until the user presses Ctrl+Shift+>. This persists for the session.
 */
const useDevSwitcherStore = create<{
  isOpen: boolean;
  visible: boolean;
  setIsOpen: (v: boolean) => void;
  open: () => void;
  close: () => void;
  reveal: () => void;
  hide: () => void;
}>((set) => ({
  isOpen: false,
  visible: false,
  setIsOpen: (v) => set({ isOpen: v }),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  reveal: () => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(SESSION_KEYS.DEV_GHOST_VISIBLE, '1');
    }
    set({ visible: true });
  },
  hide: () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(SESSION_KEYS.DEV_GHOST_VISIBLE);
    }
    set({ visible: false, isOpen: false });
  },
}));

// Ctrl+Shift+> toggles dev tools visibility
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === '>' || e.key === '.' || e.code === 'Period')) {
      e.preventDefault();
      const { visible, reveal, hide } = useDevSwitcherStore.getState();
      if (visible) {
        hide();
      } else {
        reveal();
      }
    }
  });

  // Long-press on mobile logo dispatches this event
  window.addEventListener('dev-switcher:toggle', () => {
    const { visible, reveal, hide } = useDevSwitcherStore.getState();
    if (visible) {
      hide();
    } else {
      reveal();
    }
  });
}

interface DevUser {
  userId: string;
  email: string | null;
  firstName: string;
  lastName: string;
  role: string;
  driverId?: string | null;
  phone?: string | null;
}

interface DevTenant {
  tenantId: string;
  tenantName: string;
  users: DevUser[];
}

interface DevUsersResponse {
  tenants: DevTenant[];
  superAdmins: DevUser[];
}

export function useDevSwitcher() {
  const { isOpen, setIsOpen, open, close, visible, reveal, hide } = useDevSwitcherStore();

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEYS.DEV_GHOST_VISIBLE) === '1' && !useDevSwitcherStore.getState().visible) {
      useDevSwitcherStore.setState({ visible: true });
    }
  }, []);
  const [data, setData] = useState<DevUsersResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSwitching, setIsSwitching] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { setUser, setTokens } = useAuthStore();
  const currentUser = useAuthStore((s) => s.user);

  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setIsMaintenanceMode(false);
    try {
      // Check maintenance status before hitting backend
      const statusRes = await fetch('/api/maintenance-status', { cache: 'no-store' });
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        if (statusData?.enabled) {
          setIsMaintenanceMode(true);
          setIsLoading(false);
          return;
        }
      }

      const res = await fetch(`/api/dev/users`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch dev users');
      const json: DevUsersResponse = await res.json();
      setData(json);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[DevSwitcher] Failed to fetch users:', err);
      showError('Failed to load dev users');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && !data) fetchUsers();
  }, [isOpen, data, fetchUsers]);

  const switchToUser = useCallback(
    async (userId: string) => {
      setIsSwitching(userId);
      try {
        const res = await fetch(`/api/dev/switch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });
        if (!res.ok) throw new Error('Switch failed');
        const result = await res.json();
        setTokens(result.accessToken);
        setUser(result.user);
        queryClient.clear();
        close();
        await new Promise((r) => setTimeout(r, 50));
        const redirect = searchParams.get('redirect');
        const returnTo = searchParams.get('returnTo');
        const { url, isExternal } = resolvePostLoginRedirect({
          redirect,
          returnTo,
          role: result.user.role,
        });
        if (isExternal) {
          const hash = `#token=${encodeURIComponent(result.accessToken)}&user=${encodeURIComponent(JSON.stringify(result.user))}`;
          const separator = url.includes('?') ? '&' : '?';
          window.location.href = url + separator + 'sso=1' + hash;
        } else {
          // Redirect to tenant subdomain with auth relay (localStorage is origin-scoped)
          const subdomain = result.user.subdomain;
          if (subdomain) {
            const relayUrl = buildTenantRedirectUrl(subdomain, url, result.accessToken, result.user);
            if (relayUrl) {
              window.location.href = relayUrl;
              return;
            }
          }
          router.push(url);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[DevSwitcher] Switch failed:', err);
        showError('Failed to switch user');
      } finally {
        setIsSwitching(null);
      }
    },
    [router, searchParams, setTokens, setUser, queryClient, close],
  );

  const openAsNewTab = useCallback(
    async (userId: string) => {
      try {
        const res = await fetch(`/api/dev/switch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });
        if (!res.ok) throw new Error('Switch failed');
        const result = await res.json();
        const payload = encodeURIComponent(JSON.stringify({ accessToken: result.accessToken, user: result.user }));
        const currentSearch = window.location.search;
        // Open on the tenant's subdomain so the login page lands on the right domain
        const subdomain = result.user.subdomain;
        const loginPath = `/login${currentSearch}#dev-switch=${payload}`;
        const targetUrl = subdomain ? buildTenantUrl(subdomain, loginPath) : loginPath;
        window.open(targetUrl !== loginPath ? targetUrl : loginPath, '_blank');
        close();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[DevSwitcher] Open new tab failed:', err);
        showError('Failed to open user in new tab');
      }
    },
    [close],
  );

  const refetch = useCallback(() => {
    setData(null);
    fetchUsers();
  }, [fetchUsers]);

  return {
    isOpen,
    setIsOpen,
    open,
    close,
    visible,
    reveal,
    hide,
    data,
    isLoading,
    isSwitching,
    isMaintenanceMode,
    switchToUser,
    openAsNewTab,
    currentUser,
    refetch,
  };
}
