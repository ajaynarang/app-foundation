'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LoginForm } from '@/features/auth';
import type { TenantBranding } from '@/features/auth';
import { useAuthStore } from '@/features/auth';
import { getValidToken, resolvePostLoginRedirect } from '@/shared/lib/navigation';
import { buildTenantRedirectUrl, extractSubdomain } from '@/shared/lib/tenant-url';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, _hasHydrated, user } = useAuthStore();
  const [tenantBranding, setTenantBranding] = useState<TenantBranding | null>(null);

  const returnTo = searchParams.get('returnTo');

  // Fetch tenant branding when on a subdomain
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const slug = extractSubdomain(window.location.hostname);
    if (!slug) return;

    fetch(`${API_BASE}/tenants/branding/${slug}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setTenantBranding(data);
      })
      .catch(() => {}); // Fail silently — show generic login
  }, []);

  // Track whether the dev switcher is handling the redirect (prevents race with auth useEffect)
  const devSwitchHandledRef = useRef(false);

  // Dev Switcher: auto-login from new-tab token relay (reads hash fragment).
  // Must run BEFORE the auth redirect useEffect so it can set the flag.
  useEffect(() => {
    if (!_hasHydrated) return;
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (!hash.startsWith('#dev-switch=')) return;

    try {
      const payload = decodeURIComponent(hash.slice('#dev-switch='.length));
      const { accessToken, user: devUser } = JSON.parse(payload);
      if (accessToken && devUser) {
        devSwitchHandledRef.current = true;
        const { setTokens, setUser } = useAuthStore.getState();
        setTokens(accessToken);
        setUser(devUser);
        window.location.hash = '';

        const redirect = searchParams.get('redirect');
        const { url, isExternal } = resolvePostLoginRedirect({
          redirect,
          returnTo,
          role: devUser.role,
        });

        if (isExternal) {
          const relayHash = `#token=${encodeURIComponent(accessToken)}&user=${encodeURIComponent(JSON.stringify(devUser))}`;
          window.location.href = url + relayHash;
        } else {
          // Redirect to tenant subdomain with auth relay (localStorage is origin-scoped)
          if (devUser.subdomain) {
            const relayUrl = buildTenantRedirectUrl(devUser.subdomain, url, accessToken, devUser);
            if (relayUrl) {
              window.location.href = relayUrl;
              return;
            }
          }
          router.replace(url);
        }
      }
    } catch {
      // Invalid dev-switch hash — ignore, show normal login
    }
  }, [_hasHydrated, router, searchParams, returnTo]);

  // Redirect already-authenticated users (e.g. navigated to /login while logged in)
  useEffect(() => {
    if (!_hasHydrated) return;
    if (devSwitchHandledRef.current) return; // Dev switcher is handling redirect

    if (isAuthenticated && user) {
      const { accessToken } = useAuthStore.getState();
      const validToken = getValidToken(accessToken);

      if (!validToken) {
        useAuthStore.getState().clearAuth();
        return;
      }

      const redirect = searchParams.get('redirect');
      const { url, isExternal } = resolvePostLoginRedirect({
        redirect,
        returnTo,
        role: user.role,
      });

      if (isExternal) {
        const hash = `#token=${encodeURIComponent(validToken)}&user=${encodeURIComponent(JSON.stringify(user))}`;
        const separator = url.includes('?') ? '&' : '?';
        window.location.href = url + separator + 'sso=1' + hash;
      } else {
        // Redirect to tenant subdomain with auth relay (localStorage is origin-scoped)
        if (user.subdomain) {
          const relayUrl = buildTenantRedirectUrl(user.subdomain, url, validToken, user);
          if (relayUrl) {
            window.location.href = relayUrl;
            return;
          }
        }
        router.push(url);
      }
    }
  }, [_hasHydrated, isAuthenticated, user, router, searchParams, returnTo]);

  // Show loading while hydrating
  if (!_hasHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-foreground" />
      </div>
    );
  }

  // Don't render login form if user is authenticated (they're being redirected)
  if (isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <LoginForm returnTo={returnTo} tenantBranding={tenantBranding} />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-foreground" />
        </div>
      }
    >
      <LoginPageInner />
    </Suspense>
  );
}
