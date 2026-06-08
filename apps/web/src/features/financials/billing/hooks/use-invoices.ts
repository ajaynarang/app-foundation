import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError } from '@sally/ui';
import { queryKeys } from '@/shared/constants';
import { invoicesApi } from '../api';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useInvoices(params?: {
  status?: string;
  billingPath?: string;
  customerId?: number;
  overdueOnly?: boolean;
  /** Narrow to invoices past due by at least N days. Powers the AR-aging bucket drill-through. */
  minDaysOverdue?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  return useQuery({
    queryKey: [...queryKeys.invoices.root, params],
    queryFn: () => invoicesApi.list(params),
  });
}

export function useInvoiceSummary() {
  return useQuery({
    queryKey: [...queryKeys.invoices.root, 'summary'],
    queryFn: () => invoicesApi.getSummary(),
  });
}

export function useEmailPreview(invoiceId: string, enabled: boolean = false) {
  return useQuery({
    queryKey: [...queryKeys.invoices.root, invoiceId, 'email-preview'],
    queryFn: () => invoicesApi.getEmailPreview(invoiceId),
    enabled: enabled && !!invoiceId,
    staleTime: 30_000,
  });
}

export function useGenerateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ loadId, options }: { loadId: string; options?: { paymentTermsDays?: number; notes?: string } }) =>
      invoicesApi.generateFromLoad(loadId, options),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.invoices.root });
      // Generating an invoice changes billing_status (APPROVED -> INVOICED) -- refresh close-out tabs/summary
      qc.invalidateQueries({ queryKey: queryKeys.closeOut.root });
      qc.invalidateQueries({ queryKey: queryKeys.loads.root });
      showSuccess('Invoice generated');
    },
    onError: (error: Error) => {
      showError('Failed to generate invoice', extractErrorMessage(error));
    },
  });
}

export function useSendInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ invoiceId, sendEmail }: { invoiceId: string; sendEmail?: boolean }) =>
      invoicesApi.send(invoiceId, sendEmail),
    onMutate: async ({ invoiceId }) => {
      await qc.cancelQueries({ queryKey: queryKeys.invoices.root });
      const previousQueries = qc.getQueriesData({ queryKey: queryKeys.invoices.root });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      qc.setQueriesData({ queryKey: queryKeys.invoices.root }, (old: any) => {
        if (!Array.isArray(old)) return old;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return old.map((inv: any) => (inv.invoiceNumber === invoiceId ? { ...inv, status: 'SENT' as const } : inv));
      });
      return { previousQueries };
    },
    onSuccess: () => {
      showSuccess('Invoice sent');
    },
    onError: (error: Error, _variables, context) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      context?.previousQueries?.forEach(([key, data]: [any, any]) => {
        qc.setQueryData(key, data);
      });
      showError('Failed to send invoice', extractErrorMessage(error));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.invoices.root });
    },
  });
}

export function useResendInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invoiceId: string) => invoicesApi.resend(invoiceId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.invoices.root });
      showSuccess('Invoice resent');
    },
    onError: (error: Error) => {
      showError('Failed to resend invoice', extractErrorMessage(error));
    },
  });
}

export function useCreateShareLink() {
  return useMutation({
    mutationFn: (invoiceId: string) => invoicesApi.createShareLink(invoiceId),
    onError: (error: Error) => {
      showError('Failed to create share link', extractErrorMessage(error));
    },
  });
}

export function useReInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invoiceId: string) => invoicesApi.reInvoice(invoiceId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.invoices.root });
      qc.invalidateQueries({ queryKey: queryKeys.closeOut.root });
      qc.invalidateQueries({ queryKey: queryKeys.loads.root });
      showSuccess('New invoice created');
    },
    onError: (error: Error) => {
      showError('Failed to re-invoice', extractErrorMessage(error));
    },
  });
}

export function useVoidInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invoiceId: string) => invoicesApi.void(invoiceId),
    onMutate: async (invoiceId) => {
      await qc.cancelQueries({ queryKey: queryKeys.invoices.root });
      const previousQueries = qc.getQueriesData({ queryKey: queryKeys.invoices.root });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      qc.setQueriesData({ queryKey: queryKeys.invoices.root }, (old: any) => {
        if (!Array.isArray(old)) return old;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return old.map((inv: any) => (inv.invoiceNumber === invoiceId ? { ...inv, status: 'VOID' as const } : inv));
      });
      return { previousQueries };
    },
    onSuccess: () => {
      showSuccess('Invoice voided');
    },
    onError: (error: Error, _invoiceId, context) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      context?.previousQueries?.forEach(([key, data]: [any, any]) => {
        qc.setQueryData(key, data);
      });
      showError('Failed to void invoice', extractErrorMessage(error));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.invoices.root });
      // Voiding an invoice can revert billing_status -- refresh close-out tabs/summary
      qc.invalidateQueries({ queryKey: queryKeys.closeOut.root });
      qc.invalidateQueries({ queryKey: queryKeys.loads.root });
    },
  });
}

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      invoiceId,
      data,
    }: {
      invoiceId: string;
      data: {
        amountCents: number;
        paymentMethod?: string;
        referenceNumber?: string;
        paymentDate: string;
        notes?: string;
      };
    }) => invoicesApi.recordPayment(invoiceId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.invoices.root });
      showSuccess('Payment recorded');
    },
    onError: (error: Error) => {
      showError('Failed to record payment', extractErrorMessage(error));
    },
  });
}

