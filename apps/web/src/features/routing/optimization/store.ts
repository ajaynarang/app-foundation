/**
 * Zustand store for engine state management
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { OptimizationResult } from '@/features/routing/optimization';

interface EngineState {
  // Current inputs
  driverId: string;
  hoursDriven: number;
  onDutyTime: number;
  hoursSinceBreak: number;
  dockDurationHours: number | null;
  dockLocation: string;
  remainingDistanceMiles: number | null;
  destination: string;

  // Latest result
  latestResult: OptimizationResult | null;
  latestInput: Record<string, unknown> | null;
  isLoading: boolean;
  error: string | null;

  // History
  history: Array<{
    timestamp: Date;
    input: Record<string, unknown>;
    result: OptimizationResult;
  }>;

  // Actions
  setDriverInput: (data: {
    driverId: string;
    hoursDriven: number;
    onDutyTime: number;
    hoursSinceBreak: number;
  }) => void;

  setDockInput: (data: { dockDurationHours: number | null; dockLocation: string }) => void;

  setRouteInput: (data: { remainingDistanceMiles: number | null; destination: string }) => void;

  setResult: (result: OptimizationResult) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  addToHistory: (input: Record<string, unknown>, result: OptimizationResult) => void;
  clearForm: () => void;
}

export const useEngineStore = create<EngineState>()(
  devtools(
    (set) => ({
      // Initial state
      driverId: '',
      hoursDriven: 0,
      onDutyTime: 0,
      hoursSinceBreak: 0,
      dockDurationHours: null,
      dockLocation: '',
      remainingDistanceMiles: null,
      destination: '',
      latestResult: null,
      latestInput: null,
      isLoading: false,
      error: null,
      history: [],

      // Actions
      setDriverInput: (data) =>
        set({
          driverId: data.driverId,
          hoursDriven: data.hoursDriven,
          onDutyTime: data.onDutyTime,
          hoursSinceBreak: data.hoursSinceBreak,
        }),

      setDockInput: (data) =>
        set({
          dockDurationHours: data.dockDurationHours,
          dockLocation: data.dockLocation,
        }),

      setRouteInput: (data) =>
        set({
          remainingDistanceMiles: data.remainingDistanceMiles,
          destination: data.destination,
        }),

      setResult: (result) =>
        set({
          latestResult: result,
          isLoading: false,
          error: null,
        }),

      setLoading: (isLoading) => set({ isLoading }),

      setError: (error) =>
        set({
          error,
          isLoading: false,
        }),

      addToHistory: (input, result) =>
        set((state) => ({
          latestInput: input,
          history: [
            {
              timestamp: new Date(),
              input,
              result,
            },
            ...state.history.slice(0, 9), // Keep last 10
          ],
        })),

      clearForm: () =>
        set({
          driverId: '',
          hoursDriven: 0,
          onDutyTime: 0,
          hoursSinceBreak: 0,
          dockDurationHours: null,
          dockLocation: '',
          remainingDistanceMiles: null,
          destination: '',
          latestResult: null,
          error: null,
        }),
    }),
    { name: 'EngineStore' },
  ),
);
