import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError } from '@sally/ui';
import { queryKeys } from '@/shared/constants';
import { emailIntakeApi } from '../api';
import type { EmailIngestSettings } from '../types';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useEmailIntakeSettings() {
  return useQuery({
    queryKey: queryKeys.emailIngest.settings,
    queryFn: emailIntakeApi.getSettings,
  });
}

export function useUpdateEmailIntakeSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<EmailIngestSettings>) => emailIntakeApi.updateSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.emailIngest.settings,
      });
      showSuccess('Email intake settings saved');
    },
    onError: (err: Error) => showError('Failed to save settings', extractErrorMessage(err)),
  });
}