export function useUpdateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      invoiceId,
      data,
    }: {
      invoiceId: string;
      data: { paymentTermsDays?: number; notes?: string; internalNotes?: string; adjustmentCents?: number };
    }) => invoicesApi.update(invoiceId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.invoices.root });
      showSuccess('Invoice updated');
    },
    onError: (error: Error) => {
      showError('Failed to update invoice', extractErrorMessage(error));
    },
  });
}

// Batch operations

export function useBatchGenerateInvoices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ loadIds, options }: { loadIds: string[]; options?: { paymentTermsDays?: number } }) =>
      invoicesApi.batchGenerate(loadIds, options),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.invoices.root });
      qc.invalidateQueries({ queryKey: queryKeys.closeOut.root });
      qc.invalidateQueries({ queryKey: queryKeys.loads.root });
      showSuccess(`Generated ${data.successCount} of ${data.total} invoices`);
    },
    onError: (error: Error) => {
      showError('Failed to generate invoices', extractErrorMessage(error));
    },
  });
}

export function useBatchSendInvoices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ invoiceIds, sendEmail }: { invoiceIds: string[]; sendEmail?: boolean }) =>
      invoicesApi.batchSend(invoiceIds, sendEmail),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.invoices.root });
      showSuccess(`Sent ${data.sent} invoices`);
    },
    onError: (error: Error) => {
      showError('Failed to send invoices', extractErrorMessage(error));
    },
  });
}

export function useBatchVoidInvoices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invoiceIds: string[]) => invoicesApi.batchVoid(invoiceIds),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.invoices.root });
      qc.invalidateQueries({ queryKey: queryKeys.closeOut.root });
      qc.invalidateQueries({ queryKey: queryKeys.loads.root });
      showSuccess(`Voided ${data.voided} invoices`);
    },
    onError: (error: Error) => {
      showError('Failed to void invoices', extractErrorMessage(error));
    },
  });
}

export function useBatchMarkPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      invoiceIds,
      data,
    }: {
      invoiceIds: string[];
      data: { paymentDate: string; paymentMethod?: string };
    }) => invoicesApi.batchMarkPaid(invoiceIds, data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.invoices.root });
      showSuccess(`Marked ${data.paid} invoices as paid`);
    },
    onError: (error: Error) => {
      showError('Failed to mark invoices as paid', extractErrorMessage(error));
    },
  });
}

// Factoring (legacy)

// Submit to factor (new flow)

export function useSubmitToFactor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      invoiceId,
      data,
    }: {
      invoiceId: string;
      data: { factoringCompanyId: string; factoringReference?: string; sendEmail?: boolean };
    }) => invoicesApi.submitToFactor(invoiceId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.invoices.root });
      showSuccess('Invoice submitted to factor');
    },
    onError: (error: Error) => {
      showError('Failed to submit to factor', extractErrorMessage(error));
    },
  });
}

export function useBatchSubmitToFactor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      invoiceIds,
      data,
    }: {
      invoiceIds: string[];
      data: { factoringCompanyId: string; factoringReference?: string; sendEmail?: boolean };
    }) => invoicesApi.batchSubmitToFactor(invoiceIds, data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.invoices.root });
      showSuccess(`Submitted ${data.submitted} invoices to factor`);
    },
    onError: (error: Error) => {
      showError('Failed to submit invoices to factor', extractErrorMessage(error));
    },
  });
}

export function useFactoringCompanies() {
  return useQuery({
    queryKey: [...queryKeys.factoringCompanies.root],
    queryFn: () => invoicesApi.listFactoringCompanies(),
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
    }) => invoicesApi.createFactoringCompany(data),
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
      invoicesApi.updateFactoringCompany(companyId, data),
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
    mutationFn: (companyId: string) => invoicesApi.deleteFactoringCompany(companyId),
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

// Customer payment intelligence

export function useCustomerPaymentStats(customerId?: string) {
  return useQuery({
    queryKey: [...queryKeys.invoices.root, 'customer-payment-stats', customerId],
    queryFn: () => invoicesApi.getCustomerPaymentStats(customerId!),
    enabled: !!customerId,
  });
}
