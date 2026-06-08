'use client';

import { useMemo } from 'react';

import { Badge } from '@/shared/components/ui/badge';
import { FormSheet } from '@/shared/components/ui/form-sheet';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';

import { useAuthStore } from '@/features/auth/store';

import { useAgent, useAgentActivity, useUpdateAgent } from '../../hooks/use-agents';
import { useDirtyState } from '../../hooks/use-dirty-state';
import { useMemories } from '../../hooks/use-memories';
import { useUpdateResponsibility } from '../../hooks/use-responsibilities';
import { canEditAgent, canReassignSupervisor } from '../../lib/permissions';
import { useDeskStore } from '../../store/desk-store';

import { AgentAvatar } from './agent-avatar';
import { AgentSheetFooter } from './agent-sheet-footer';
import { ActivityTab } from './tabs/activity-tab';
import { MemoryTab } from './tabs/memory-tab';
import { OverviewTab } from './tabs/overview-tab';
import { RulesTab } from './tabs/rules-tab';

const TAB_VALUES = {
  OVERVIEW: 'overview',
  RULES: 'rules',
  MEMORY: 'memory',
  ACTIVITY: 'activity',
} as const;

/**
 * Agent detail surface — a FormSheet with a simple title (name + badge)
 * and four tabs: Overview · Rules · Memory · Activity.
 *
 * Responsibilities live inline inside Overview (decision per PR #675).
 * Rules tab carries operator intent (structured conditions summary +
 * free-form playbook rules). Memory tab carries Sally's observations
 * (entity + pattern memories). All writes go through `useDirtyState` →
 * batched PATCHes on Save.
 */
export function AgentSheet() {
  const selectedAgentKey = useDeskStore((s) => s.selectedAgentKey);
  const closeAgent = useDeskStore((s) => s.closeAgent);

  const user = useAuthStore((s) => s.user);
  const detail = useAgent(selectedAgentKey);
  const activity = useAgentActivity(selectedAgentKey, '7d');
  const memories = useMemories({ agentKey: selectedAgentKey ?? undefined, activeOnly: true, limit: 100 });

  const updateAgent = useUpdateAgent();
  const updateResponsibility = useUpdateResponsibility();

  const dirty = useDirtyState();

  const agent = detail.data;
  const permUser = useMemo(() => (user ? { dbId: user.dbId, role: user.role } : null), [user]);
  const canEdit = canEditAgent(permUser, agent ?? null);
  const canReassign = canReassignSupervisor(permUser);

  const activityCount = activity.data?.episodeCount ?? 0;
  const memoryCount = memories.data?.rows.length ?? 0;

  const pendingSupervisorUserId: number | null | undefined = dirty.dirty.agent.supervisorUserId;

  const pendingEnabled = dirty.dirty.agent.enabled;
  const isAgentActive = pendingEnabled ?? agent?.isActive ?? false;
  const isComingSoon = (agent?.responsibilities ?? []).every((r) => r.lifecycle === 'COMING_SOON');

  // Close discards dirty state silently — outside-click is blocked when
  // dirty (via FormSheet's edit mode), so reaching this path is explicit.
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      dirty.reset();
      closeAgent();
    }
  };

  const handleSave = () =>
    dirty.save(agent!.key, {
      updateAgent: (input) => updateAgent.mutateAsync(input),
      updateResponsibility: (input) => updateResponsibility.mutateAsync(input),
    });

  const title = agent?.name ?? 'Agent';
  const titleNode = agent ? (
    <SheetTitleRow name={agent.name} isComingSoon={isComingSoon} agentKey={agent.key} />
  ) : undefined;

  return (
    <FormSheet
      open={!!selectedAgentKey}
      onOpenChange={handleOpenChange}
      title={title}
      titleNode={titleNode}
      mode={canEdit ? 'edit' : 'view'}
      onSubmit={canEdit ? handleSave : undefined}
      submitLabel="Save changes"
      cancelLabel="Cancel"
      submitDisabled={!dirty.isDirty || dirty.isSaving}
      isSubmitting={dirty.isSaving}
      pinnable
      resizable
      entityType="desk-agent"
      footerExtra={
        agent ? (
          <AgentSheetFooter
            canEdit={canEdit}
            isAgentActive={isAgentActive}
            supervisor={agent.supervisor}
            onPauseAgent={() => dirty.setAgentEnabled(false)}
            onResumeAgent={() => dirty.setAgentEnabled(true)}
          />
        ) : null
      }
    >
      {detail.isLoading || !agent ? (
        <SheetSkeleton />
      ) : (
        <div className="space-y-4">
          <Tabs defaultValue={TAB_VALUES.OVERVIEW}>
            <TabsList>
              <TabsTrigger value={TAB_VALUES.OVERVIEW}>Overview</TabsTrigger>
              <TabsTrigger value={TAB_VALUES.RULES}>Rules</TabsTrigger>
              <TabsTrigger value={TAB_VALUES.MEMORY}>Memory{memoryCount > 0 ? ` (${memoryCount})` : ''}</TabsTrigger>
              <TabsTrigger value={TAB_VALUES.ACTIVITY}>
                Activity{activityCount > 0 ? ` (${activityCount})` : ''}
              </TabsTrigger>
            </TabsList>

            <TabsContent value={TAB_VALUES.OVERVIEW} className="mt-4">
              <OverviewTab
                agent={agent}
                activity={activity.data}
                activityLoading={activity.isLoading}
                canReassign={canReassign}
                canEdit={canEdit}
                isSupervisorEditable={canReassign && !dirty.isSaving}
                onSupervisorChange={dirty.setAgentSupervisor}
                pendingSupervisorUserId={pendingSupervisorUserId}
                responsibilitiesPending={dirty.dirty.responsibilities}
                onSetResponsibilityEnabled={dirty.setResponsibilityEnabled}
                onSetResponsibilityTrust={dirty.setResponsibilityTrust}
                onSetResponsibilityConditions={dirty.setResponsibilityConditions}
              />
            </TabsContent>
            <TabsContent value={TAB_VALUES.RULES} className="mt-4">
              <RulesTab agentKey={agent.key} canEdit={canEdit} supervisorFirstName={agent.supervisor?.firstName} />
            </TabsContent>
            <TabsContent value={TAB_VALUES.MEMORY} className="mt-4">
              <MemoryTab agentKey={agent.key} canEdit={canEdit} supervisorFirstName={agent.supervisor?.firstName} />
            </TabsContent>
            <TabsContent value={TAB_VALUES.ACTIVITY} className="mt-4">
              <ActivityTab agentKey={agent.key} />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </FormSheet>
  );
}

function SheetTitleRow({
  name,
  isComingSoon,
  agentKey,
}: {
  name: string;
  isComingSoon: boolean;
  agentKey: Parameters<typeof AgentAvatar>[0]['agentKey'];
}) {
  return (
    <div className="flex items-center gap-3">
      <AgentAvatar agentKey={agentKey} variant={isComingSoon ? 'coming-soon' : 'active'} size="md" />
      <span className="truncate">{name}</span>
      {isComingSoon && (
        <Badge variant="muted" className="text-[10px] uppercase tracking-wider">
          Coming soon
        </Badge>
      )}
    </div>
  );
}

function SheetSkeleton() {
  return (
    <div className="mt-2 space-y-4">
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
