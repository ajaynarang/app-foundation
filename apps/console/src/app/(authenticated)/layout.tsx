'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '../../lib/auth-store';
import { usePlan } from '../../features/plans/use-plan';
import { ConsoleSidebar } from '../../components/console-sidebar';
import { ConsoleTopbar } from '../../components/console-topbar';
import { ConsolePlanBlockedScreen } from '../../components/feature-guard';

const isDocsOnly = process.env.NEXT_PUBLIC_DOCS_ONLY_MODE === 'true';

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, _hasHydrated, isInitialized } = useAuthStore();
  const { isBlocked } = usePlan();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Docs-only mode: redirect any authenticated route to /docs
  useEffect(() => {
    if (isDocsOnly) {
      router.replace('/docs');
    }
  }, [router]);

  useEffect(() => {
    if (isDocsOnly) return; // Skip auth redirect in docs-only mode
    if (_hasHydrated && isInitialized && !isAuthenticated) {
      // SSO: redirect to main app login, not a Console-specific login page
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const returnTo = `${window.location.origin}${pathname}`;
      window.location.href = `${appUrl}/login?returnTo=${encodeURIComponent(returnTo)}`;
    }
  }, [_hasHydrated, isInitialized, isAuthenticated, pathname]);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (!_hasHydrated || !isInitialized) {
    return null; // Will be skeleton later
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      <ConsoleSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <ConsoleTopbar onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
        {isBlocked ? (
          <ConsolePlanBlockedScreen />
        ) : (
          <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950">
            <div className="p-4 md:p-8">{children}</div>
          </main>
        )}
      </div>
    </div>
  );
}
