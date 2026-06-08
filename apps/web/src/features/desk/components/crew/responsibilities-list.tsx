'use client';

import { Skeleton } from '@/shared/components/ui/skeleton';

import { useResponsibilities } from '../../hooks/use-responsibilities';
import type { AgentKey, DeskResponsibilityListItem, TrustLevel } from '../../types';

import { ResponsibilityCard } from './responsibility-card';

export interface ResponsibilitiesListProps {
  agentKey: AgentKey;
  canEdit: boolean;
  pending: Record<
    string,
    {
      enabled?: boolean;
      trustLevel?: TrustLevel;
      conditions?: Record<string, unknown>;
    }
  >;
  onSetEnabled: (respKey: string, enabled: boolean) => void;
  onSetTrust: (respKey: string, trust: TrustLevel) => void;
  onSetConditions: (respKey: string, conditions: Record<string, unknown>) => void;
}

/**
 * Pure presentational list of responsibility cards for a single agent.
 * Render-anywhere: today it lives inside the Overview tab; can move back
 * into a dedicated tab without changes.
 */
export function ResponsibilitiesList({
  agentKey,
  canEdit,
  pending,
  onSetEnabled,
  onSetTrust,
  onSetConditions,
}: ResponsibilitiesListProps) {
  const { data: list, isLoading } = useResponsibilities();

  if (isLoading) return <ListSkeleton />;

  const owned = (list ?? []).filter((r) => r.agentKey === agentKey);
  if (owned.length === 0) {
    return <p className="text-sm text-muted-foreground">This agent has no responsibilities yet.</p>;
  }

  const sorted = [...owned].sort((a, b) => {
    if (a.lifecycle === b.lifecycle) return a.title.localeCompare(b.title);
    return a.lifecycle === 'AVAILABLE' ? -1 : 1;
  });

  return (
    <div className="space-y-3">
      {sorted.map((r) => (
        <ResponsibilityCard
          key={r.key}
          item={r as DeskResponsibilityListItem}
          canEdit={canEdit}
          pendingEnabled={pending[r.key]?.enabled}
          pendingTrustLevel={pending[r.key]?.trustLevel}
          pendingConditions={pending[r.key]?.conditions}
          onToggleEnabled={(e) => onSetEnabled(r.key, e)}
          onTrustLevelChange={(t) => onSetTrust(r.key, t)}
          onConditionsChange={(c) => onSetConditions(r.key, c)}
        />
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 2 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-md" />
      ))}
    </div>
  );
}
