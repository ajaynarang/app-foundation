'use client';

import { useState, useMemo } from 'react';
import { useDevSwitcher } from './use-dev-switcher';
import { Badge } from '@app/ui/components/ui/badge';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@app/ui/components/ui/dialog';
import { Skeleton } from '@app/ui/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@app/ui/components/ui/tooltip';
import { Button } from '@app/ui/components/ui/button';
import { Input } from '@app/ui/components/ui/input';
import { ScrollArea } from '@app/ui/components/ui/scroll-area';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { ExternalLink, Loader2, RefreshCw, Search, Building2, Shield } from 'lucide-react';
import { cn } from '@app/ui';

const ROLE_BADGE_VARIANT: Record<string, 'default' | 'muted' | 'outline'> = {
  OWNER: 'default',
  ADMIN: 'default',
  MEMBER: 'muted',
  SUPER_ADMIN: 'default',
};

const ROLE_ABBREV: Record<string, string> = {
  OWNER: 'OWNR',
  ADMIN: 'ADMN',
  MEMBER: 'MEMB',
  SUPER_ADMIN: 'S.AD',
};

const ROLE_COLOR: Record<string, string> = {
  OWNER: 'bg-amber-600',
  ADMIN: 'bg-blue-600',
  MEMBER: 'bg-emerald-600',
  SUPER_ADMIN: 'bg-red-600',
};

function getInitials(firstName?: string | null, lastName?: string | null): string {
  return `${firstName?.charAt(0) ?? ''}${lastName?.charAt(0) ?? ''}`.toUpperCase() || '??';
}

/**
 * Inline trigger for the header — renders a small role badge that opens the palette.
 * Hidden in "ghost mode" until Ctrl+Shift+D is pressed.
 */
export function DevSwitcherTrigger() {
  if (process.env.NEXT_PUBLIC_DEV_SWITCHER !== 'true') return null;
  return <DevSwitcherTriggerInner />;
}

