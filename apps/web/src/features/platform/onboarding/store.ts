import { create } from 'zustand';
import { STORAGE_KEYS } from '@appshore/web-core/shared/constants';
import { onboardingApi } from './api';
import type { OnboardingStatusResponse, MilestoneStatus } from './types';

const MILESTONE_IDS = {
  SETUP: 'setup',
  INTEGRATIONS: 'integrations',
} as const;

interface OnboardingDerived {
  milestone1Complete: boolean;
  milestone2Complete: boolean;
  milestone1IncompleteCount: number;
  milestone2IncompleteCount: number;
  activeMilestone: MilestoneStatus | null;
}

/**
 * Plain values, not object getters: zustand copies state with Object.assign on
 * every set(), which would freeze a getter at the value it had on the first call.
 */
function deriveFromStatus(status: OnboardingStatusResponse | null): OnboardingDerived {
  const milestones = status?.milestones ?? [];
  const m1 = milestones.find((m) => m.id === MILESTONE_IDS.SETUP);
  const m2 = milestones.find((m) => m.id === MILESTONE_IDS.INTEGRATIONS);
  return {
    milestone1Complete: m1?.status === 'complete',
    milestone2Complete: m2?.status === 'complete',
    milestone1IncompleteCount: m1?.items.filter((i) => !i.complete).length ?? 0,
    milestone2IncompleteCount: m2?.items.filter((i) => !i.complete).length ?? 0,
    activeMilestone:
      milestones.find((m) => m.status === 'in_progress') ?? milestones.find((m) => m.status === 'available') ?? null,
  };
}

interface OnboardingStore extends OnboardingDerived {
  status: OnboardingStatusResponse | null;
  loading: boolean;
  error: string | null;

  // Actions
  fetchStatus: () => Promise<void>;
  refetchStatus: () => Promise<void>;
  dismissBanner: () => void;
  isBannerDismissed: () => boolean;
}

export const useOnboardingStore = create<OnboardingStore>((set) => ({
  status: null,
  loading: false,
  error: null,

  ...deriveFromStatus(null),

  fetchStatus: async () => {
    set({ loading: true, error: null });
    try {
      const status = await onboardingApi.getStatus();
      set({ status, loading: false, ...deriveFromStatus(status) });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      set({ error: message, loading: false });
    }
  },

  refetchStatus: async () => {
    try {
      const status = await onboardingApi.getStatus();
      set({ status, ...deriveFromStatus(status) });
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
