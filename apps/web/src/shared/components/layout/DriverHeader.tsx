'use client';

import { DevSwitcherTrigger } from '@/shared/components/common';
import { useAuthStore } from '@/features/auth';

function getInitials(name?: string): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function DriverHeader() {
  const { user } = useAuthStore();

  return (
    <header className="h-12 flex items-center justify-between px-4 bg-background border-b border-border shrink-0">
      <span className="text-sm font-semibold tracking-tight text-foreground">SALLY</span>

      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-full bg-foreground text-background flex items-center justify-center text-xs font-medium">
          {getInitials(user ? `${user.firstName} ${user.lastName}` : undefined)}
        </div>

        <DevSwitcherTrigger />
      </div>
    </header>
  );
}
