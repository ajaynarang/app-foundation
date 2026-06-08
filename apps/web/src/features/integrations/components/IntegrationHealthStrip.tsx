'use client';

import { useRouter } from 'next/navigation';
import { CheckCircle2, AlertTriangle, XCircle, ChevronRight, RefreshCw } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@sally/ui/components/ui/tooltip';
import { useIntegrationHealth } from '../hooks/use-integration-health';
import { formatRelativeTime } from '../api';

interface IntegrationHealthStripProps {
  /** Which page context — determines which sync times to emphasize */
  context?: 'fleet' | 'loads';
  /** Callback to refresh all integrations */
  onRefreshAll?: () => void;
  /** Whether a sync is currently in progress */
  isSyncing?: boolean;
  /** Label for the refresh button (default: "Refresh All") */
  refreshLabel?: string;
}

export function IntegrationHealthStrip({
  context = 'fleet',
  onRefreshAll,
  isSyncing,
  refreshLabel = 'Refresh All',
}: IntegrationHealthStripProps) {
  const { data: health, isLoading } = useIntegrationHealth();
  const router = useRouter();

  if (isLoading) return null;
  if (!health) return null;

  // Don't show sync status strip when no TMS/fleet integrations are configured
  if (!health.hasFleetPipeline) return null;

  const hasError = health.tms?.hasError || health.eld?.hasError;
  const tmsDisabled = health.tms && !health.tms.isEnabled;
  const eldDisabled = health.eld && !health.eld.isEnabled;
  const hasWarning = tmsDisabled || eldDisabled || health.unmatchedAssets > 0;

  // Build sync freshness text based on context
  const lastSyncByType = health.lastSyncByType || {};
  // Compute FLEET as the latest of DRIVERS/VEHICLES sync times
  const fleetTime =
    [lastSyncByType.DRIVERS, lastSyncByType.VEHICLES, lastSyncByType.FLEET].filter(Boolean).sort().pop() ?? null;
  const syncTimes: string[] = [];

  if (context === 'fleet') {
    if (fleetTime) syncTimes.push(`Drivers & Vehicles: ${formatRelativeTime(fleetTime)}`);
    if (lastSyncByType.HOS) syncTimes.push(`HOS: ${formatRelativeTime(lastSyncByType.HOS)}`);
    if (lastSyncByType.TELEMATICS) syncTimes.push(`GPS: ${formatRelativeTime(lastSyncByType.TELEMATICS)}`);
  } else {
    if (lastSyncByType.LOADS) syncTimes.push(`Loads: ${formatRelativeTime(lastSyncByType.LOADS)}`);
    if (fleetTime) syncTimes.push(`Fleet: ${formatRelativeTime(fleetTime)}`);
  }

  const getStripContent = () => {
    if (hasError) {
      const errorParts: string[] = [];
      if (health.tms?.hasError) errorParts.push(`TMS: ${health.tms.lastErrorMessage}`);
      if (health.eld?.hasError) errorParts.push(`ELD: ${health.eld.lastErrorMessage}`);

      return {
        icon: <XCircle className="h-3.5 w-3.5 text-critical shrink-0" />,
        bgClass: 'bg-critical/10 border-critical/20',
        content: (
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
            <span className="text-critical font-medium">Data sync failed</span>
            <span className="text-critical/70 text-xs sm:text-sm">{errorParts.join(' · ')}</span>
          </div>
        ),
      };
    }

    if (hasWarning) {
      const warnings: string[] = [];
      if (tmsDisabled) warnings.push('TMS sync paused');
      if (eldDisabled) warnings.push('ELD sync paused');
      if (health.unmatchedAssets > 0) warnings.push(`${health.unmatchedAssets} unmatched assets`);

      return {
        icon: <AlertTriangle className="h-3.5 w-3.5 text-caution shrink-0" />,
        bgClass: 'bg-caution/10 border-caution/20',
        content: (
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
            <span className="text-caution font-medium">{warnings.join(' · ')}</span>
            {syncTimes.length > 0 && (
              <span className="text-muted-foreground text-xs sm:text-sm">{syncTimes.join(' · ')}</span>
            )}
          </div>
        ),
      };
    }

    // Healthy state
    return {
      icon: <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />,
      bgClass: 'bg-muted border-border',
      content: (
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
          <span className="text-muted-foreground font-medium">All data up to date</span>
          {syncTimes.length > 0 && (
            <span className="text-muted-foreground text-xs sm:text-sm">{syncTimes.join(' · ')}</span>
          )}
        </div>
      ),
    };
  };

  const { icon, bgClass, content } = getStripContent();

  return (
    <TooltipProvider>
      <div
        className={`w-full flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 px-3 sm:px-4 py-2 border rounded-lg text-sm ${bgClass}`}
      >
        <Button
          variant="ghost"
          onClick={() => router.push('/settings/system-activity?category=tms')}
          className="flex items-center gap-2 flex-1 min-w-0 h-auto p-0 hover:bg-transparent hover:opacity-80 transition-opacity text-left"
        >
          {icon}
          <div className="flex-1 min-w-0">{content}</div>
          <div className="flex items-center gap-1 text-muted-foreground shrink-0">
            <span className="hidden sm:inline text-xs">View details</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </div>
        </Button>
        {onRefreshAll && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onRefreshAll();
                }}
                disabled={isSyncing}
                className="shrink-0 self-end sm:self-auto"
              >
                <RefreshCw className={`h-3 w-3 mr-1.5 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Syncing...' : refreshLabel}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Pull latest data from all connected integrations</TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
