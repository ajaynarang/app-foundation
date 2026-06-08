/**
 * Sally's Desk — API client.
 *
 * Wraps the v3 endpoints under `/desk/*` declared in the backend:
 *   - apps/backend/src/domains/desk/core/agent/agent.controller.ts
 *   - apps/backend/src/domains/desk/core/responsibility/responsibility.controller.ts
 *   - apps/backend/src/domains/desk/core/episode/desk-episode.controller.ts
 *   - apps/backend/src/domains/desk/core/approval/approval.controller.ts
 *   - apps/backend/src/domains/desk/core/memory/memory.controller.ts
 */

import { apiClient } from '@/shared/lib/api';

import type {
  AgentActivityStats,
  AgentActivityWindow,
  AgentDetail,
  AgentRosterItem,
  ApprovalRecord,
  ApprovalScope,
  ConditionsUISpec,
  DecideApprovalRequest,
  DeskEntitySuppression,
  DeskEpisodeDetail,
  DeskResponsibilityDetail,
  DeskResponsibilityListItem,
  EligibleSupervisor,
  EpisodeListItem,
  HandoffCounts,
  AddPlaybookRuleRequest,
  DeskScheduleState,
  ListDeskEpisodesQuery,
  ListDeskEpisodesResponse,
  ListHandledEpisodesQuery,
  ListHandledEpisodesResponse,
  ListMemoriesQuery,
  MemoryRecord,
  ResolveEpisodeRequest,
  SetMemoryPinnedRequest,
  SnoozeEpisodeRequest,
  UpdateAgentRequest,
  UpdateDeskResponsibilityRequest,
  UpdateDeskScheduleRequest,
  UpdateMemoryRequest,
  UpdateResponsibilityAutonomyRequest,
} from './types';

function qs(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    sp.set(k, String(v));
  }
  const str = sp.toString();
  return str ? `?${str}` : '';
}

export interface ResponsibilityUISpecResponse {
  key: string;
  title: string;
  description: string;
  lifecycle: string;
  conditionsUI: ConditionsUISpec | null;
  defaults: {
    trustLevel: 'SUPERVISED' | 'ASSISTED' | 'AUTONOMOUS';
    conditions: Record<string, unknown>;
  };
  triggers: Array<Record<string, unknown>>;
  tools: string[];
}

export interface RunResponsibilityResponse {
  episodesOpened: number;
  episodesReused?: number;
  skipped?: string;
}

export interface UpdateAgentResponse {
  updatedResponsibilityCount: number;
  supervisorUpdated: boolean;
}

