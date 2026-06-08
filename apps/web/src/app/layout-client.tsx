'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ProgressProvider } from '@bprogress/next/app';
import { AppLayout } from '@/shared/components/layout/AppLayout';
import { PublicLayout } from '@/shared/components/layout/PublicLayout';
import { SallyGlobalProvider, useSallyStore } from '@/features/platform/sally-ai';
import { useAuthStore } from '@/features/auth';
import { isProtectedRoute } from '@/shared/lib/navigation';

function PassthroughLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function LayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isExpanded, chatLayout } = useSallyStore();
  const { isAuthenticated, _hasHydrated, user } = useAuthStore();

  const requiresAuth = pathname ? isProtectedRoute(pathname) : false;

  // Auth guard: redirect unauthenticated users from protected routes to login.
  // Login-page redirect logic lives in LoginPageInner — LayoutClient does NOT
  // compete with it, avoiding race conditions (especially with dev switcher).
  useEffect(() => {
    if (!_hasHydrated || !pathname) return;

    if (requiresAuth && !isAuthenticated) {
      router.push('/login');
    }
  }, [_hasHydrated, requiresAuth, isAuthenticated, pathname, router]);

  // Loading state
  if (!_hasHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-foreground" />
      </div>
    );
  }

  // Driver routes use their own DriverLayout via app/driver/layout.tsx
  const isDriverRoute = pathname?.startsWith('/driver') && user?.role === 'DRIVER';
  // OAuth consent uses a standalone layout (no nav chrome, like Google/GitHub consent)
  const isOAuthRoute = pathname?.startsWith('/oauth');

  // Render layout based on route type
  const Layout = isOAuthRoute
    ? PassthroughLayout
    : requiresAuth && !isDriverRoute
      ? AppLayout
      : isDriverRoute
        ? PassthroughLayout
        : PublicLayout;

  return (
    <ProgressProvider height="2px" color="hsl(var(--foreground))" options={{ showSpinner: false }} shallowRouting>
      <div className={`sally-main-content ${isExpanded ? `sally-layout-${chatLayout}` : ''}`}>
        <Layout>{children}</Layout>
      </div>
      <SallyGlobalProvider />
    </ProgressProvider>
  );
}
