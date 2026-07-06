'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ExternalLink,
  ArrowLeft,
  Headset,
  LogOut,
  User,
  Scale,
  Cookie,
  SunMoon,
  Sparkles,
  AArrowDown,
  Search,
  X,
} from 'lucide-react';
import { cn } from '@app/ui';
import { duration, easing } from '@appshore/web-core/shared/lib/motion';
import { useAuthStore } from '@/features/auth';
import { Badge } from '@app/ui/components/ui/badge';
import { ScrollArea } from '@app/ui/components/ui/scroll-area';
import { Separator } from '@app/ui/components/ui/separator';
import { Avatar, AvatarFallback } from '@app/ui/components/ui/avatar';
import { Button } from '@app/ui/components/ui/button';
import { Input } from '@app/ui/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@app/ui/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@app/ui/components/ui/tooltip';
import {
  getNavigationForRole,
  getActiveSubPanel,
  getSubPanelSections,
  getDefaultRouteForRole,
  type NavItem,
  type SubPanelId,
  type UserRole,
} from '@appshore/web-core/shared/lib/navigation';
import { openDocs } from '@appshore/web-core/shared/lib/console-url';
import { openCookiePreferences } from '@/shared/components/cookie-consent';
import { ThemeToggle } from './ThemeToggle';
import { FontSizeControl } from './FontSizeControl';
import { TourTriggerButton } from '@/features/platform/tour';
import { usePlan } from '@/features/platform/plans/hooks/use-plan';
import { WorkspaceSwitcherPopover } from './WorkspaceSwitcherPopover';
import { CommandPaletteTrigger } from '@/shared/components/command-palette/CommandPalette';

