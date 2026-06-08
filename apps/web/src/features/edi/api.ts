import { apiClient } from '@/shared/lib/api';
import type { EDITender, EDITradingPartner, EDIAutoAcceptRule, TenderResponseDto } from './types';

export const ediApi = {
  listPendingTenders: () => apiClient<EDITender[]>('/edi/tenders'),

  respondToTender: (loadId: number, data: TenderResponseDto) =>
    apiClient(`/edi/tenders/${loadId}/respond`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  listRules: () => apiClient<EDIAutoAcceptRule[]>('/edi/tenders/rules'),

  createRule: (data: {
    name: string;
    conditions: Record<string, unknown>;
    tradingPartnerId?: number;
    priority?: number;
  }) =>
    apiClient<EDIAutoAcceptRule>('/edi/tenders/rules', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  approveRule: (ruleId: number) => apiClient(`/edi/tenders/rules/${ruleId}/approve`, { method: 'PATCH' }),

  listPartners: () => apiClient<EDITradingPartner[]>('/edi/settings/partners'),

  createPartner: (data: Partial<EDITradingPartner>) =>
    apiClient<EDITradingPartner>('/edi/settings/partners', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updatePartner: (partnerId: number, data: Partial<EDITradingPartner>) =>
    apiClient<EDITradingPartner>(`/edi/settings/partners/${partnerId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  listMessages: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
    return apiClient<{ data: EDITender[]; total: number }>(`/edi/settings/messages${qs}`);
  },
};
