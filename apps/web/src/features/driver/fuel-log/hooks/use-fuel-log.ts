import { useMutation, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError } from '@sally/ui';
import { queryKeys } from '@/shared/constants';
import { driverFuelApi, type LogFuelPayload } from '../api';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useLogFuel() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: LogFuelPayload) => driverFuelApi.logFuel(data),
    onSuccess: () => {
      showSuccess('Fuel logged');
      qc.invalidateQueries({ queryKey: queryKeys.ifta.root });
    },
    onError: (error: Error) => {
      showError('Failed to log fuel', extractErrorMessage(error));
    },
  });
}

export function useScanReceipt() {
  return useMutation({
    mutationFn: (file: File) => driverFuelApi.scanReceipt(file),
    onSuccess: () => {
      showSuccess('Receipt scanned');
    },
    onError: (error: Error) => {
      showError('Receipt scan failed', extractErrorMessage(error));
    },
  });
}
