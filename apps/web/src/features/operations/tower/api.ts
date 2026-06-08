import { apiClient } from '@/shared/lib/api';
import type {
  ActiveLoadView,
  DriverConversationSummary,
  LoadMessage,
  LookaheadHours,
  RiskScore,
  WireItem,
  WireKind,
} from '@sally/shared-types';
import type {
  CommandCenterMapData,
  CommandCenterOverview,
  MessageSummaryResponse,
  ShiftNote,
  ShiftNotesResponse,
  SystemHealth,
} from './types';

/**
 * Tower v3 — 'shift' is a UI-only concept meaning "until shift end". For v3
 * launch we approximate it as the maximum lookahead the backend accepts (12h).
 */
const SHIFT_LOOKAHEAD_HOURS = 12;

function resolveLookaheadHours(lookahead: LookaheadHours): number {
  return lookahead === 'shift' ? SHIFT_LOOKAHEAD_HOURS : lookahead;
}

export const towerApi = {
  getActiveLoads: async (lookahead: LookaheadHours): Promise<ActiveLoadView[]> => {
    const hours = resolveLookaheadHours(lookahead);
    return apiClient<ActiveLoadView[]>(`/command-center/active-loads?lookaheadHours=${hours}`);
  },

  getRiskScores: async (lookahead: LookaheadHours): Promise<RiskScore[]> => {
    const hours = resolveLookaheadHours(lookahead);
    return apiClient<RiskScore[]>(`/command-center/risk-scores?lookaheadHours=${hours}`);
  },

  getWire: async (params: { since?: string; kinds?: WireKind[]; limit?: number } = {}): Promise<WireItem[]> => {
    const search = new URLSearchParams();
    if (params.since) search.set('since', params.since);
    if (params.kinds && params.kinds.length > 0) search.set('kinds', params.kinds.join(','));
    if (params.limit != null) search.set('limit', String(params.limit));
    const qs = search.toString();
    return apiClient<WireItem[]>(`/command-center/wire${qs ? `?${qs}` : ''}`);
  },
};

export const commandCenterApi = {
  getOverview: async (): Promise<CommandCenterOverview> => {
    return apiClient<CommandCenterOverview>('/command-center/overview');
  },

  getSystemHealth: async (): Promise<SystemHealth> => {
    return apiClient<SystemHealth>('/command-center/system-health');
  },

  getShiftNotes: async (): Promise<ShiftNotesResponse> => {
    return apiClient<ShiftNotesResponse>('/command-center/shift-notes');
  },

  createShiftNote: async (content: string, isPinned?: boolean, priority?: string): Promise<ShiftNote> => {
    return apiClient<ShiftNote>('/command-center/shift-notes', {
      method: 'POST',
      body: JSON.stringify({ content, isPinned, priority }),
    });
  },

  acknowledgeHandoff: async (): Promise<void> => {
    await apiClient('/command-center/shift-notes/acknowledge', {
      method: 'PATCH',
    });
  },

  togglePinShiftNote: async (noteId: string): Promise<ShiftNote> => {
    return apiClient<ShiftNote>(`/command-center/shift-notes/${noteId}/pin`, {
      method: 'PATCH',
    });
  },

  deleteShiftNote: async (noteId: string): Promise<void> => {
    await apiClient(`/command-center/shift-notes/${noteId}`, {
      method: 'DELETE',
    });
  },

  getMessageSummary: async (): Promise<MessageSummaryResponse> => {
    return apiClient<MessageSummaryResponse>('/command-center/message-summary');
  },

  getMapData: async (): Promise<CommandCenterMapData> => {
    return apiClient<CommandCenterMapData>('/command-center/map-data');
  },
};

/**
 * Driver-keyed messaging — the Tower Messages tab. Conversations are keyed to
 * the driver; each message carries an optional load tag.
 */
export const driverMessagesApi = {
  listConversations: async (): Promise<DriverConversationSummary[]> => {
    return apiClient<DriverConversationSummary[]>('/messages/conversations');
  },

  getThread: async (driverId: string): Promise<LoadMessage[]> => {
    return apiClient<LoadMessage[]>(`/messages/conversations/${driverId}`);
  },

  /**
   * Send a message into a driver thread. Omit `loadNumber` to default to the
   * driver's active load; pass `null` for a general (no-load) message.
   */
  send: async (driverId: string, content: string, loadNumber?: string | null): Promise<LoadMessage> => {
    return apiClient<LoadMessage>(`/messages/conversations/${driverId}`, {
      method: 'POST',
      body: JSON.stringify(loadNumber !== undefined ? { content, loadNumber } : { content }),
    });
  },

  markRead: async (driverId: string): Promise<void> => {
    await apiClient(`/messages/conversations/${driverId}/read`, { method: 'PATCH' });
  },
};
