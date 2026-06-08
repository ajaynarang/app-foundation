import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUserPreferences, updateUserPreferences, resetToDefaults } from '../api';
import type { UserPreferences } from '../api';
import { showSuccess, showError } from '@app/ui';
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

export function useResetPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (scope: 'user') => resetToDefaults(scope),
    onSuccess: (_, scope) => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.preferences.root, scope] });
      showSuccess('Preferences reset to defaults');
    },
    onError: (error: Error) => {
      showError('Failed to reset preferences', extractErrorMessage(error));
    },
  });
}
