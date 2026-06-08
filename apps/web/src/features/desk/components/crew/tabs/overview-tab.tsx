'use client';

import { Skeleton } from '@/shared/components/ui/skeleton';
import { formatRelativeTime } from '@/shared/lib/utils/formatters';

import type { AgentActivityStats, AgentDetail, TrustLevel } from '../../../types';
import { ResponsibilitiesList } from '../responsibilities-list';
import { SupervisorField } from '../supervisor-field';

interface OverviewTabProps {
  agent: AgentDetail;
  activity: AgentActivityStats | undefined;
  activityLoading: boolean;
  canReassign: boolean;
  canEdit: boolean;
  isSupervisorEditable: boolean;
  onSupervisorChange: (nextUserId: number | null) => void;
  pendingSupervisorUserId?: number | null;
  responsibilitiesPending: Record<
    string,
    {
      enabled?: boolean;
      trustLevel?: TrustLevel;
      conditions?: Record<string, unknown>;
    }
  >;
  onSetResponsibilityEnabled: (respKey: string, enabled: boolean) => void;
  onSetResponsibilityTrust: (respKey: string, trust: TrustLevel) => void;
  onSetResponsibilityConditions: (respKey: string, conditions: Record<string, unknown>) => void;
}

export function OverviewTab({
  agent,
  activity,
  activityLoading,
  canReassign,
  canEdit,
  isSupervisorEditable,
  onSupervisorChange,
  pendingSupervisorUserId,
  responsibilitiesPending,
  onSetResponsibilityEnabled,
  onSetResponsibilityTrust,
  onSetResponsibilityConditions,
}: OverviewTabProps) {
  return (
    <section className="space-y-6">
      {agent.description ? (
        <p className="text-sm leading-relaxed text-muted-foreground">{agent.description}</p>
      ) : (
        <p className="text-sm italic text-muted-foreground">No description yet.</p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCell
          label="Last activity"
          value={
            activityLoading ? (
              <Skeleton className="h-4 w-16" />
            ) : activity?.lastActivityAt ? (
              formatRelativeTime(activity.lastActivityAt)
            ) : (
              'Never'
            )
          }
        />
        <StatCell
          label="This week"
          value={
            activityLoading ? (
              <Skeleton className="h-4 w-24" />
            ) : (
              `${activity?.episodeCount ?? 0} episodes · ${activity?.toolCallCount ?? 0} tool calls`
            )
          }
        />
      </div>

      <div className="border-t border-border pt-4">
        <SupervisorField
          supervisor={agent.supervisor}
          pendingSupervisorUserId={pendingSupervisorUserId}
          canReassign={canReassign}
          onChange={onSupervisorChange}
          disabled={!isSupervisorEditable}
        />
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <h3 className="text-sm font-medium text-foreground">Responsibilities</h3>
        <ResponsibilitiesList
          agentKey={agent.key}
          canEdit={canEdit}
          pending={responsibilitiesPending}
          onSetEnabled={onSetResponsibilityEnabled}
          onSetTrust={onSetResponsibilityTrust}
          onSetConditions={onSetResponsibilityConditions}
        />
      </div>
    </section>
  );
}

function StatCell({ label, value }: { label: string; value: React.ReactNode | number }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="text-sm font-medium text-foreground">{value}</div>
      <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}
