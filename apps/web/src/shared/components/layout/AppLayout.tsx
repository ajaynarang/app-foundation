'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { AppSidebar } from './AppSidebar';
import { AppHeader } from './AppHeader';
import { OnboardingBanner } from '@/features/platform/onboarding';
import { TrialBanner, PlanBlockedScreen } from '@/features/platform/plans';
import { usePlan } from '@/features/platform/plans';
import { useAuthStore } from '@/features/auth';
import { useOnboardingStore } from '@/features/platform/onboarding';
import { useQuery } from '@tanstack/react-query';
import { listAlerts } from '@/features/operations/alerts';
import { useAlertStream } from '@/features/operations/alerts/hooks/use-alert-stream';
import { useNotificationStream } from '@/features/operations/notifications/hooks/use-notification-stream';
import { useLoadMessageStream } from '@/features/fleet/loads/hooks/use-load-message-stream';
import { useShieldAsyncStream } from '@/features/operations/shield/hooks/use-shield-async-stream';
import { PlatformTour } from '@/features/platform/tour';
import { PageTransition } from '@/shared/lib/motion';
import { CommandPalette } from '@/shared/components/command-palette/CommandPalette';
import { useRecents } from '@/shared/components/command-palette/use-recents';
import { useAppHotkeys } from '@/shared/hooks/use-app-hotkeys';
import { HotkeyIntroToast } from './HotkeyIntroToast';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const pathname = usePathname();
  const { isAuthenticated, user } = useAuthStore();
  const { milestone1Complete, dismissBanner, isBannerDismissed, fetchStatus } = useOnboardingStore();
  const { isBlocked } = usePlan();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Track page visits for command palette recents (localStorage, no DB)
  useRecents(user?.role);

  // Global hotkeys: ⌘K opens palette, g-h navigates Home
  useAppHotkeys();

  // Fetch alert count
  const { data: alerts = [] } = useQuery({
    queryKey: ['alerts', 'active'],
    queryFn: () => listAlerts({ status: 'active' }),
    enabled: isAuthenticated,
  });

  const alertCount = alerts.length;
  const _criticalCount = alerts.filter((a) => a.priority === 'CRITICAL' && a.status === 'ACTIVE').length;

  // Real-time side effects (the SSE connection itself is owned by SseProvider)
  useAlertStream();
  useNotificationStream();
  useLoadMessageStream();
  useShieldAsyncStream();

  // Initialize onboarding store for OWNER/ADMIN
  useEffect(() => {
    if (isAuthenticated && (user?.role === 'OWNER' || user?.role === 'ADMIN')) {
      fetchStatus();
    }
  }, [isAuthenticated, user?.role, fetchStatus]);

  // Check banner dismissal on mount
  useEffect(() => {
    setBannerDismissed(isBannerDismissed());
  }, [isBannerDismissed]);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  const handleDismissBanner = () => {
    dismissBanner();
    setBannerDismissed(true);
  };

  // Only show onboarding banner on top-level dispatcher dashboard, not on work pages
  const onboardingBannerPages = ['/dispatcher', '/dispatcher/home', '/admin'];
  const showOnboardingBanner =
    !bannerDismissed &&
    !milestone1Complete &&
    (user?.role === 'OWNER' || user?.role === 'ADMIN') &&
    pathname !== '/setup-hub' &&
    onboardingBannerPages.some((p) => pathname === p || pathname === p + '/');

  // Allow account/subscription pages even when trial expired so users can upgrade
  const isAccountPage = pathname?.startsWith('/dispatcher/account');

  if (!isAuthenticated) {
    return null;
  }

  return (
    <PlatformTour>
      <CommandPalette />
      <HotkeyIntroToast />
      {/* Pattern B: Full-height sidebar | (header + content) */}
      <div className="flex h-dvh overflow-hidden">
        {/* Sidebar — full height, not under header */}
        <AppSidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          alertCount={alertCount}
        />

        {/* Content area: header + banners + scrollable main */}
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          <AppHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

          {/* Trial Banner (warning when ≤7 days) */}
          <TrialBanner />

          {/* Blocked screen — trial expired or suspended (account pages exempted so user can upgrade) */}
          {isBlocked && !isAccountPage ? (
            <PlanBlockedScreen />
          ) : (
            <>
              {/* Onboarding Banner */}
              {showOnboardingBanner && <OnboardingBanner onDismiss={handleDismissBanner} />}

              {/* Main content */}
              <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950">
                <PageTransition pageKey={pathname?.split('/').slice(0, 3).join('/') ?? '/'} className="p-4 md:p-8">
                  {children}
                </PageTransition>
              </main>
            </>
          )}
        </div>
      </div>
    </PlatformTour>
  );
}

export default AppLayout;
