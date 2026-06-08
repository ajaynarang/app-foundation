import { create } from 'zustand';
import type { OperationsSettings } from '@app/shared-types';
import { getOperationsSettings, updateOperationsSettings, resetToDefaults as resetToDefaultsAPI } from './api';
import { showSuccess, showError } from '@app/ui';

interface PreferencesState {
  operationsSettings: OperationsSettings | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;

  loadOperationsSettings: () => Promise<void>;
  loadAllPreferences: (userRole: string) => Promise<void>;
  updateOperationsSettings: (updates: Partial<OperationsSettings>) => Promise<void>;
  resetToDefaults: (scope: 'user' | 'operations' | 'driver') => Promise<void>;
  clearError: () => void;
}

export const usePreferencesStore = create<PreferencesState>((set) => ({
  operationsSettings: null,
  isLoading: false,
  isSaving: false,
  error: null,

  loadOperationsSettings: async () => {
    set({ isLoading: true, error: null });
    try {
      const settings = await getOperationsSettings();
      set({ operationsSettings: settings, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, isLoading: false });
    }
  },

  loadAllPreferences: async (userRole: string) => {
    set({ isLoading: true, error: null });
    if (userRole === 'DISPATCHER' || userRole === 'ADMIN' || userRole === 'OWNER') {
      try {
        const operationsSettings = await getOperationsSettings();
        set({ operationsSettings });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[Preferences] Failed to load operations settings:', message);
        set({ error: message });
      }
    }
    set({ isLoading: false });
  },

  updateOperationsSettings: async (updates: Partial<OperationsSettings>) => {
    set({ isSaving: true, error: null });
    try {
      const updatedSettings = await updateOperationsSettings(updates);
      set({ operationsSettings: updatedSettings, isSaving: false });
      showSuccess('Operations settings saved');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, isSaving: false });
      showError('Failed to save operations settings', message);
      throw error;
    }
  },

  resetToDefaults: async (scope: 'user' | 'operations' | 'driver') => {
    set({ isSaving: true, error: null });
    try {
      const resetPreferences = await resetToDefaultsAPI(scope);
      if (scope === 'operations') {
        set({ operationsSettings: resetPreferences as OperationsSettings });
      }
      set({ isSaving: false });
      showSuccess('Preferences reset to defaults');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, isSaving: false });
      showError('Failed to reset preferences', message);
      throw error;
    }
  },

  clearError: () => {
    set({ error: null });
  },
}));