interface AppSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function AppSidebar({ isOpen, onClose, isCollapsed, onToggleCollapse }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuthStore();
  const { hasFeature } = usePlan();
  const [popoverOpen, setPopoverOpen] = useState(false);

  // Get navigation items from centralized config
  const navItems = getNavigationForRole(user?.role);

  // URL-driven sub-panel state
  const activeSubPanel = getActiveSubPanel(pathname || '');

  // Track whether a panel switch has occurred — skip animation on initial mount
  const hasSwitchedPanel = useRef(false);
  if (!hasSwitchedPanel.current && activeSubPanel !== undefined) {
    hasSwitchedPanel.current = true;
  }

  const getInitials = (firstName?: string | null, lastName?: string | null) => {
    // Never crash on partial user shapes (stale sessions, partial profiles)
    return `${firstName?.charAt(0) ?? ''}${lastName?.charAt(0) ?? ''}`.toUpperCase() || 'U';
  };

  const getRoleLabel = (role: string | undefined) => {
    if (role === 'MEMBER') return 'Member';
    if (role === 'ADMIN') return 'Admin';
    if (role === 'OWNER') return 'Owner';
    if (role === 'SUPER_ADMIN') return 'Super Admin';
    return 'User';
  };

  const handleLogout = async () => {
    await signOut();
    router.push('/');
  };

  // Per-item badges are derived from feature state; the generic starter ships
  // none. Kept as a hook so features can opt back in without re-plumbing.
  const getNavItemBadge = (_navItem: NavItem): React.ReactNode => null;

  // Navigate back to main sidebar from sub-panel
  const handleBackToMain = () => {
    // Navigate to the default route for the role to exit sub-panel
    router.push(getDefaultRouteForRole(user?.role));
  };

  // Get the sub-panel title
  const getSubPanelTitle = (_panelId: SubPanelId): string => {
    return 'Settings';
  };

  return (
    <TooltipProvider delayDuration={0}>
      {/* Mobile backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: duration.fast, ease: easing.out }}
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* Sidebar — full height, Pattern B */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 transition-all duration-300 ease-in-out',
          'border-r border-border flex flex-col bg-background',
          // Mobile: overlay slide-in
          isOpen ? 'translate-x-0' : '-translate-x-full',
          // Desktop: static in flex layout (not fixed)
          'md:static md:translate-x-0',
          isCollapsed ? 'md:w-16' : 'md:w-64',
          'w-64',
        )}
      >
        {/* Zone 0: Logo — always visible */}
        <div
          className={cn(
            'flex items-center h-14 px-4 border-b border-border',
            isCollapsed ? 'justify-center' : 'justify-between',
          )}
        >
          {!isCollapsed && (
            <Link
              href="/"
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              title="Go to Home"
              data-app-logo
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-background text-sm font-bold">
                A
              </span>
              <span className="text-xl font-bold tracking-tight">App</span>
            </Link>
          )}
          {isCollapsed && (
            <button
              onClick={onToggleCollapse}
              className="hidden md:flex items-center justify-center"
              title="Expand sidebar"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-foreground text-background text-xs font-bold">
                A
              </span>
            </button>
          )}
          {!isCollapsed && (
            <button
              onClick={onToggleCollapse}
              className="hidden md:flex p-1.5 rounded-md hover:bg-muted transition-colors"
              title="Collapse sidebar"
            >
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Zone 1: Search / command palette trigger — hidden in sub-panel */}
        {!activeSubPanel && (
          <div className="border-b border-border px-3 py-3">
            <CommandPaletteTrigger collapsed={isCollapsed} />
          </div>
        )}

        {/* Sub-panel header: ← Back + Section title — shown below logo */}
        {activeSubPanel && !isCollapsed && (
          <div id={`tour-nav-${activeSubPanel}`} className="border-b border-border px-4 py-2">
            <button
              onClick={handleBackToMain}
              className="flex items-center gap-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full py-1"
              title="Back to main menu"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="font-semibold text-foreground">{getSubPanelTitle(activeSubPanel)}</span>
            </button>
          </div>
        )}

        {/* Zone 2: Navigation — Main nav OR Sub-panel */}
        <ScrollArea className="flex-1 px-3 py-4">
          <AnimatePresence mode="wait">
            {activeSubPanel && !isCollapsed ? (
              /* Sub-panel navigation */
              <motion.div
                key={activeSubPanel}
                initial={hasSwitchedPanel.current ? { opacity: 0, x: 8 } : false}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: duration.fast, ease: easing.out }}
              >
                <SubPanelNav
                  panelId={activeSubPanel}
                  role={user?.role}
                  pathname={pathname}
                  hasFeature={hasFeature}
                  onClose={onClose}
                />
              </motion.div>
            ) : (
              /* Main navigation */
              <motion.div
                key="main-nav"
                initial={hasSwitchedPanel.current ? { opacity: 0, x: -8 } : false}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={{ duration: duration.fast, ease: easing.out }}
              >
                <nav className="space-y-1">
                  {navItems.map((item, index) => {
                    if ('type' in item && item.type === 'separator') {
                      return (
                        <div key={`separator-${index}`} className="my-2">
                          <Separator />
                          {!isCollapsed && item.label && (
                            <p className="text-xs text-muted-foreground px-3 py-2">{item.label}</p>
                          )}
                        </div>
                      );
                    }

                    const navItem = item as NavItem;
                    const hasSubPanel = !!navItem.subPanel;
                    const isSubPanelActive = hasSubPanel && activeSubPanel === navItem.subPanel;
                    const settingsPrefix = '/settings';
                    const isActive = hasSubPanel
                      ? isSubPanelActive
                      : navItem.exact
                        ? pathname === navItem.href
                        : navItem.href.startsWith(settingsPrefix)
                          ? pathname?.startsWith(settingsPrefix)
                          : pathname === navItem.href || pathname?.startsWith(navItem.href + '/');
                    const Icon = navItem.icon;
                    const navBadge = getNavItemBadge(navItem);
                    const isGated = (() => {
                      if (navItem.entitlements?.length) {
                        return !navItem.entitlements.some((e) => hasFeature(e));
                      }
                      if (navItem.entitlement) {
                        return !hasFeature(navItem.entitlement);
                      }
                      return false;
                    })();
                    // Hide gated items
                    if (isGated) return null;

                    const tourId = `tour-nav-${navItem.label
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, '-')
                      .replace(/^-|-$/g, '')}`;

                    // Sub-panel items navigate to their href (which triggers sub-panel via URL)
                    const linkContent = (
                      <Link
                        key={navItem.href}
                        href={navItem.href}
                        id={tourId}
                        onClick={onClose}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2 rounded-md transition-colors',
                          'text-sm font-medium',
                          isActive
                            ? 'bg-black text-white dark:bg-white dark:text-black'
                            : 'text-foreground hover:bg-muted',
                          isCollapsed && 'justify-center',
                        )}
                        title={isCollapsed ? navItem.label : undefined}
                      >
                        <Icon className={cn('h-5 w-5 flex-shrink-0', isCollapsed && 'mx-auto')} />
                        {!isCollapsed && <span className="flex-1">{navItem.label}</span>}
                        {!isCollapsed && navItem.exact && navItem.href === '/' && (
                          <kbd
                            className="pointer-events-none ml-auto h-5 select-none items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-2xs font-medium text-muted-foreground hidden sm:flex flex-shrink-0"
                            title="Press G then H"
                          >
                            g h
                          </kbd>
                        )}
                        {!isCollapsed && navItem.highlight && !hasSubPanel && (
                          <Sparkles className="h-3.5 w-3.5 text-amber-500 ml-auto flex-shrink-0" />
                        )}
                        {!isCollapsed && hasSubPanel && (
                          <ChevronRight className="h-4 w-4 ml-auto flex-shrink-0 text-muted-foreground" />
                        )}
                        {!isCollapsed && navBadge && !isGated && !hasSubPanel && (
                          <div className="ml-auto">{navBadge}</div>
                        )}
                        {isCollapsed && navBadge && <div className="absolute top-1 right-1">{navBadge}</div>}
                      </Link>
                    );

                    if (isCollapsed) {
                      return (
                        <Tooltip key={navItem.href} delayDuration={0}>
                          <TooltipTrigger asChild>
                            <div className="relative">{linkContent}</div>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="text-xs">
                            {navItem.label}
                          </TooltipContent>
                        </Tooltip>
                      );
                    }

                    return linkContent;
                  })}
                </nav>
              </motion.div>
            )}
          </AnimatePresence>
        </ScrollArea>

        {/* Zone 3: Show Me Around — hidden for SUPER_ADMIN */}
        {user?.role !== 'SUPER_ADMIN' && !activeSubPanel && (
          <div className="border-t border-border px-3 py-2">
            <TourTriggerButton isCollapsed={isCollapsed} />
          </div>
        )}

        {/* Zone 3b: Workspace switcher — OWNER/ADMIN only */}
        {(user?.role === 'OWNER' || user?.role === 'ADMIN') && !activeSubPanel && (
          <div className="border-t border-border px-3 py-2">
            <WorkspaceSwitcherPopover
              isCollapsed={isCollapsed}
              onClose={onClose}
              onOpenFeedback={() => router.push('/settings/support')}
              onExpand={onToggleCollapse}
            />
          </div>
        )}

        {/* Zone 4: User Profile — collapsed expands sidebar; expanded opens popover */}
        <div className="border-t border-border px-3 pt-3 pb-6 safe-area-bottom">
          {isCollapsed ? (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => {
                    onToggleCollapse();
                    setPopoverOpen(true);
                  }}
                  aria-label={user ? `${user.firstName} ${user.lastName}` : 'User menu'}
                  className="flex items-center justify-center w-full rounded-md py-1 hover:bg-muted transition-colors"
                >
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
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger asChild>
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
                  <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="start"
                className="w-[var(--radix-popover-trigger-width)] p-0"
                sideOffset={4}
              >
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

                {/* Profile / Settings */}
                <div className="p-1">
                  <button
                    onClick={() => router.push('/settings/profile')}
                    className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors text-foreground"
                  >
                    <User className="h-4 w-4" />
                    <span>Profile</span>
                  </button>
                </div>

                {/* Display preferences */}
                <div className="p-1 space-y-0">
                  <div className="flex items-center justify-between px-3 py-2 rounded-md">
                    <div className="flex items-center gap-3">
                      <SunMoon className="h-4 w-4 text-foreground" />
                      <span className="text-sm text-foreground">Theme</span>
                    </div>
                    <ThemeToggle />
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 rounded-md">
                    <div className="flex items-center gap-3">
                      <AArrowDown className="h-4 w-4 text-foreground" />
                      <span className="text-sm text-foreground">Font Size</span>
                    </div>
                    <FontSizeControl />
                  </div>
                </div>

                <Separator />

                {/* Links — hide tenant-facing items for super admin */}
                <div className="p-1">
                  {user?.role !== 'SUPER_ADMIN' && (
                    <>
                      <Link
                        href="/settings/support"
                        onClick={() => setPopoverOpen(false)}
                        className="flex items-center gap-3 w-full px-3 py-1.5 rounded-md text-xs hover:bg-muted transition-colors text-muted-foreground"
                      >
                        <Headset className="h-3.5 w-3.5" />
                        <span>Support</span>
                      </Link>
                      <button
                        onClick={() => openDocs()}
                        className="flex items-center gap-3 w-full px-3 py-1.5 rounded-md text-xs hover:bg-muted transition-colors text-muted-foreground"
                      >
                        <BookOpen className="h-3.5 w-3.5" />
                        <span>Documentation</span>
                      </button>
                    </>
                  )}
                  <Link
                    href="/legal/privacy"
                    className="flex items-center gap-3 w-full px-3 py-1.5 rounded-md text-xs hover:bg-muted transition-colors text-muted-foreground"
                  >
                    <Scale className="h-3.5 w-3.5" />
                    <span>Privacy & Terms</span>
                  </Link>
                  <button
                    onClick={openCookiePreferences}
                    className="flex items-center gap-3 w-full px-3 py-1.5 rounded-md text-xs hover:bg-muted transition-colors text-muted-foreground"
                  >
                    <Cookie className="h-3.5 w-3.5" />
                    <span>Cookie Preferences</span>
                  </button>
                </div>

                <Separator />

                {/* Logout */}
                <div className="p-1">
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors text-critical"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Logout</span>
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}

