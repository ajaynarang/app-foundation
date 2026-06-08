import { create } from 'zustand';
import { STORAGE_KEYS } from '@/shared/constants';
import { onboardingApi } from './api';
import type { OnboardingStatusResponse, MilestoneStatus } from './types';

const MILESTONE_IDS = {
  CONNECT_FLEET: 'connect-fleet',
  BRING_LOADS: 'bring-loads',
  OPTIMIZE: 'optimize',
} as const;

interface OnboardingStore {
  status: OnboardingStatusResponse | null;
  loading: boolean;
  error: string | null;

  // Computed helpers
  milestone1Complete: boolean;
  milestone2Complete: boolean;
  milestone1IncompleteCount: number;
  milestone2IncompleteCount: number;
  activeMilestone: MilestoneStatus | null;

  // Actions
  fetchStatus: () => Promise<void>;
  refetchStatus: () => Promise<void>;
  dismissBanner: () => void;
  isBannerDismissed: () => boolean;
}

export const useOnboardingStore = create<OnboardingStore>((set, get) => ({
  status: null,
  loading: false,
  error: null,

  get milestone1Complete() {
    const m1 = get().status?.milestones.find((m) => m.id === MILESTONE_IDS.CONNECT_FLEET);
    return m1?.status === 'complete' || false;
  },

  get milestone2Complete() {
    const m2 = get().status?.milestones.find((m) => m.id === MILESTONE_IDS.BRING_LOADS);
    return m2?.status === 'complete' || false;
  },

  get milestone1IncompleteCount() {
    const m1 = get().status?.milestones.find((m) => m.id === MILESTONE_IDS.CONNECT_FLEET);
    return m1?.items.filter((i) => !i.complete).length ?? 0;
  },

  get milestone2IncompleteCount() {
    const m2 = get().status?.milestones.find((m) => m.id === MILESTONE_IDS.BRING_LOADS);
    return m2?.items.filter((i) => !i.complete).length ?? 0;
  },

  get activeMilestone() {
    const milestones = get().status?.milestones;
    if (!milestones) return null;
    return (
      milestones.find((m) => m.status === 'in_progress') ?? milestones.find((m) => m.status === 'available') ?? null
    );
  },

  fetchStatus: async () => {
    set({ loading: true, error: null });
    try {
      const status = await onboardingApi.getStatus();
      set({ status, loading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      set({ error: message, loading: false });
    }
  },

  refetchStatus: async () => {
    try {
      const status = await onboardingApi.getStatus();
      set({ status });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to refetch onboarding status:', error);
    }
  },

  dismissBanner: () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.ONBOARDING_BANNER_DISMISSED, 'true');
    }
  },

  isBannerDismissed: () => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(STORAGE_KEYS.ONBOARDING_BANNER_DISMISSED) === 'true';
  },
}));
