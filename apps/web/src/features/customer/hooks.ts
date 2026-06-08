import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customerApi } from './api';
import { showSuccess, showError } from '@sally/ui';
import { queryKeys } from '@/shared/constants';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export const CUSTOMER_LOADS_KEY = queryKeys.customer.loads;

export function useCustomerLoads() {
  return useQuery({
    queryKey: CUSTOMER_LOADS_KEY,
    queryFn: customerApi.getMyLoads,
  });
}

export function useCustomerLoadDetail(loadId: string | null) {
  return useQuery({
    queryKey: [...CUSTOMER_LOADS_KEY, loadId],
    queryFn: () => customerApi.getLoad(loadId!),
    enabled: !!loadId,
  });
}

export function useRequestLoad() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: customerApi.requestLoad,
    onSuccess: () => {
      showSuccess('Load request submitted');
      queryClient.invalidateQueries({ queryKey: CUSTOMER_LOADS_KEY });
    },
    onError: (error: Error) => {
      showError('Failed to submit request', extractErrorMessage(error));
    },
  });
}