function DevSwitcherTriggerInner() {
  const { open, currentUser, visible } = useDevSwitcher();

  if (!visible) return null;

  const roleAbbrev = currentUser ? (ROLE_ABBREV[currentUser.role] ?? currentUser.role.slice(0, 4)) : 'DEV';

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={open}
            className="min-h-[44px] min-w-[44px]"
            aria-label="Open Dev Switcher"
          >
            <Badge
              variant="outline"
              className="text-2xs px-1.5 py-0.5 font-mono text-muted-foreground hover:text-foreground transition-colors"
            >
              {roleAbbrev}
            </Badge>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Dev Switcher · Ctrl+Shift+&gt;</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Two-panel dev switcher dialog — rendered at root layout level.
 * Left: tenant sidebar. Right: filtered user list with search.
 */
export function DevSwitcher() {
  if (process.env.NEXT_PUBLIC_DEV_SWITCHER !== 'true') return null;
  return <DevSwitcherPalette />;
}

type TenantTab = string | '__platform__';

function DevSwitcherPalette() {
  const {
    isOpen,
    setIsOpen,
    data,
    isLoading,
    isMaintenanceMode,
    isSwitching,
    switchToUser,
    openAsNewTab,
    currentUser,
    refetch,
  } = useDevSwitcher();

  // Default to first tenant (not "all")
  const defaultTenant = data?.tenants[0]?.tenantId ?? '__platform__';
  const [selectedTenant, setSelectedTenant] = useState<TenantTab | null>(null);
  const activeTenant = selectedTenant ?? defaultTenant;
  const [search, setSearch] = useState('');

  // Reset search when tenant changes
  const handleTenantChange = (tab: TenantTab) => {
    setSelectedTenant(tab);
    setSearch('');
  };

  // Filtered users based on selected tenant + search
  const filteredUsers = useMemo(() => {
    if (!data) return [];

    let users: typeof data.superAdmins = [];

    if (activeTenant === '__platform__') {
      users = data.superAdmins;
    } else {
      const tenant = data.tenants.find((t) => t.tenantId === activeTenant);
      if (tenant) {
        users = tenant.users;
      }
    }

    if (!search.trim()) return users;

    const q = search.toLowerCase();
    return users.filter((u) => {
      const displayName = `${u.firstName} ${u.lastName}`.toLowerCase();
      const identifier = (u.email || u.phone || '').toLowerCase();
      const role = u.role.toLowerCase();
      return displayName.includes(q) || identifier.includes(q) || role.includes(q);
    });
  }, [data, activeTenant, search]);

  // Find which tenant the current user belongs to
  const currentUserTenantId = useMemo(() => {
    if (!data || !currentUser) return null;
    for (const tenant of data.tenants) {
      if (tenant.users.some((u) => u.userId === currentUser.userId)) {
        return tenant.tenantId;
      }
    }
    if (data.superAdmins.some((u) => u.userId === currentUser.userId)) {
      return '__platform__';
    }
    return null;
  }, [data, currentUser]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="overflow-hidden p-0 gap-0 max-w-[640px] w-[calc(100vw-2rem)]">
        <VisuallyHidden>
          <DialogTitle>Dev User Switcher</DialogTitle>
          <DialogDescription>Switch between user accounts for development</DialogDescription>
        </VisuallyHidden>

        {isLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-5 w-32" />
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </div>
        ) : isMaintenanceMode ? (
          <div className="p-6 text-center">
            <div className="mx-auto mb-3 flex items-center justify-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-sky-500" />
              </span>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                Maintenance Mode
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Backend is currently down for maintenance. User switching is unavailable.
            </p>
            <Button variant="outline" size="sm" onClick={refetch} className="mt-4">
              <RefreshCw className="h-3 w-3 mr-1.5" />
              Retry
            </Button>
          </div>
        ) : !data ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Failed to load users.{' '}
            <button onClick={refetch} className="underline hover:text-foreground">
              Retry
            </button>
          </div>
        ) : (
          <div className="flex h-[min(480px,70vh)]">
            {/* Left panel — tenant sidebar (hidden on mobile) */}
            <div className="w-48 shrink-0 border-r border-border bg-muted/30 hidden md:flex flex-col">
              <div className="px-3 py-3 border-b border-border">
                <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Tenants</span>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-1.5 space-y-0.5">
                  {/* Tenants */}
                  {data.tenants.map((tenant) => (
                    <TenantTab
                      key={tenant.tenantId}
                      label={tenant.tenantName}
                      icon={<Building2 className="h-3.5 w-3.5" />}
                      count={tenant.users.length}
                      isActive={activeTenant === tenant.tenantId}
                      isCurrent={currentUserTenantId === tenant.tenantId}
                      onClick={() => handleTenantChange(tenant.tenantId)}
                    />
                  ))}

                  {/* Platform / Super Admin */}
                  {data.superAdmins.length > 0 && (
                    <TenantTab
                      label="Platform"
                      icon={<Shield className="h-3.5 w-3.5" />}
                      count={data.superAdmins.length}
                      isActive={activeTenant === '__platform__'}
                      isCurrent={currentUserTenantId === '__platform__'}
                      onClick={() => handleTenantChange('__platform__')}
                    />
                  )}
                </div>
              </ScrollArea>

              {/* Refresh at bottom of sidebar */}
              <div className="border-t border-border p-1.5">
                <button
                  onClick={refetch}
                  className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"
                >
                  <RefreshCw className="h-3 w-3" />
                  Refresh
                </button>
              </div>
            </div>

            {/* Right panel — user list */}
            <div className="flex-1 flex flex-col min-w-0">
              {/* Mobile tenant selector */}
              <div className="flex md:hidden items-center gap-1.5 px-3 py-2 border-b border-border overflow-x-auto">
                {data.tenants.map((tenant) => (
                  <button
                    key={tenant.tenantId}
                    onClick={() => handleTenantChange(tenant.tenantId)}
                    className={cn(
                      'inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md whitespace-nowrap transition-colors shrink-0',
                      activeTenant === tenant.tenantId
                        ? 'bg-foreground text-background font-medium'
                        : 'bg-muted text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Building2 className="h-3 w-3" />
                    {tenant.tenantName}
                  </button>
                ))}
                {data.superAdmins.length > 0 && (
                  <button
                    onClick={() => handleTenantChange('__platform__')}
                    className={cn(
                      'inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md whitespace-nowrap transition-colors shrink-0',
                      activeTenant === '__platform__'
                        ? 'bg-foreground text-background font-medium'
                        : 'bg-muted text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Shield className="h-3 w-3" />
                    Platform
                  </button>
                )}
              </div>

              {/* Search bar */}
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
                <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, email, or role..."
                  className="h-8 border-0 bg-transparent shadow-none focus-visible:ring-0 px-0 text-sm"
                  autoFocus
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="text-xs text-muted-foreground hover:text-foreground shrink-0"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* User list */}
              <ScrollArea className="flex-1">
                {filteredUsers.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">No users found</div>
                ) : (
                  <div className="p-1.5">
                    {filteredUsers.map((user) => (
                      <DevUserItem
                        key={user.userId}
                        user={user}
                        isCurrentUser={currentUser?.userId === user.userId}
                        isSwitching={isSwitching === user.userId}
                        onSwitch={() => switchToUser(user.userId)}
                        onNewTab={(e) => {
                          e.stopPropagation();
                          openAsNewTab(user.userId);
                        }}
                      />
                    ))}
                  </div>
                )}
              </ScrollArea>

              {/* Footer with count */}
              <div className="border-t border-border px-3 py-2 flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">
                  {filteredUsers.length} user
                  {filteredUsers.length !== 1 ? 's' : ''}
                </span>
                <kbd className="text-2xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">⌘⇧D</kbd>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TenantTab({
  label,
  icon,
  count,
  isActive,
  isCurrent,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  count: number;
  isActive: boolean;
  isCurrent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 w-full px-2.5 py-2 text-xs rounded-md transition-colors text-left',
        isActive
          ? 'bg-background text-foreground shadow-sm border border-border'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted',
      )}
    >
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span className="flex-1 truncate font-medium">{label}</span>
      {isCurrent && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />}
      <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 shrink-0 font-mono">
        {count}
      </Badge>
    </button>
  );
}

function DevUserItem({
  user,
  isCurrentUser,
  isSwitching,
  onSwitch,
  onNewTab,
}: {
  user: {
    userId: string;
    email: string | null;
    firstName: string;
    lastName: string;
    role: string;
    phone?: string | null;
  };
  isCurrentUser: boolean;
  isSwitching: boolean;
  onSwitch: () => void;
  onNewTab: (e: React.MouseEvent) => void;
}) {
  const displayName = `${user.firstName} ${user.lastName}`.trim() || 'Unnamed';
  const identifier = user.email || user.phone || user.userId;
  const roleAbbrev = ROLE_ABBREV[user.role] ?? user.role.slice(0, 4);
  const initials = getInitials(user.firstName, user.lastName);
  const avatarColor = ROLE_COLOR[user.role] ?? 'bg-gray-600';

  return (
    <div
      role="button"
      tabIndex={isCurrentUser ? undefined : 0}
      onClick={isCurrentUser ? undefined : onSwitch}
      onKeyDown={
        isCurrentUser
          ? undefined
          : (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSwitch();
              }
            }
      }
      className={cn(
        'flex items-center gap-3 w-full px-2.5 py-2 rounded-md text-left transition-colors group',
        isCurrentUser ? 'opacity-60 cursor-default' : 'hover:bg-muted cursor-pointer',
      )}
    >
      {/* Avatar initials */}
      <div
        className={cn(
          'h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-white text-[11px] font-semibold',
          avatarColor,
        )}
      >
        {initials}
      </div>

      {/* Name + identifier + tenant */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium truncate">{displayName}</span>
          {isCurrentUser && (
            <span className="text-2xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">you</span>
          )}
        </div>
        <div className="text-xs text-muted-foreground truncate">{identifier}</div>
      </div>

      {/* Role badge */}
      <Badge variant={ROLE_BADGE_VARIANT[user.role] ?? 'outline'} className="text-[9px] px-1.5 py-0 shrink-0 font-mono">
        {roleAbbrev}
      </Badge>

      {/* Switching spinner */}
      {isSwitching && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />}

      {/* New tab button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onNewTab}
        className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Open in new tab"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
