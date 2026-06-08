import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError } from '@app/ui';
import { factoringApi } from './api';

const FACTORING_COMPANIES_KEY = ['factoring-companies'] as const;
const INVOICES_KEY = ['invoices'] as const;

export function useFactoringCompanies() {
  return useQuery({
    queryKey: [...FACTORING_COMPANIES_KEY],
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
      isDefault?: boolean;
    }) => factoringApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: FACTORING_COMPANIES_KEY });
      qc.invalidateQueries({ queryKey: INVOICES_KEY });
      showSuccess('Factoring company created');
    },
    onError: (error: Error) => {
      showError('Failed to create factoring company', error.message);
    },
  });
}

export function useUpdateFactoringCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ companyId, data }: { companyId: string; data: Record<string, unknown> }) =>
      factoringApi.update(companyId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: FACTORING_COMPANIES_KEY });
      qc.invalidateQueries({ queryKey: INVOICES_KEY });
      showSuccess('Factoring company updated');
    },
    onError: (error: Error) => {
      showError('Failed to update factoring company', error.message);
    },
  });
}

export function useDeleteFactoringCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (companyId: string) => factoringApi.delete(companyId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: FACTORING_COMPANIES_KEY });
      qc.invalidateQueries({ queryKey: INVOICES_KEY });
      showSuccess('Factoring company deleted');
    },
    onError: (error: Error) => {
      showError('Failed to delete factoring company', error.message);
    },
  });
}
