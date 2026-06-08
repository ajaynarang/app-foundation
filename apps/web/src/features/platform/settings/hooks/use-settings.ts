import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getUserPreferences,
  updateUserPreferences,
  getOperationsSettings,
  updateOperationsSettings,
  getDriverPreferences,
  updateDriverPreferences,
  resetToDefaults,
} from '../api';
import type { UserPreferences, OperationsSettings, DriverPreferences } from '../api';
import { showSuccess, showError } from '@sally/ui';
import { queryKeys } from '@/shared/constants';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useUserPreferences() {
  return useQuery({
    queryKey: queryKeys.preferences.user,
    queryFn: () => getUserPreferences(),
  });
}

export function useUpdateUserPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updates: Partial<UserPreferences>) => updateUserPreferences(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.preferences.user });
      showSuccess('Preferences saved');
    },
    onError: (error: Error) => {
      showError('Failed to save preferences', extractErrorMessage(error));
    },
  });
}

export function useOperationsSettings() {
  return useQuery({
    queryKey: queryKeys.preferences.operations,
    queryFn: () => getOperationsSettings(),
  });
}

export function useUpdateOperationsSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updates: Partial<OperationsSettings>) => updateOperationsSettings(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.preferences.operations });
      showSuccess('Operations settings saved');
    },
    onError: (error: Error) => {
      showError('Failed to save operations settings', extractErrorMessage(error));
    },
  });
}

export function useDriverPreferences() {
  return useQuery({
    queryKey: queryKeys.preferences.driver,
    queryFn: () => getDriverPreferences(),
  });
}

export function useUpdateDriverPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updates: Partial<DriverPreferences>) => updateDriverPreferences(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.preferences.driver });
      showSuccess('Driver preferences saved');
    },
    onError: (error: Error) => {
      showError('Failed to save driver preferences', extractErrorMessage(error));
    },
  });
}

export function useResetPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (scope: 'user' | 'operations' | 'driver') => resetToDefaults(scope),
    onSuccess: (_, scope) => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.preferences.root, scope] });
      showSuccess('Preferences reset to defaults');
    },
    onError: (error: Error) => {
      showError('Failed to reset preferences', extractErrorMessage(error));
    },
  });
}
