'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Menu, Home } from 'lucide-react';
import { cn } from '@app/ui';
import { useAuthStore } from '../lib/auth-store';
import { usePlan } from '../features/plans/use-plan';
import { Button } from '@app/ui/components/ui/button';
import { ThemeToggle } from './theme-toggle';

function getRoleView(role: string | undefined): string {
  switch (role) {
    case 'MEMBER':
      return 'Member View';
    case 'ADMIN':
    case 'OWNER':
      return 'Admin View';
    case 'SUPER_ADMIN':
      return 'Super Admin';
    default:
      return 'Console';
  }
}

interface ConsoleTopbarProps {
  onToggleSidebar: () => void;
}

export function ConsoleTopbar({ onToggleSidebar }: ConsoleTopbarProps) {
  const { user } = useAuthStore();
  const { plan, displayName, isOnTrial, daysLeftInTrial } = usePlan();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  return (
    <header
      className={cn(
        'h-14 border-b border-border bg-background flex-shrink-0',
        'flex items-center justify-between px-4 gap-3',
      )}
    >
      {/* Left: mobile hamburger + logo */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 md:hidden"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <Link href="/overview" className="flex items-center gap-2 hover:opacity-80 transition-opacity md:hidden">
          <Image src="/logo-dark.svg" alt="Console" width={24} height={24} className="h-6 w-6 dark:block hidden" />
          <Image src="/logo-light.svg" alt="Console" width={24} height={24} className="h-6 w-6 dark:hidden block" />
          <span className="text-lg font-bold tracking-tight">Console</span>
        </Link>
      </div>

      {/* Center: tenant · plan · role view (desktop) */}
      <div className="hidden md:flex flex-1 items-center justify-center">
        {user?.tenantName && (
          <span
            className={cn(
              'text-sm font-medium px-3 py-1 rounded-full',
              isOnTrial
                ? daysLeftInTrial !== null && daysLeftInTrial <= 3
                  ? 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300'
                  : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                : 'text-muted-foreground bg-muted',
            )}
          >
            {user.tenantName}
            {plan && user?.role !== 'SUPER_ADMIN' && (
              <>
                <span className="mx-1.5 opacity-40">·</span>
                {isOnTrial ? 'Trial' : (displayName ?? plan)}
                {isOnTrial && daysLeftInTrial !== null && (
                  <span className="opacity-75"> · {daysLeftInTrial}d left</span>
                )}
              </>
            )}
            <span className="mx-1.5 opacity-40">·</span>
            {getRoleView(user.role)}
          </span>
        )}
      </div>

      {/* Right: platform link + theme toggle */}
      <div className="flex items-center gap-2">
        <a
          href={appUrl}
          className="inline-flex items-center gap-1.5 h-8 px-3 text-sm font-medium rounded-md border border-border bg-background hover:bg-muted transition-colors"
        >
          <Home className="h-3.5 w-3.5" />
          <span>App</span>
        </a>
        {/* Theme toggle on mobile — desktop has it in sidebar user popover */}
        <div className="md:hidden">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

export default ConsoleTopbar;
