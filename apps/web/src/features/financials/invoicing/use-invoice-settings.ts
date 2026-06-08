import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError } from '@sally/ui';
import { invoiceSettingsApi } from './api';
import { queryKeys } from '@/shared/constants';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useInvoiceSettings() {
  return useQuery({
    queryKey: queryKeys.invoiceSettings.root,
    queryFn: () => invoiceSettingsApi.get(),
  });
}

export function useUpdateInvoiceSettings() {
  const qc = useQueryClient();
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: (data: Record<string, any>) => invoiceSettingsApi.update(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.invoiceSettings.root });
      showSuccess('Settings saved');
    },
    onError: (error: Error) => {
      showError('Failed to save settings', extractErrorMessage(error));
    },
  });
}
