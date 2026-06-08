'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Map, Radio, User, type LucideIcon } from 'lucide-react';
import { cn } from '@sally/ui';
import { useSallyStore } from '@/features/platform/sally-ai/store';

interface Tab {
  label: string;
  href: string;
  icon: LucideIcon;
  isComms?: boolean;
}

const tabs: Tab[] = [
  { label: 'Trip', href: '/driver/trip', icon: Map },
  { label: 'Comms', href: '/driver/comms', icon: Radio, isComms: true },
  { label: 'Me', href: '/driver/me', icon: User },
];

interface DriverBottomTabsProps {
  inboxBadge?: number;
}

export function DriverBottomTabs({ inboxBadge = 0 }: DriverBottomTabsProps) {
  const pathname = usePathname();
  const { expandStrip, isExpanded, driverUnreadCount } = useSallyStore();
  const badge = inboxBadge || driverUnreadCount;

  return (
    <nav className="absolute bottom-0 inset-x-0 z-30 bg-background border-t border-border safe-area-bottom">
      <div className="flex items-stretch justify-around h-16">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href || pathname?.startsWith(tab.href + '/');
          const Icon = tab.icon;

          // Comms tab triggers the overlay instead of navigating
          if (tab.isComms) {
            return (
              <button
                key="comms"
                onClick={() => expandStrip('tab')}
                className={cn(
                  'flex flex-col items-center justify-center flex-1 min-w-[64px] min-h-[48px] gap-0.5 transition-colors',
                  isExpanded ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <div className="relative">
                  <Radio className="h-5 w-5" fill={isExpanded ? 'currentColor' : 'none'} />
                  {badge > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-critical text-white text-2xs font-medium px-1">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </div>
                <span className="text-2xs font-medium leading-tight">{tab.label}</span>
              </button>
            );
          }

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'flex flex-col items-center justify-center flex-1 min-w-[64px] min-h-[48px] gap-0.5 transition-colors',
                isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <div className="relative">
                <Icon className="h-5 w-5" fill={isActive ? 'currentColor' : 'none'} />
              </div>
              <span className="text-2xs font-medium leading-tight">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
