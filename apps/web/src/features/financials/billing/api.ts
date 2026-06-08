import { apiClient } from '@/shared/lib/api';
import { useAuthStore } from '@/features/auth';
import type {
  DocBundleInfo,
  FactoringSummary,
  FactoringTransaction,
  RecordFactoringTransactionInput,
} from '@sally/shared-types';
import type { Invoice, InvoiceSummary, InvoicePayment, EmailPreview, NoaStatus } from './types';

export interface NoaRecord {
  id: number;
  noaId: string;
  customerId: number;
  factoringCompanyId: number;
  status: NoaStatus;
  notes: string | null;
  sentAt: string | null;
  acknowledgedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  customer: { id: number; companyName: string; customerId: string };
  factoringCompany: { id: number; companyId: string; companyName: string };
}

export interface FactoringCompany {
  id: number;
  companyId: string;
  companyName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  remittanceAddress: string | null;
  submissionEmail: string | null;
  advanceRatePct: number | null;
  feeRatePct: number | null;
  recourseType: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/** Build auth headers from the auth store (for raw fetch calls). */
function getAuthHeaders(): Record<string, string> {
  const accessToken = useAuthStore.getState().accessToken;
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

/** Fetch a PDF endpoint with auth, return as Blob. */
async function fetchPdfBlob(path: string): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'GET',
    headers: { ...getAuthHeaders() },
    credentials: 'include',
  });
  if (!response.ok) throw new Error('PDF download failed');
  return response.blob();
}

