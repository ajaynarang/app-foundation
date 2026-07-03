import { create } from 'zustand';
import {
  UserPreferences,
  getUserPreferences,
  updateUserPreferences,
  resetToDefaults as resetToDefaultsAPI,
} from '@/features/platform/settings';
import { showSuccess, showError } from '@app/ui';
import { extractErrorMessage } from '@appshore/web-core/shared/lib/error-utils';

interface PreferencesState {
  // Preferences data
  userPreferences: UserPreferences | null;

  // Loading states
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;

  // Actions
  loadUserPreferences: () => Promise<void>;
  loadAllPreferences: (userRole?: string) => Promise<void>;

  updateUserPrefs: (updates: Partial<UserPreferences>) => Promise<void>;

  resetToDefaults: (scope: 'user') => Promise<void>;
  clearError: () => void;
}

export const usePreferencesStore = create<PreferencesState>((set, _get) => ({
  // Initial state
  userPreferences: null,
  isLoading: false,
  isSaving: false,
  error: null,

  // Load user preferences
  loadUserPreferences: async () => {
    set({ isLoading: true, error: null });
    try {
      const preferences = await getUserPreferences();
      set({ userPreferences: preferences, isLoading: false });
    } catch (error) {
      set({ error: extractErrorMessage(error), isLoading: false });
    }
  },

  // Load all preferences
  loadAllPreferences: async (_userRole?: string) => {
    set({ isLoading: true, error: null });

    try {
      const userPrefs = await getUserPreferences();
      set({ userPreferences: userPrefs });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[Preferences] Failed to load user preferences:', extractErrorMessage(error));
    }

    set({ isLoading: false });
  },

  // Update user preferences
  updateUserPrefs: async (updates: Partial<UserPreferences>) => {
    set({ isSaving: true, error: null });
    try {
      const updatedPreferences = await updateUserPreferences(updates);
      set({ userPreferences: updatedPreferences, isSaving: false });
      showSuccess('Preferences saved');
    } catch (error) {
      set({ error: extractErrorMessage(error), isSaving: false });
      showError('Failed to save preferences', extractErrorMessage(error));
      throw error;
    }
  },

  // Reset to defaults
  resetToDefaults: async (scope: 'user') => {
    set({ isSaving: true, error: null });
    try {
      const resetPreferences = await resetToDefaultsAPI(scope);
      set({ userPreferences: resetPreferences });
      set({ isSaving: false });
      showSuccess('Preferences reset to defaults');
    } catch (error) {
      set({ error: extractErrorMessage(error), isSaving: false });
      showError('Failed to reset preferences', extractErrorMessage(error));
      throw error;
    }
  },

  // Clear error
  clearError: () => {
    set({ error: null });
  },
}));