/**
 * Sub-panel navigation component — renders when Account > or Settings > is active.
 * Shows sections with items, respecting role and entitlement gating.
 */
function SubPanelNav({
  panelId,
  role,
  pathname,
  hasFeature,
  onClose,
}: {
  panelId: SubPanelId;
  role: UserRole | undefined;
  pathname: string | null;
  hasFeature: (feature: string) => boolean;
  onClose: () => void;
}) {
  const sections = getSubPanelSections(panelId, role);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset query when switching panels
  useEffect(() => {
    setQuery('');
  }, [panelId]);

  const normalizedQuery = query.trim().toLowerCase();
  const isFiltering = normalizedQuery.length > 0;

  const filteredSections = useMemo(() => {
    return sections
      .map((section) => {
        const entitled = section.items.filter((item) => {
          if (item.entitlements?.length) {
            return item.entitlements.some((e) => hasFeature(e));
          }
          if (item.entitlement) {
            return hasFeature(item.entitlement);
          }
          return true;
        });
        if (!isFiltering) return { section, visibleItems: entitled };
        const sectionMatches = section.label?.toLowerCase().includes(normalizedQuery) ?? false;
        const matchingItems = entitled.filter(
          (item) => sectionMatches || item.label.toLowerCase().includes(normalizedQuery),
        );
        return { section, visibleItems: matchingItems };
      })
      .filter(({ visibleItems }) => visibleItems.length > 0);
  }, [sections, hasFeature, isFiltering, normalizedQuery]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && query) {
      e.preventDefault();
      setQuery('');
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search settings"
          aria-label="Filter settings"
          className="h-8 pl-8 pr-8 text-sm border-0 bg-muted/50 focus-visible:bg-muted focus-visible:ring-1"
        />
        {query && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {filteredSections.length === 0 ? (
        <p className="px-3 py-8 text-center text-xs text-muted-foreground">No settings match &ldquo;{query}&rdquo;</p>
      ) : (
        <nav className="space-y-4">
          {filteredSections.map(({ section, visibleItems }, sectionIdx) => (
            <div key={section.label || `section-${sectionIdx}`}>
              {sectionIdx > 0 && <Separator className="mb-4" />}
              {section.label && (
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-3">
                  {section.label}
                </p>
              )}
              <div className="space-y-1">
                {visibleItems.map((item) => {
                  const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
                  const Icon = item.icon;
                  // Stable anchor for the product tour (e.g. #tour-nav-members)
                  const tourId = `tour-nav-${item.label
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-|-$/g, '')}`;

                  if (item.external) {
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        id={tourId}
                        onClick={onClose}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2 rounded-md transition-colors',
                          'text-sm font-medium text-foreground hover:bg-muted',
                        )}
                      >
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        <span className="flex-1">{item.label}</span>
                        <ExternalLink className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      </Link>
                    );
                  }

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      id={tourId}
                      onClick={onClose}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 rounded-md transition-colors',
                        'text-sm font-medium',
                        isActive
                          ? 'bg-black text-white dark:bg-white dark:text-black'
                          : 'text-foreground hover:bg-muted',
                      )}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      <span className="flex-1">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      )}
    </div>
  );
}

export default AppSidebar;