export const deskApi = {
  agents: {
    list: (): Promise<AgentRosterItem[]> => apiClient<AgentRosterItem[]>('/desk/agents'),

    get: (key: string): Promise<AgentDetail> => apiClient<AgentDetail>(`/desk/agents/${encodeURIComponent(key)}`),

    activity: (key: string, window: AgentActivityWindow): Promise<AgentActivityStats> =>
      apiClient<AgentActivityStats>(`/desk/agents/${encodeURIComponent(key)}/activity${qs({ window })}`),

    eligibleSupervisors: (): Promise<EligibleSupervisor[]> =>
      apiClient<EligibleSupervisor[]>('/desk/agents/eligible-supervisors'),

    update: (key: string, body: UpdateAgentRequest): Promise<UpdateAgentResponse> =>
      apiClient<UpdateAgentResponse>(`/desk/agents/${encodeURIComponent(key)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
  },

  responsibilities: {
    list: (): Promise<DeskResponsibilityListItem[]> =>
      apiClient<DeskResponsibilityListItem[]>('/desk/responsibilities'),

    get: (key: string): Promise<DeskResponsibilityDetail> =>
      apiClient<DeskResponsibilityDetail>(`/desk/responsibilities/${encodeURIComponent(key)}`),

    getUISpec: (key: string): Promise<ResponsibilityUISpecResponse> =>
      apiClient<ResponsibilityUISpecResponse>(`/desk/responsibilities/${encodeURIComponent(key)}/ui-spec`),

    update: (key: string, patch: UpdateDeskResponsibilityRequest): Promise<DeskResponsibilityDetail> =>
      apiClient<DeskResponsibilityDetail>(`/desk/responsibilities/${encodeURIComponent(key)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),

    updateAutonomy: (key: string, body: UpdateResponsibilityAutonomyRequest): Promise<DeskResponsibilityDetail> =>
      apiClient<DeskResponsibilityDetail>(`/desk/responsibilities/${encodeURIComponent(key)}/autonomy`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),

    run: (key: string): Promise<RunResponsibilityResponse> =>
      apiClient<RunResponsibilityResponse>(`/desk/responsibilities/${encodeURIComponent(key)}/run`, { method: 'POST' }),
  },

  schedule: {
    get: (): Promise<DeskScheduleState> => apiClient<DeskScheduleState>('/desk/schedule'),

    update: (body: UpdateDeskScheduleRequest): Promise<DeskScheduleState> =>
      apiClient<DeskScheduleState>('/desk/schedule', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
  },

  episodes: {
    list: (query?: ListDeskEpisodesQuery): Promise<ListDeskEpisodesResponse> =>
      apiClient<ListDeskEpisodesResponse>(`/desk/episodes${qs((query ?? {}) as Record<string, unknown>)}`),

    handled: (query: ListHandledEpisodesQuery): Promise<ListHandledEpisodesResponse> =>
      apiClient<ListHandledEpisodesResponse>(`/desk/episodes/handled${qs(query as Record<string, unknown>)}`),

    get: (id: string): Promise<DeskEpisodeDetail> => apiClient<DeskEpisodeDetail>(`/desk/episodes/${id}`),

    resolve: (id: string, body: ResolveEpisodeRequest): Promise<{ id: string; status: string }> =>
      apiClient<{ id: string; status: string }>(`/desk/episodes/${id}/resolve`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
  },

  approvals: {
    listPending: (params?: { limit?: number; scope?: ApprovalScope }): Promise<EpisodeListItem[]> =>
      apiClient<EpisodeListItem[]>(`/desk/approvals${qs((params ?? {}) as Record<string, unknown>)}`),

    counts: (): Promise<HandoffCounts> => apiClient<HandoffCounts>('/desk/approvals/counts'),

    claim: (id: string): Promise<ApprovalRecord> =>
      apiClient<ApprovalRecord>(`/desk/approvals/${id}/claim`, {
        method: 'POST',
      }),

    decide: (id: string, body: DecideApprovalRequest): Promise<ApprovalRecord> =>
      apiClient<ApprovalRecord>(`/desk/approvals/${id}/decide`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },

  memories: {
    list: (query?: ListMemoriesQuery): Promise<{ rows: MemoryRecord[] }> =>
      apiClient<{ rows: MemoryRecord[] }>(`/desk/memories${qs((query ?? {}) as Record<string, unknown>)}`),

    update: (id: string, body: UpdateMemoryRequest): Promise<{ id: string }> =>
      apiClient<{ id: string }>(`/desk/memories/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),

    setPinned: (id: string, body: SetMemoryPinnedRequest): Promise<{ id: string; isPinned: boolean }> =>
      apiClient<{ id: string; isPinned: boolean }>(`/desk/memories/${id}/pinned`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),

    remove: (id: string): Promise<void> => apiClient<void>(`/desk/memories/${id}`, { method: 'DELETE' }),

    addPlaybookRule: (body: AddPlaybookRuleRequest): Promise<{ id: string }> =>
      apiClient<{ id: string }>(`/desk/memories/playbook`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },

  suppressions: {
    snooze: (episodeId: string, body: SnoozeEpisodeRequest): Promise<DeskEntitySuppression> =>
      apiClient<DeskEntitySuppression>(`/desk/episodes/${episodeId}/snooze`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    unsnooze: (suppressionId: string): Promise<DeskEntitySuppression> =>
      apiClient<DeskEntitySuppression>(`/desk/suppressions/${suppressionId}/unsnooze`, {
        method: 'POST',
      }),
  },
};
