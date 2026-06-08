'use client';

import { useState, useMemo, useEffect } from 'react';
import { Sparkles, Radio, Truck } from 'lucide-react';
import { Badge } from '@sally/ui/components/ui/badge';
import { cn } from '@sally/ui';
import { useDriverTimeline } from '../hooks/use-driver-timeline';
import { useDriverHome } from '../hooks/use-driver-home';
import { useSallyStore } from '@/features/platform/sally-ai/store';
import { SallyChat } from '@/features/platform/sally-ai/components/SallyChat';
import { DriverChatPanel } from './DriverChatPanel';

type ActiveTab = 'sally' | 'ops';

export function SallyOverlay() {
  return <SallyOverlayContent />;
}

function SallyOverlayContent() {
  const { openSource, isExpanded } = useSallyStore();
  const [activeTab, setActiveTab] = useState<ActiveTab>('sally');

  // Sync active tab when panel opens from different source
  // Comms tab → Dispatch, Orb → Sally
  useEffect(() => {
    if (isExpanded && openSource) {
      setActiveTab(openSource === 'tab' ? 'ops' : 'sally');
    }
  }, [isExpanded, openSource]);

  const { currentLoad } = useDriverHome();
  const loadId = currentLoad?.loadNumber;
  const { entries } = useDriverTimeline(loadId);

  // Count unread ops messages (not yet delivered)
  const unreadOpsCount = useMemo(
    () => entries.filter((e) => e.type === 'operations' && e.metadata?.messageId && !e.metadata.deliveredAt).length,
    [entries],
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Pill-style tab switcher — large touch targets for mobile */}
      <div className="px-4 pt-2 pb-1 shrink-0">
        <div className="flex items-center bg-muted rounded-lg p-1 gap-1">
          <button
            onClick={() => setActiveTab('sally')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all min-h-[44px]',
              activeTab === 'sally'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground active:bg-background/50',
            )}
          >
            <Sparkles className="h-4 w-4" />
            Sally
          </button>
          <button
            onClick={() => setActiveTab('ops')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all min-h-[44px] relative',
              activeTab === 'ops'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground active:bg-background/50',
            )}
          >
            <Radio className="h-4 w-4" />
            Dispatch
            {unreadOpsCount > 0 && (
              <Badge variant="destructive" className="h-5 min-w-[20px] text-[11px] px-1.5 rounded-full animate-pulse">
                {unreadOpsCount}
              </Badge>
            )}
          </button>
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'sally' ? (
        <SallyChat />
      ) : (
        /* Dispatch tab — the driver's full conversation with dispatch. */
        <div className="flex flex-col flex-1 min-h-0">
          {/* Load context banner — shown when the driver is on a load. */}
          {loadId && (
            <div className="px-4 py-2.5 border-b border-border shrink-0">
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-muted shrink-0 mt-0.5">
                  <Truck className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{currentLoad?.loadNumber || loadId}</p>
                  {currentLoad?.originCity && currentLoad?.destinationCity && (
                    <p className="text-xs text-muted-foreground truncate">
                      {[currentLoad.originCity, currentLoad.originState].filter(Boolean).join(', ')}
                      {' → '}
                      {[currentLoad.destinationCity, currentLoad.destinationState].filter(Boolean).join(', ')}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* The driver's full driver↔dispatch thread — independent of any
              one load, so general and other-load messages are never missed. */}
          <DriverChatPanel currentLoadNumber={loadId} />
        </div>
      )}
    </div>
  );
}
