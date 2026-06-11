'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Headset,
  Home,
  LogOut,
  LayoutDashboard,
  Plug,
  Webhook,
  RefreshCw,
  Key,
  Shield,
  Bot,
  BookOpen,
  Users,
  CreditCard,
  Receipt,
  Building2,
  Activity,
  Scale,
  SunMoon,
  Sparkles,
  ListChecks,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@app/ui';
import { useAuthStore } from '../lib/auth-store';
import { ScrollArea } from '@app/ui/components/ui/scroll-area';
import { Separator } from '@app/ui/components/ui/separator';
import { Avatar, AvatarFallback } from '@app/ui/components/ui/avatar';
import { Badge } from '@app/ui/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@app/ui/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@app/ui/components/ui/tooltip';
import { ThemeToggle } from './theme-toggle';
import { usePlan } from '../features/plans/use-plan';

type NavLinkItem = {
  type: 'link';
  label: string;
  href: string;
  icon: LucideIcon;
  external?: boolean;
  /** Shows a subtle indicator that this link leaves the console layout */
  leavesConsole?: boolean;
  hint?: string;
  entitlement?: string; // Plan entitlement key — gated with ✦ sparkle
};

type NavSeparatorItem = {
  type: 'separator';
  label?: string;
};

type NavItemConfig = NavLinkItem | NavSeparatorItem;

const navigationItems: NavItemConfig[] = [
  { type: 'link', label: 'Overview', href: '/overview', icon: LayoutDashboard, hint: 'Platform summary at a glance' },
  { type: 'separator', label: 'Integrations' },
  {
    type: 'link',
    label: 'Connections',
    href: '/integrations/connections',
    icon: Plug,
    hint: 'Third-party service connections',
  },
  {
    type: 'link',
    label: 'Sync Status',
    href: '/integrations/sync',
    icon: RefreshCw,
    hint: 'Health, logs, re-sync triggers',
  },
  { type: 'separator', label: 'Developer' },
  {
    type: 'link',
    label: 'API Keys',
    href: '/developer/api-keys',
    icon: Key,
    hint: 'Create, revoke, and track usage',
    entitlement: 'api_keys',
  },
  {
    type: 'link',
    label: 'Webhooks',
    href: '/developer/webhooks',
    icon: Webhook,
    hint: 'Endpoints, delivery logs, retry',
    entitlement: 'webhooks',
  },
  {
    type: 'link',
    label: 'OAuth Clients',
    href: '/developer/oauth-clients',
    icon: Shield,
    hint: 'Register apps, redirect URIs',
    entitlement: 'oauth_clients',
  },
  {
    type: 'link',
    label: 'AI Assistants',
    href: '/developer/ai-assistants',
    icon: Bot,
    hint: 'MCP connectors for Claude, ChatGPT',
  },
  {
    type: 'link',
    label: 'Scopes',
    href: '/developer/scopes',
    icon: ListChecks,
    hint: 'What every scope grants, at a glance',
  },
  {
    type: 'link',
    label: 'API Docs',
    href: '/docs',
    icon: BookOpen,
    hint: 'Guides, reference, examples',
    leavesConsole: true,
  },
  { type: 'separator', label: 'Team & Access' },
  { type: 'link', label: 'Members', href: '/team/members', icon: Users, hint: 'Staff list, roles, and status' },
  { type: 'separator', label: 'Account' },
  {
    type: 'link',
    label: 'Plan & Usage',
    href: '/account/plan',
    icon: CreditCard,
    hint: 'Tier, usage, entitlements',
  },
  { type: 'link', label: 'Billing', href: '/account/billing', icon: Receipt, hint: 'Payment method, invoices' },
  {
    type: 'link',
    label: 'Organization',
    href: '/account/organization',
    icon: Building2,
    hint: 'Company name, address, legal',
  },
  { type: 'separator', label: 'Monitoring' },
  {
    type: 'link',
    label: 'System Activity',
    href: '/system-activity',
    icon: Activity,
    hint: 'Background jobs and sync status',
  },
  { type: 'separator', label: 'Support' },
  { type: 'link', label: 'Support Tickets', href: '/support', icon: Headset, hint: 'View and manage support requests' },
];

interface ConsoleSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

function getRoleLabel(role: string | undefined): string {
  switch (role) {
    case 'MEMBER':
      return 'Member';
    case 'ADMIN':
      return 'Admin';
    case 'OWNER':
      return 'Owner';
    case 'SUPER_ADMIN':
      return 'Super Admin';
    default:
      return 'User';
  }
}

