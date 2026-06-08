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

  // Real-time cache invalidation is owned by SseProvider via SSE_INVALIDATION_MAP;
  // feature-specific stream side effects live in their own features.

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

  // Only show onboarding banner on the top-level landing page, not on work pages
  const onboardingBannerPages = ['/', '/admin'];
  const showOnboardingBanner =
    !bannerDismissed &&
    !milestone1Complete &&
    (user?.role === 'OWNER' || user?.role === 'ADMIN') &&
    onboardingBannerPages.some((p) => pathname === p || pathname === p + '/');

  // Allow account/subscription pages even when trial expired so users can upgrade
  const isAccountPage = pathname?.startsWith('/settings/subscription') || pathname?.startsWith('/settings/billing');

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
