import { useOnboardingStore } from '../store';
import { onboardingApi } from '../api';
import type { MilestoneStatus, OnboardingItem, OnboardingStatusResponse } from '../types';

jest.mock('../api', () => ({ onboardingApi: { getStatus: jest.fn() } }));

const getStatus = onboardingApi.getStatus as jest.MockedFunction<typeof onboardingApi.getStatus>;

const item = (id: string, complete: boolean): OnboardingItem => ({
  id,
  title: id,
  description: '',
  complete,
  statusText: '',
  actionLink: '/',
  actionType: 'link',
});

const milestone = (id: string, status: MilestoneStatus['status'], items: OnboardingItem[]): MilestoneStatus => ({
  id,
  title: id,
  subtitle: '',
  status,
  unlockMessage: '',
  items,
});

const response = (milestones: MilestoneStatus[]): OnboardingStatusResponse => ({
  overallProgress: 0,
  completedItems: 0,
  totalItems: 0,
  milestones,
});

describe('useOnboardingStore derived values', () => {
  beforeEach(() => {
    getStatus.mockReset();
    useOnboardingStore.setState({
      status: null,
      loading: false,
      error: null,
      milestone1Complete: false,
      milestone2Complete: false,
      milestone1IncompleteCount: 0,
      milestone2IncompleteCount: 0,
      activeMilestone: null,
    });
  });

  it('starts with nothing complete and no active milestone', () => {
    const state = useOnboardingStore.getState();
    expect(state.milestone1Complete).toBe(false);
    expect(state.milestone1IncompleteCount).toBe(0);
    expect(state.activeMilestone).toBeNull();
  });

  it('reflects the fetched status, after earlier set() calls have run', async () => {
    const integrations = milestone('integrations', 'in_progress', [item('a', false), item('b', true)]);
    getStatus.mockResolvedValue(response([milestone('setup', 'complete', [item('profile', true)]), integrations]));

    // fetchStatus calls set({ loading: true }) first. That first set() is what
    // froze the old getter-based values, so this covers the regression.
    await useOnboardingStore.getState().fetchStatus();

    const state = useOnboardingStore.getState();
    expect(state.loading).toBe(false);
    expect(state.milestone1Complete).toBe(true);
    expect(state.milestone1IncompleteCount).toBe(0);
    expect(state.milestone2Complete).toBe(false);
    expect(state.milestone2IncompleteCount).toBe(1);
    expect(state.activeMilestone).toEqual(integrations);
  });

  it('recomputes when the status is refetched', async () => {
    getStatus.mockResolvedValue(response([milestone('setup', 'in_progress', [item('a', false), item('b', false)])]));
    await useOnboardingStore.getState().fetchStatus();
    expect(useOnboardingStore.getState().milestone1Complete).toBe(false);
    expect(useOnboardingStore.getState().milestone1IncompleteCount).toBe(2);

    getStatus.mockResolvedValue(response([milestone('setup', 'complete', [item('a', true), item('b', true)])]));
    await useOnboardingStore.getState().refetchStatus();
    expect(useOnboardingStore.getState().milestone1Complete).toBe(true);
    expect(useOnboardingStore.getState().milestone1IncompleteCount).toBe(0);
    expect(useOnboardingStore.getState().activeMilestone).toBeNull();
  });

  it('keeps the last derived values when a fetch fails', async () => {
    getStatus.mockResolvedValue(response([milestone('setup', 'complete', [])]));
    await useOnboardingStore.getState().fetchStatus();
    getStatus.mockRejectedValue(new Error('offline'));
    await useOnboardingStore.getState().fetchStatus();

    const state = useOnboardingStore.getState();
    expect(state.error).toBe('offline');
    expect(state.milestone1Complete).toBe(true);
  });
});
