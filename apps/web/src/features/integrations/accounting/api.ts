import { apiClient } from '@/shared/lib/api';
import type { AccountingStatus, EntityMapping, ExternalEntity, AccountMapping, SyncJobResponse } from './types';

export const accountingApi = {
  getStatus: async (): Promise<AccountingStatus> => {
    return apiClient<AccountingStatus>('/accounting/status');
  },

  syncInvoice: async (invoiceId: string): Promise<SyncJobResponse> => {
    return apiClient<SyncJobResponse>(`/accounting/sync/invoice/${invoiceId}`, { method: 'POST' });
  },

  syncSettlement: async (settlementId: string): Promise<SyncJobResponse> => {
    return apiClient<SyncJobResponse>(`/accounting/sync/settlement/${settlementId}`, { method: 'POST' });
  },

  // Path param not query param: /accounting/mappings/:entityType
  getEntityMappings: async (entityType: 'customer' | 'vendor' | 'class'): Promise<EntityMapping[]> => {
    return apiClient<EntityMapping[]>(`/accounting/mappings/${entityType}`);
  },

  getExternalEntities: async (entityType: 'customer' | 'vendor' | 'class'): Promise<ExternalEntity[]> => {
    return apiClient<ExternalEntity[]>(`/accounting/external-entities/${entityType}`);
  },

  updateEntityMapping: async (
    mappingId: number,
    data: { externalId: string; externalName: string },
  ): Promise<EntityMapping> => {
    return apiClient<EntityMapping>(`/accounting/mappings/${mappingId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  confirmEntityMapping: async (mappingId: number): Promise<EntityMapping> => {
    return apiClient<EntityMapping>(`/accounting/mappings/${mappingId}/confirm`, {
      method: 'POST',
    });
  },

  // /accounting/account-mappings (not /accounting/mappings/accounts)
  getAccountMappings: async (): Promise<AccountMapping[]> => {
    return apiClient<AccountMapping[]>('/accounting/account-mappings');
  },

  updateAccountMapping: async (
    mappingId: number,
    data: { externalAccountId?: string; externalAccountName?: string },
  ): Promise<AccountMapping> => {
    return apiClient<AccountMapping>(`/accounting/account-mappings/${mappingId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  triggerInitialSync: async (): Promise<SyncJobResponse> => {
    return apiClient<SyncJobResponse>('/accounting/setup/initial-sync', { method: 'POST' });
  },
};
