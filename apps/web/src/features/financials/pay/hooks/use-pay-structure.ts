import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError } from '@sally/ui';
import { queryKeys } from '@/shared/constants';
import { payStructuresApi } from '../api';
import type { PayStructureType } from '../types';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function usePayStructure(driverId: string) {
  return useQuery({
    queryKey: [...queryKeys.payStructures.root, driverId],
    queryFn: () => payStructuresApi.getByDriverId(driverId),
    enabled: !!driverId,
  });
}

export function useUpsertPayStructure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      driverId,
      data,
    }: {
      driverId: string;
      data: {
        type: PayStructureType;
        ratePerMileCents?: number;
        percentage?: number;
        flatRateCents?: number;
        hybridBaseCents?: number;
        hybridPercent?: number;
        effectiveDate: string;
        notes?: string;
      };
    }) => payStructuresApi.upsert(driverId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.payStructures.root });
      qc.invalidateQueries({ queryKey: ['settlements'] });
      showSuccess('Pay structure saved');
    },
    onError: (error: Error) => {
      showError('Failed to save pay structure', extractErrorMessage(error));
    },
  });
}
