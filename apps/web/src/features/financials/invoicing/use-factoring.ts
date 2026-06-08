import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError } from '@sally/ui';
import { queryKeys } from '@/shared/constants';
import { factoringApi } from './api';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useFactoringCompanies() {
  return useQuery({
    queryKey: [...queryKeys.factoringCompanies.root],
    queryFn: () => factoringApi.list(),
  });
}

export function useCreateFactoringCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      companyName: string;
      contactEmail?: string;
      contactPhone?: string;
      remittanceAddress?: string;
      submissionEmail?: string;
      advanceRatePct?: number;
      feeRatePct?: number;
      recourseType?: string;
    }) => factoringApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.factoringCompanies.root });
      qc.invalidateQueries({ queryKey: queryKeys.invoices.root });
      showSuccess('Factoring company created');
    },
    onError: (error: Error) => {
      showError('Failed to create factoring company', extractErrorMessage(error));
    },
  });
}

export function useUpdateFactoringCompany() {
  const qc = useQueryClient();
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: ({ companyId, data }: { companyId: string; data: Record<string, any> }) =>
      factoringApi.update(companyId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.factoringCompanies.root });
      qc.invalidateQueries({ queryKey: queryKeys.invoices.root });
      showSuccess('Factoring company updated');
    },
    onError: (error: Error) => {
      showError('Failed to update factoring company', extractErrorMessage(error));
    },
  });
}

export function useDeleteFactoringCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (companyId: string) => factoringApi.delete(companyId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.factoringCompanies.root });
      qc.invalidateQueries({ queryKey: queryKeys.invoices.root });
      showSuccess('Factoring company deleted');
    },
    onError: (error: Error) => {
      showError('Failed to delete factoring company', extractErrorMessage(error));
    },
  });
}
