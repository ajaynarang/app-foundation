import { apiClient } from '../../lib/api-client';

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

export interface FactoringCompanyRecord {
  id: number;
  companyId: string;
  companyName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  remittanceAddress: string | null;
  isDefault: boolean;
}

export const factoringApi = {
  list: () => apiClient<FactoringCompanyRecord[]>('/invoices/factoring-companies'),
  create: (data: Record<string, unknown>) =>
    apiClient<FactoringCompanyRecord>('/invoices/factoring-companies', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (companyId: string, data: Record<string, unknown>) =>
    apiClient<FactoringCompanyRecord>(`/invoices/factoring-companies/${companyId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (companyId: string) =>
    apiClient<void>(`/invoices/factoring-companies/${companyId}`, {
      method: 'DELETE',
    }),
};