export const invoicesApi = {
  list: async (params?: {
    status?: string;
    billingPath?: string;
    customerId?: number;
    overdueOnly?: boolean;
    minDaysOverdue?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  }): Promise<Invoice[]> => {
    const qp = new URLSearchParams();
    if (params?.status) qp.set('status', params.status);
    if (params?.billingPath) qp.set('billingPath', params.billingPath);
    if (params?.customerId) qp.set('customerId', String(params.customerId));
    if (params?.overdueOnly) qp.set('overdueOnly', 'true');
    if (params?.minDaysOverdue !== undefined) qp.set('minDaysOverdue', String(params.minDaysOverdue));
    if (params?.search) qp.set('search', params.search);
    if (params?.sortBy) qp.set('sortBy', params.sortBy);
    if (params?.sortOrder) qp.set('sortOrder', params.sortOrder);
    if (params?.dateFrom) qp.set('dateFrom', params.dateFrom);
    if (params?.dateTo) qp.set('dateTo', params.dateTo);
    if (params?.limit) qp.set('limit', String(params.limit));
    if (params?.offset) qp.set('offset', String(params.offset));
    const qs = qp.toString();
    return apiClient<Invoice[]>(qs ? `/invoices/?${qs}` : '/invoices/');
  },

  getById: async (invoiceId: string): Promise<Invoice> => {
    return apiClient<Invoice>(`/invoices/${invoiceId}`);
  },

  generateFromLoad: async (
    loadId: string,
    options?: { paymentTermsDays?: number; notes?: string },
  ): Promise<Invoice> => {
    return apiClient<Invoice>(`/invoices/generate/${loadId}`, {
      method: 'POST',
      body: JSON.stringify(options || {}),
    });
  },

  update: async (
    invoiceId: string,
    data: {
      paymentTermsDays?: number;
      notes?: string;
      internalNotes?: string;
      adjustmentCents?: number;
      lineItems?: Array<{ type: string; description: string; quantity: number; unitPriceCents: number }>;
    },
  ): Promise<Invoice> => {
    return apiClient<Invoice>(`/invoices/${invoiceId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  send: async (invoiceId: string, sendEmail: boolean = false): Promise<Invoice> => {
    return apiClient<Invoice>(`/invoices/${invoiceId}/send`, {
      method: 'POST',
      body: JSON.stringify({ sendEmail }),
    });
  },

  resend: async (invoiceId: string): Promise<Invoice> => {
    return apiClient<Invoice>(`/invoices/${invoiceId}/resend`, { method: 'POST' });
  },

  createShareLink: async (invoiceId: string): Promise<{ url: string; token: string; expiresAt: string }> => {
    return apiClient(`/invoices/${invoiceId}/share`, { method: 'POST' });
  },

  void: async (invoiceId: string): Promise<Invoice> => {
    return apiClient<Invoice>(`/invoices/${invoiceId}/void`, { method: 'POST' });
  },

  reInvoice: async (invoiceId: string): Promise<Invoice> => {
    return apiClient<Invoice>(`/invoices/${invoiceId}/reinvoice`, { method: 'POST' });
  },

  recordPayment: async (
    invoiceId: string,
    data: {
      amountCents: number;
      paymentMethod?: string;
      referenceNumber?: string;
      paymentDate: string;
      notes?: string;
    },
  ): Promise<InvoicePayment> => {
    return apiClient(`/invoices/${invoiceId}/payments`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getSummary: async (): Promise<InvoiceSummary> => {
    return apiClient<InvoiceSummary>('/invoices/summary');
  },

  getPdfUrl: (invoiceId: string) => `/invoices/${invoiceId}/pdf`,

  /** Download a PDF with proper auth and trigger a browser download. */
  downloadPdf: async (invoiceId: string): Promise<void> => {
    const blob = await fetchPdfBlob(`/invoices/${invoiceId}/pdf`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoice-${invoiceId}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /** Get a blob URL for inline PDF preview. */
  getPreviewBlobUrl: async (invoiceId: string): Promise<string> => {
    const blob = await fetchPdfBlob(`/invoices/${invoiceId}/pdf/preview`);
    return URL.createObjectURL(blob);
  },

  getEmailPreview: async (invoiceId: string): Promise<EmailPreview> => {
    return apiClient<EmailPreview>(`/invoices/${invoiceId}/email-preview`);
  },

  // Batch operations
  batchGenerate: async (
    loadIds: string[],
    options?: { paymentTermsDays?: number },
  ): Promise<{
    generated: Invoice[];
    errors: Array<{ loadId: string; error: string }>;
    total: number;
    successCount: number;
  }> => {
    return apiClient('/invoices/batch/generate', {
      method: 'POST',
      body: JSON.stringify({ loadIds, ...options }),
    });
  },

  batchSend: async (invoiceIds: string[], sendEmail?: boolean): Promise<{ sent: number; skipped: number }> => {
    return apiClient('/invoices/batch/send', {
      method: 'POST',
      body: JSON.stringify({ invoiceIds, sendEmail }),
    });
  },

  batchVoid: async (invoiceIds: string[]): Promise<{ voided: number; skipped: number }> => {
    return apiClient('/invoices/batch/void', {
      method: 'POST',
      body: JSON.stringify({ invoiceIds }),
    });
  },

  batchMarkPaid: async (
    invoiceIds: string[],
    data: { paymentDate: string; paymentMethod?: string },
  ): Promise<{ paid: number; skipped: number }> => {
    return apiClient('/invoices/batch/mark-paid', {
      method: 'POST',
      body: JSON.stringify({ invoiceIds, ...data }),
    });
  },

  batchDownload: async (invoiceIds: string[]): Promise<Blob> => {
    const response = await fetch(`${API_BASE_URL}/invoices/batch/download`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      credentials: 'include',
      body: JSON.stringify({ invoiceIds }),
    });
    if (!response.ok) throw new Error('Download failed');
    return response.blob();
  },

  // Submit to factor (single unified flow — Phase 4)
  submitToFactor: async (
    invoiceId: string,
    data: { factoringCompanyId: string; factoringReference?: string; sendEmail?: boolean },
  ): Promise<Invoice> => {
    return apiClient<Invoice>(`/invoices/${invoiceId}/submit-to-factor`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  batchSubmitToFactor: async (
    invoiceIds: string[],
    data: { factoringCompanyId: string; factoringReference?: string; sendEmail?: boolean },
  ): Promise<{ submitted: number; skipped: number }> => {
    return apiClient('/invoices/batch/submit-to-factor', {
      method: 'POST',
      body: JSON.stringify({ invoiceIds, ...data }),
    });
  },

  // Doc bundle
  getDocBundleInfo: async (invoiceId: string): Promise<DocBundleInfo> => {
    return apiClient(`/invoices/${invoiceId}/doc-bundle`);
  },

  downloadDocBundle: async (invoiceId: string): Promise<void> => {
    const blob = await fetchPdfBlob(`/invoices/${invoiceId}/doc-bundle/download`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `doc-bundle-${invoiceId}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * Open the merged factor bundle inline in a new tab. Streams from the
   * backend's bundle-preview endpoint; auth is via the same JWT that
   * `apiClient` uses, so we have to build a blob URL rather than a plain
   * <a href> (cookies aren't always set on the API origin).
   *
   * Throws when the popup is blocked so the caller can show a toast.
   */
  previewDocBundle: async (invoiceId: string): Promise<void> => {
    const blob = await fetchPdfBlob(`/invoices/${invoiceId}/bundle-preview`);
    const url = URL.createObjectURL(blob);
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) {
      URL.revokeObjectURL(url);
      throw new Error('Popup blocked. Allow popups for this site to preview the bundle.');
    }
    // Revoke after the new tab has had time to capture the blob.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },

  // NOA Records
  listNoaRecords: async (params?: { customerId?: number }): Promise<NoaRecord[]> => {
    const qp = new URLSearchParams();
    if (params?.customerId) qp.set('customerId', String(params.customerId));
    const qs = qp.toString();
    return apiClient(qs ? `/invoices/noa-records?${qs}` : '/invoices/noa-records');
  },

  createNoaRecord: async (data: {
    customerId: number;
    factoringCompanyId: number;
    notes?: string;
  }): Promise<NoaRecord> => {
    return apiClient('/invoices/noa-records', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateNoaStatus: async (noaId: string, data: { status: string; rejectionReason?: string }): Promise<NoaRecord> => {
    return apiClient(`/invoices/noa-records/${noaId}/status`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteNoaRecord: async (noaId: string): Promise<void> => {
    return apiClient(`/invoices/noa-records/${noaId}`, { method: 'DELETE' });
  },

  // Phase 3 NOA endpoints

  getNoaStatusForInvoice: async (
    invoiceId: string,
  ): Promise<{
    noa: { id: number; noaId: string; status: string; sentAt: string | null; acknowledgedAt: string | null } | null;
    customer: { id: number; companyName: string; customerId: string };
    factoringCompanyId: number | null;
  }> => {
    return apiClient(`/invoices/${invoiceId}/noa-status`);
  },

  sendNoaEmail: async (noaId: string): Promise<{ sent: boolean; to: string }> => {
    return apiClient(`/invoices/noa-records/${noaId}/send`, { method: 'POST' });
  },

  listNoaInbox: async (filters?: {
    status?: string;
    factorId?: number;
    customerId?: number;
    ageBucket?: 'all' | 'pending_gt_14' | 'rejected';
    limit?: number;
    offset?: number;
  }): Promise<{
    items: Array<{
      id: number;
      noaId: string;
      customerId: number;
      customerName: string;
      factoringCompanyId: number;
      factoringCompanyName: string;
      status: string;
      sentAt: string | null;
      acknowledgedAt: string | null;
      rejectedAt: string | null;
      rejectionReason: string | null;
      ageDays: number;
      createdAt: string;
      updatedAt: string;
    }>;
    total: number;
  }> => {
    const qp = new URLSearchParams();
    if (filters?.status) qp.set('status', filters.status);
    if (filters?.factorId) qp.set('factorId', String(filters.factorId));
    if (filters?.customerId) qp.set('customerId', String(filters.customerId));
    if (filters?.ageBucket) qp.set('ageBucket', filters.ageBucket);
    if (filters?.limit !== undefined) qp.set('limit', String(filters.limit));
    if (filters?.offset !== undefined) qp.set('offset', String(filters.offset));
    const qs = qp.toString();
    return apiClient(qs ? `/invoices/noa-records/inbox?${qs}` : '/invoices/noa-records/inbox');
  },

  bulkCreateNoaForFactorChange: async (
    newFactoringCompanyId: number,
  ): Promise<{ created: number; skipped: number; customerIds: number[] }> => {
    return apiClient('/invoices/noa-records/bulk-for-factor-change', {
      method: 'POST',
      body: JSON.stringify({ newFactoringCompanyId }),
    });
  },

  listFactoringCompanies: async (): Promise<FactoringCompany[]> => {
    return apiClient('/invoices/factoring-companies');
  },

  createFactoringCompany: async (data: {
    companyName: string;
    contactEmail?: string;
    contactPhone?: string;
    remittanceAddress?: string;
    submissionEmail?: string;
    advanceRatePct?: number;
    feeRatePct?: number;
    recourseType?: string;
    isDefault?: boolean;
  }): Promise<FactoringCompany> => {
    return apiClient('/invoices/factoring-companies', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateFactoringCompany: async (companyId: string, data: Record<string, unknown>): Promise<FactoringCompany> => {
    return apiClient(`/invoices/factoring-companies/${companyId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteFactoringCompany: async (companyId: string): Promise<void> => {
    return apiClient(`/invoices/factoring-companies/${companyId}`, { method: 'DELETE' });
  },

  // Customer payment intelligence
  getCustomerPaymentStats: async (
    customerId: string,
  ): Promise<{
    hasHistory: boolean;
    avgDaysToPay?: number;
    reliability?: string;
    reliabilityLabel?: string;
    totalInvoicesPaid?: number;
    outstandingCents?: number;
    outstandingCount?: number;
  }> => {
    return apiClient(`/invoices/customers/${customerId}/payment-stats`);
  },

  // Factoring transactions (Phase 4)
  listFactoringTransactions: (invoiceId: string): Promise<FactoringTransaction[]> =>
    apiClient<FactoringTransaction[]>(`/invoices/${invoiceId}/factoring-transactions`),

  recordFactoringTransaction: (
    invoiceId: string,
    body: RecordFactoringTransactionInput,
  ): Promise<{
    transaction?: FactoringTransaction;
    advance?: FactoringTransaction;
    fee?: FactoringTransaction | null;
  }> =>
    apiClient(`/invoices/${invoiceId}/factoring-transactions`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  deleteFactoringTransaction: (transactionId: string): Promise<{ deleted: boolean; transactionId: string }> =>
    apiClient(`/invoices/factoring-transactions/${transactionId}`, { method: 'DELETE' }),

  factoringSummary: (params?: { from?: string; to?: string }): Promise<FactoringSummary> => {
    const qs =
      params && (params.from || params.to)
        ? `?${new URLSearchParams(params as Record<string, string>).toString()}`
        : '';
    return apiClient<FactoringSummary>(`/invoices/factoring-transactions/summary${qs}`);
  },

  factoringBackfillStatus: (): Promise<{ estimatedTransactionCount: number }> =>
    apiClient(`/invoices/factoring-transactions/backfill-status`),
};
