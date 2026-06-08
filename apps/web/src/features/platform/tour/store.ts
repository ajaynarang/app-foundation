import { create } from 'zustand';
import type { TourStatus } from './types';

interface TourStore {
  isActive: boolean;
  currentStep: number;
  tourStatus: TourStatus;
  isLoading: boolean;

  startTour: () => void;
  stopTour: () => void;
  setStep: (step: number) => void;
  setTourStatus: (status: TourStatus) => void;
  setLoading: (loading: boolean) => void;
}

export const useTourStore = create<TourStore>((set) => ({
  isActive: false,
  currentStep: 0,
  tourStatus: null,
  isLoading: true,

  startTour: () => set({ isActive: true, currentStep: 0 }),
  stopTour: () => set({ isActive: false, currentStep: 0 }),
  setStep: (step) => set({ currentStep: step }),
  setTourStatus: (status) => set({ tourStatus: status }),
  setLoading: (loading) => set({ isLoading: loading }),
}));
