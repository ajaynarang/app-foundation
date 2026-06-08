import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError } from '@app/ui';
import { invoiceSettingsApi, type InvoiceSettings } from './api';

const SETTINGS_KEY = ['invoice-settings'] as const;

export function useInvoiceSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => invoiceSettingsApi.get(),
  });
}

export function useUpdateInvoiceSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<InvoiceSettings>) => invoiceSettingsApi.update(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SETTINGS_KEY });
      showSuccess('Settings saved');
    },
    onError: (error: Error) => {
      showError('Failed to save settings', error.message);
    },
  });
}
