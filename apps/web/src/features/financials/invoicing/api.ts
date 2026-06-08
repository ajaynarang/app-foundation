import { apiClient } from '@/shared/lib/api';
import type { BundleFormat, TenantSettingsResponse } from '@sally/shared-types';

export interface InvoiceSettings {
  companyLegalName: string | null;
  logoUrl: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  mcNumber: string | null;
  dotNumber: string | null;
  defaultPaymentTermsDays: number;
  remittanceInstructions: string | null;
  acceptedPaymentMethods: string | null;
  defaultNotes: string | null;
  termsAndConditions: string | null;
  invoicePrefix: string;
  replyToEmail: string | null;
  emailSubjectTemplate: string | null;
  emailBodyTemplate: string | null;
}

export const invoiceSettingsApi = {
  get: (): Promise<InvoiceSettings> => apiClient<InvoiceSettings>('/invoices/settings'),
  update: (data: Partial<InvoiceSettings>): Promise<InvoiceSettings> =>
    apiClient<InvoiceSettings>('/invoices/settings', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
};

export interface FactoringCompanyPayload {
  companyName: string;
  contactEmail?: string;
  contactPhone?: string;
  remittanceAddress?: string;
  submissionEmail?: string;
  advanceRatePct?: number;
  feeRatePct?: number;
  recourseType?: string;
}

export const tenantFactoringDefaultApi = {
  /**
   * Reads the combined tenant settings payload (pinned factor + bundle
   * format). The endpoint name preserves the Phase 1 contract — both the
   * factoring-default chip and the bundle-format toggle read from this
   * single cache key, so the UI stays consistent with one round-trip.
   */
  get: () => apiClient<TenantSettingsResponse>('/tenants/me/settings'),
  set: (factoringCompanyId: number | null) =>
    apiClient<{ factoringCompanyId: number | null }>('/tenants/me/factoring-default', {
      method: 'PATCH',
      body: JSON.stringify({ factoringCompanyId }),
    }),
};

export const tenantBundleFormatApi = {
  set: (format: BundleFormat) =>
    apiClient<{ format: BundleFormat }>('/tenants/me/bundle-format', {
      method: 'PATCH',
      body: JSON.stringify({ format }),
    }),
};

export const tenantDriverPayTimingApi = {
  set: (timing: 'ON_DELIVERY' | 'ON_FACTOR_FUND') =>
    apiClient<{ timing: 'ON_DELIVERY' | 'ON_FACTOR_FUND' }>('/tenants/me/driver-pay-timing', {
      method: 'PATCH',
      body: JSON.stringify({ timing }),
    }),
};

export const factoringApi = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  list: () => apiClient<any[]>('/invoices/factoring-companies'),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  create: (data: FactoringCompanyPayload) =>
    apiClient<any>('/invoices/factoring-companies', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update: (companyId: string, data: Partial<FactoringCompanyPayload>) =>
    apiClient<any>(`/invoices/factoring-companies/${companyId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (companyId: string) =>
    apiClient<void>(`/invoices/factoring-companies/${companyId}`, {
      method: 'DELETE',
    }),
};