export function ConsoleSidebar({ isOpen, onClose, isCollapsed, onToggleCollapse }: ConsoleSidebarProps) {
  const pathname = usePathname();
  const { user, signOut } = useAuthStore();
  const { hasFeature: hasEntitlement } = usePlan();

  const appBase = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  // Link to the main app — all roles land on the app root
  const appUrl = appBase;

  const handleLogout = async () => {
    await signOut();
    window.location.href = '/docs';
  };

  const isItemActive = (href: string): boolean => {
    return pathname === href || (pathname?.startsWith(href + '/') ?? false);
  };

  const renderNavLink = (item: NavLinkItem) => {
    const Icon = item.icon;
    const isActive = isItemActive(item.href);
    const isGated = !!item.entitlement && !hasEntitlement(item.entitlement);

    if (item.external) {
      const externalLink = (
        <a
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-md transition-colors',
            'text-sm font-medium',
            'text-foreground hover:bg-muted',
            isCollapsed && 'justify-center',
          )}
          title={isCollapsed ? item.label : undefined}
        >
          <Icon className={cn('h-5 w-5 flex-shrink-0', isCollapsed && 'mx-auto')} />
          {!isCollapsed && (
            <>
              <span className="flex-1">{item.label}</span>
              <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground ml-auto" />
            </>
          )}
        </a>
      );

      if (isCollapsed) {
        return (
          <Tooltip key={item.href} delayDuration={0}>
            <TooltipTrigger asChild>
              <div>{externalLink}</div>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {item.label}
            </TooltipContent>
          </Tooltip>
        );
      }

      return externalLink;
    }

    const linkContent = (
      <Link
        key={item.href}
        href={item.href}
        onClick={onClose}
        className={cn(
          'flex items-center gap-3 px-3 py-2 rounded-md transition-colors',
          'text-sm font-medium',
          isActive
            ? 'bg-black text-white dark:bg-white dark:text-black'
            : isGated
              ? 'text-muted-foreground/60 hover:bg-muted'
              : 'text-foreground hover:bg-muted',
          isCollapsed && 'justify-center',
        )}
        title={isCollapsed ? item.label : undefined}
      >
        <Icon className={cn('h-5 w-5 flex-shrink-0', isCollapsed && 'mx-auto')} />
        {!isCollapsed && (
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 truncate">
              <span className="truncate">
                {item.label}
                {item.leavesConsole && (
                  <ExternalLink
                    className={cn(
                      'inline h-3 w-3 ml-1.5 -mt-0.5',
                      isActive ? 'text-white/60 dark:text-black/50' : 'text-muted-foreground',
                    )}
                  />
                )}
              </span>
              {isGated && <Sparkles className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 ml-auto" />}
            </div>
            {/* Hints hidden — sidebar is too long with descriptions on every item */}
            {false && item.hint && (
              <div
                className={cn(
                  'truncate text-[11px]',
                  isActive ? 'text-white/80 dark:text-black/70' : 'text-muted-foreground',
                )}
              >
                {item.hint}
              </div>
            )}
          </div>
        )}
      </Link>
    );

    if (isCollapsed) {
      return (
        <Tooltip key={item.href} delayDuration={0}>
          <TooltipTrigger asChild>
            <div>{linkContent}</div>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            {item.label}
          </TooltipContent>
        </Tooltip>
      );
    }

    return linkContent;
  };

  return (
    <TooltipProvider delayDuration={0}>
      {/* Mobile backdrop */}
      {isOpen && <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={onClose} />}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 transition-all duration-300 ease-in-out',
          'border-r border-border bg-background flex flex-col',
          // Mobile: overlay slide-in
          isOpen ? 'translate-x-0' : '-translate-x-full',
          // Desktop: static in flex layout
          'md:static md:translate-x-0',
          isCollapsed ? 'md:w-16' : 'md:w-64',
          'w-64',
        )}
      >
        {/* Zone 0: Logo + Collapse toggle */}
        <div className="border-b border-border">
          <div className={cn('flex items-center h-14 px-4', isCollapsed ? 'justify-center' : 'justify-between')}>
            {isCollapsed ? (
              <button
                onClick={onToggleCollapse}
                className="hidden md:flex items-center justify-center"
                title="Expand sidebar"
              >
                <Image
                  src="/logo-dark.svg"
                  alt="Console"
                  width={24}
                  height={24}
                  className="h-6 w-6 dark:block hidden"
                />
                <Image
                  src="/logo-light.svg"
                  alt="Console"
                  width={24}
                  height={24}
                  className="h-6 w-6 dark:hidden block"
                />
              </button>
            ) : (
              <>
                <Link
                  href="/overview"
                  className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                  title="Console"
                >
                  <Image
                    src="/logo-dark.svg"
                    alt="Console"
                    width={28}
                    height={28}
                    className="h-7 w-7 dark:block hidden"
                  />
                  <Image
                    src="/logo-light.svg"
                    alt="Console"
                    width={28}
                    height={28}
                    className="h-7 w-7 dark:hidden block"
                  />
                  <span className="text-xl font-bold tracking-tight">Console</span>
                </Link>
                <button
                  onClick={onToggleCollapse}
                  className="hidden md:flex p-1.5 rounded-md hover:bg-muted transition-colors"
                  title="Collapse sidebar"
                >
                  <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Zone 2: Navigation */}
        <ScrollArea className="flex-1 px-3 py-4">
          <nav className="space-y-1">
            {navigationItems.map((item, index) => {
              if (item.type === 'separator') {
                return (
                  <div key={`separator-${index}`} className="my-2">
                    <Separator />
                    {!isCollapsed && item.label && (
                      <p className="text-xs text-muted-foreground uppercase tracking-wider px-3 py-2">{item.label}</p>
                    )}
                  </div>
                );
              }

              return <React.Fragment key={item.href}>{renderNavLink(item)}</React.Fragment>;
            })}
          </nav>
        </ScrollArea>

        {/* Zone 3: platform link */}
        <div className="border-t border-border px-3 py-2">
          {isCollapsed ? (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <a
                  href={appUrl}
                  className="flex items-center justify-center px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <Home className="h-5 w-5" />
                </a>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                App
              </TooltipContent>
            </Tooltip>
          ) : (
            <a
              href={appUrl}
              className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Home className="h-5 w-5 flex-shrink-0" />
              <span className="flex-1">App</span>
            </a>
          )}
        </div>

        {/* Zone 4: User Profile Popover */}
        <div className="border-t border-border px-3 py-3">
          <Popover>
            <PopoverTrigger asChild>
              {isCollapsed ? (
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <button className="flex items-center justify-center w-full rounded-md py-1 hover:bg-muted transition-colors">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-black text-white dark:bg-white dark:text-black text-xs">
                          {user ? getInitials(user.firstName, user.lastName) : 'U'}
                        </AvatarFallback>
                      </Avatar>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">
                    {user ? `${user.firstName} ${user.lastName}` : 'User'}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <button className="flex items-center gap-3 w-full rounded-md px-2 py-2 hover:bg-muted transition-colors text-left">
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarFallback className="bg-black text-white dark:bg-white dark:text-black text-xs">
                      {user ? getInitials(user.firstName, user.lastName) : 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {user ? `${user.firstName} ${user.lastName}` : 'User'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{getRoleLabel(user?.role)}</p>
                  </div>
                </button>
              )}
            </PopoverTrigger>
            <PopoverContent side="right" align="end" className="w-64 p-0" sideOffset={8}>
              {/* User info */}
              <div className="p-4">
                <p className="text-sm font-medium text-foreground">
                  {user ? `${user.firstName} ${user.lastName}` : 'User'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{user?.email}</p>
                {user?.tenantName && <p className="text-xs text-muted-foreground mt-0.5">{user.tenantName}</p>}
                <Badge variant="muted" className="mt-2 text-xs">
                  {getRoleLabel(user?.role)}
                </Badge>
              </div>

              <Separator />

              {/* Theme row */}
              <div className="p-1">
                <div className="flex items-center justify-between px-3 py-2 rounded-md">
                  <div className="flex items-center gap-3">
                    <SunMoon className="h-4 w-4 text-foreground" />
                    <span className="text-sm text-foreground">Theme</span>
                  </div>
                  <ThemeToggle />
                </div>
              </div>

              <Separator />

              {/* Legal links */}
              <div className="p-1">
                <a
                  href={`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/legal/privacy`}
                  className="flex items-center gap-3 w-full px-3 py-1.5 rounded-md text-xs hover:bg-muted transition-colors text-muted-foreground"
                >
                  <Scale className="h-3.5 w-3.5" />
                  <span>Privacy & Terms</span>
                </a>
              </div>

              <Separator />

              {/* Logout */}
              <div className="p-1">
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors text-red-600 dark:text-red-400"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Logout</span>
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Desktop expand button (when collapsed, show ChevronRight at bottom) */}
        {isCollapsed && (
          <div className="hidden md:block border-t border-border px-3 py-2">
            <button
              onClick={onToggleCollapse}
              className="flex items-center justify-center w-full p-1.5 rounded-md hover:bg-muted transition-colors"
              title="Expand sidebar"
            >
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        )}
      </aside>
    </TooltipProvider>
  );
}

export default ConsoleSidebar;
