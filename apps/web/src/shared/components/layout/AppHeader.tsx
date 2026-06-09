'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { Menu } from 'lucide-react';
import { Button } from '@app/ui/components/ui/button';
import { DevSwitcherTrigger } from '@/shared/components/common';
import { JobHealthIndicator } from '@/shared/components/job-health-indicator';
import { NotificationBell } from './NotificationBell';
import { NotificationSheet } from './NotificationSheet';
import { DynamicIsland } from './DynamicIsland';
import { useAuthStore } from '@/features/auth';
import { usePlan } from '@/features/platform/plans/hooks/use-plan';
import { useLongPress } from '@/shared/hooks/use-long-press';

interface AppHeaderProps {
  onToggleSidebar: () => void;
}

export function AppHeader({ onToggleSidebar }: AppHeaderProps) {
  const [notifOpen, setNotifOpen] = useState(false);
  const { user } = useAuthStore();
  const { plan, displayName, isOnTrial, daysLeftInTrial } = usePlan();

  const getRoleView = () => {
    if (user?.role === 'ADMIN' || user?.role === 'OWNER') return 'Admin View';
    if (user?.role === 'MEMBER') return 'Member View';
    return 'Home';
  };

  const getPlanLabel = () => {
    if (!plan || user?.role === 'SUPER_ADMIN') return null;
    if (isOnTrial) {
      return daysLeftInTrial !== null ? `Trial · ${daysLeftInTrial}d left` : 'Trial';
    }
    return displayName ?? plan;
  };

  const tenantName = user?.tenantName || 'Unknown Tenant';
  const planLabel = getPlanLabel();
  const roleView = getRoleView();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  // Long-press on mobile logo toggles dev switcher visibility (only in dev mode)
  const isDevSwitcherEnabled = process.env.NEXT_PUBLIC_DEV_SWITCHER === 'true';
  const toggleDevSwitcher = useCallback(() => {
    if (isDevSwitcherEnabled) {
      window.dispatchEvent(new CustomEvent('dev-switcher:toggle'));
    }
  }, [isDevSwitcherEnabled]);
  const longPressHandlers = useLongPress(toggleDevSwitcher);

  const islandProps = {
    tenantName,
    planLabel,
    roleView,
    isOnTrial,
    daysLeftInTrial,
    isSuperAdmin: !!isSuperAdmin,
  };

  return (
    <header className="h-14 border-b border-border bg-background z-30 flex-shrink-0 overflow-visible">
      <div className="h-full flex items-center justify-between px-4 md:px-6">
        {/* Left section */}
        <div className="flex items-center gap-3">
          {/* Mobile hamburger */}
          <Button
            onClick={onToggleSidebar}
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Toggle sidebar"
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Logo — mobile only (desktop logo is in sidebar) */}
          <Link
            href="/"
            className="flex items-center gap-2 hover:opacity-80 transition-opacity md:hidden"
            title="Go to Home"
            data-app-logo
            {...longPressHandlers}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-dark.svg" alt="Platform" className="h-6 w-6 dark:block hidden" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-light.svg" alt="Platform" className="h-6 w-6 dark:hidden block" />
            <span className="text-xl font-bold tracking-tight font-space-grotesk">Platform</span>
          </Link>
        </div>

        {/* Center section — Dynamic Island, desktop only */}
        <div className="hidden md:flex flex-1 justify-center">
          <DynamicIsland {...islandProps} />
        </div>

        {/* Right section */}
        <div className="flex items-center gap-1">
          <JobHealthIndicator />
          <NotificationBell onClick={() => setNotifOpen(true)} />
          <NotificationSheet open={notifOpen} onOpenChange={setNotifOpen} />
          <DevSwitcherTrigger />
        </div>
      </div>
    </header>
  );
}

export default AppHeader;
