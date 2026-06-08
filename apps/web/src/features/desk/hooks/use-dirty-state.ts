import { useCallback, useState } from 'react';
import { showError, showSuccess } from '@sally/ui';

import type { TrustLevel, UpdateAgentRequest, UpdateDeskResponsibilityRequest } from '../types';

export interface ResponsibilityPatch extends UpdateDeskResponsibilityRequest {}

export interface DirtyState {
  agent: UpdateAgentRequest;
  responsibilities: Record<string, ResponsibilityPatch>;
}

type DirtyAction =
  | { kind: 'agent'; patch: Partial<UpdateAgentRequest> }
  | { kind: 'responsibility'; key: string; patch: Partial<ResponsibilityPatch> };

interface SaveHandlers {
  updateAgent: (input: { key: string; body: UpdateAgentRequest }) => Promise<unknown>;
  updateResponsibility: (input: { key: string; patch: UpdateDeskResponsibilityRequest }) => Promise<unknown>;
}

/**
 * Accumulates pending edits on the agent sheet and fires them as a single
 * batched "Save changes" — one PATCH for the agent (if dirty), one PATCH
 * per dirty responsibility. On success: single toast + reset.
 *
 * This is the ONLY write path out of the rewritten sheet — per-field
 * auto-saves are intentionally removed so users can review before commit.
 */
export function useDirtyState() {
  const [dirty, setDirty] = useState<DirtyState>({ agent: {}, responsibilities: {} });
  const [isSaving, setIsSaving] = useState(false);

  const isDirty =
    Object.keys(dirty.agent).length > 0 || Object.values(dirty.responsibilities).some((p) => Object.keys(p).length > 0);

  const apply = useCallback((action: DirtyAction) => {
    setDirty((prev) => {
      if (action.kind === 'agent') {
        return { ...prev, agent: { ...prev.agent, ...action.patch } };
      }
      const existing = prev.responsibilities[action.key] ?? {};
      return {
        ...prev,
        responsibilities: {
          ...prev.responsibilities,
          [action.key]: { ...existing, ...action.patch },
        },
      };
    });
  }, []);

  const reset = useCallback(() => {
    setDirty({ agent: {}, responsibilities: {} });
  }, []);

  const save = useCallback(
    async (agentKey: string, handlers: SaveHandlers) => {
      if (!isDirty) return;
      setIsSaving(true);
      try {
        const tasks: Promise<unknown>[] = [];
        if (Object.keys(dirty.agent).length > 0) {
          tasks.push(handlers.updateAgent({ key: agentKey, body: dirty.agent as UpdateAgentRequest }));
        }
        for (const [respKey, patch] of Object.entries(dirty.responsibilities)) {
          if (Object.keys(patch).length === 0) continue;
          tasks.push(handlers.updateResponsibility({ key: respKey, patch: patch as UpdateDeskResponsibilityRequest }));
        }
        const results = await Promise.allSettled(tasks);
        const failed = results.filter((r) => r.status === 'rejected');
        if (failed.length === 0) {
          showSuccess('Changes saved');
          reset();
        } else if (failed.length === results.length) {
          const first = failed[0] as PromiseRejectedResult;
          showError('Failed to save', first.reason instanceof Error ? first.reason.message : String(first.reason));
        } else {
          showError(`${failed.length} of ${results.length} changes failed to save`);
        }
      } finally {
        setIsSaving(false);
      }
    },
    [dirty, isDirty, reset],
  );

  return {
    dirty,
    isDirty,
    isSaving,
    setAgentEnabled: (enabled: boolean) => apply({ kind: 'agent', patch: { enabled } }),
    setAgentSupervisor: (supervisorUserId: number | null) => apply({ kind: 'agent', patch: { supervisorUserId } }),
    setResponsibilityTrust: (key: string, trustLevel: TrustLevel) =>
      apply({ kind: 'responsibility', key, patch: { trustLevel } }),
    setResponsibilityEnabled: (key: string, enabled: boolean) =>
      apply({ kind: 'responsibility', key, patch: { enabled } }),
    setResponsibilityConditions: (key: string, conditions: Record<string, unknown>) =>
      apply({ kind: 'responsibility', key, patch: { conditions } }),
    reset,
    save,
  };
}
