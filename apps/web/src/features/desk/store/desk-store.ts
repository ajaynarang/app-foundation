import { create } from 'zustand';

import type { AgentKey } from '../types';

/** Tab identifiers for the three top-level Desk surfaces. URL tokens are
 *  user-facing (`?tab=...`) so we spell them in plain operator language. */
export const DESK_TABS = {
  HANDOFFS: 'needs_you',
  HANDLED: 'handled',
  CREW: 'agents',
} as const;
export type DeskTab = (typeof DESK_TABS)[keyof typeof DESK_TABS];

/** Sentinel for the "all agents" case in the handoffs filter. */
export const AGENT_FILTER_ALL = 'all' as const;
export type AgentFilterValue = AgentKey | typeof AGENT_FILTER_ALL;

export const HANDOFF_FILTERS = {
  ALL: 'all',
  WAITING_APPROVAL: 'waiting_approval',
  ESCALATED: 'escalated',
} as const;
export type HandoffFilter = (typeof HANDOFF_FILTERS)[keyof typeof HANDOFF_FILTERS];

interface DeskState {
  activeTab: DeskTab;
  handoffFilter: HandoffFilter;
  agentFilter: AgentFilterValue;
  searchQuery: string;

  selectedEpisodeId: string | null;
  selectedAgentKey: AgentKey | null;

  setActiveTab: (tab: DeskTab) => void;
  setHandoffFilter: (filter: HandoffFilter) => void;
  setAgentFilter: (key: AgentFilterValue) => void;
  setSearchQuery: (q: string) => void;

  openEpisode: (id: string) => void;
  closeEpisode: () => void;
  openAgent: (key: AgentKey) => void;
  closeAgent: () => void;
}

export const useDeskStore = create<DeskState>((set) => ({
  activeTab: DESK_TABS.HANDOFFS,
  handoffFilter: HANDOFF_FILTERS.ALL,
  agentFilter: AGENT_FILTER_ALL,
  searchQuery: '',

  selectedEpisodeId: null,
  selectedAgentKey: null,

  setActiveTab: (tab) => set({ activeTab: tab }),
  setHandoffFilter: (filter) => set({ handoffFilter: filter }),
  setAgentFilter: (key) => set({ agentFilter: key }),
  setSearchQuery: (q) => set({ searchQuery: q }),

  openEpisode: (id) => set({ selectedEpisodeId: id }),
  closeEpisode: () => set({ selectedEpisodeId: null }),
  openAgent: (key) => set({ selectedAgentKey: key }),
  closeAgent: () => set({ selectedAgentKey: null }),
}));
