'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronsUpDown, ExternalLink, MessageSquarePlus } from 'lucide-react';
import { cn } from '@app/ui';
import { Badge } from '@app/ui/components/ui/badge';
import { Separator } from '@app/ui/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@app/ui/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/ui/components/ui/tooltip';
import { useAuthStore } from '@/features/auth';
import { usePlan } from '@/features/platform/plans/hooks/use-plan';
import { useOnboardingStore } from '@/features/platform/onboarding';
import { workspaceDrawerSections } from '@/shared/lib/navigation';

interface WorkspaceSwitcherPopoverProps {
  isCollapsed: boolean;
  onClose: () => void;
  onOpenFeedback: () => void;
  onExpand: () => void;
}

const SETUP_HUB_HREF = '/setup-hub';
const ADD_ONS_HREF = '/dispatcher/add-ons';

/**
 * Bottom-rail row shown above the profile row for OWNER and ADMIN.
 * Opens a popover with Workspace / Account / System groups.
 */
export function WorkspaceSwitcherPopover({
  isCollapsed,
  onClose,
  onOpenFeedback,
  onExpand,
}: WorkspaceSwitcherPopoverProps) {
  const [open, setOpen] = useState(false);
  const { user } = useAuthStore();
  const { displayName: planDisplayName, hasFeature } = usePlan();
  const { milestone1Complete, milestone2Complete, milestone1IncompleteCount } = useOnboardingStore();
  const pathname = usePathname();

  if (!user) return null;

  const tenantName = user.tenantName ?? 'Workspace';
  const tenantInitial = tenantName.charAt(0).toUpperCase();

  const setupBadgeCount =
    !milestone1Complete && milestone1IncompleteCount > 0
      ? milestone1IncompleteCount
      : milestone1Complete && !milestone2Complete
        ? 1
        : 0;

  const handleNavigate = () => {
    setOpen(false);
    onClose();
  };

  // Collapsed: clicking expands the sidebar and opens the popover in one step.
  if (isCollapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <button
            id="tour-nav-workspace"
            aria-label={`Workspace: ${tenantName}`}
            onClick={() => {
              onExpand();
              setOpen(true);
            }}
            className="flex items-center justify-center w-full rounded-md py-1 hover:bg-muted transition-colors"
          >
            <WorkspaceAvatar initial={tenantInitial} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          {tenantName}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id="tour-nav-workspace"
          aria-label={`Workspace menu: ${tenantName}`}
          className="flex items-center gap-3 w-full rounded-md px-2 py-2 hover:bg-muted transition-colors text-left"
        >
          <WorkspaceAvatar initial={tenantInitial} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">{tenantName}</p>
            {planDisplayName && <p className="text-xs text-muted-foreground truncate">{planDisplayName}</p>}
          </div>
          <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" sideOffset={4} className="w-[var(--radix-popover-trigger-width)] p-0">
        <div className="p-4">
          <p className="text-sm font-medium text-foreground truncate">{tenantName}</p>
          {planDisplayName && (
            <Badge variant="muted" className="mt-2 text-xs">
              {planDisplayName}
            </Badge>
          )}
        </div>
        <Separator />

        {workspaceDrawerSections.map((section, sectionIdx) => {
          const visibleItems = section.items.filter((item) => {
            if (item.entitlements?.length) {
              return item.entitlements.some((e) => hasFeature(e));
            }
            if (item.entitlement) {
              return hasFeature(item.entitlement);
            }
            return true;
          });

          if (visibleItems.length === 0) return null;

          return (
            <div key={section.label || `ws-section-${sectionIdx}`}>
              {sectionIdx > 0 && <Separator />}
              <div className="p-1">
                {section.label && (
                  <p className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider px-3 pt-2 pb-1">
                    {section.label}
                  </p>
                )}
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');

                  const isSetupHub = item.href === SETUP_HUB_HREF;
                  const isAddOns = item.href === ADD_ONS_HREF;

                  if ('external' in item && item.external) {
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={handleNavigate}
                        className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors text-foreground"
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
                      onClick={handleNavigate}
                      className={cn(
                        'flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm transition-colors',
                        isActive
                          ? 'bg-black text-white dark:bg-white dark:text-black'
                          : 'text-foreground hover:bg-muted',
                      )}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      <span className="flex-1">{item.label}</span>
                      {isSetupHub && setupBadgeCount > 0 && (
                        <Badge
                          variant={milestone1Complete ? 'caution' : 'destructive'}
                          className="h-5 min-w-5 px-1 text-xs"
                        >
                          {setupBadgeCount}
                        </Badge>
                      )}
                      {isAddOns && (
                        <span className="text-2xs text-muted-foreground border border-border rounded-full px-2 py-0.5">
                          add-ons
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}

        <Separator />
        <div className="p-1">
          <p className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider px-3 pt-2 pb-1">Help</p>
          <button
            onClick={() => {
              setOpen(false);
              onOpenFeedback();
            }}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm transition-colors text-foreground hover:bg-muted"
          >
            <MessageSquarePlus className="h-4 w-4 flex-shrink-0" />
            <span className="flex-1 text-left">Feedback</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function WorkspaceAvatar({ initial }: { initial: string }) {
  return (
    <div
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
        'border-2 border-foreground bg-background text-foreground',
        'font-semibold text-sm',
      )}
      aria-hidden
    >
      {initial}
    </div>
  );
}
