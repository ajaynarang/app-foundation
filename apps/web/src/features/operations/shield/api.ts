import { apiClient } from '@/shared/lib/api';
import type {
  ShieldLatestResponse,
  TriggerAuditResponse,
  AuditHistoryResponse,
  ShieldAudit,
  ShieldFinding,
  ShieldCustomRule,
  TriggerAuditParams,
} from './types';

export const shieldApi = {
  getLatest: async (): Promise<ShieldLatestResponse> => {
    return apiClient<ShieldLatestResponse>('/shield');
  },

  getScores: async () => {
    return apiClient('/shield/score');
  },

  triggerAudit: async (params: TriggerAuditParams): Promise<TriggerAuditResponse> => {
    return apiClient<TriggerAuditResponse>('/shield/audit', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  cancelAudit: async (auditId: string): Promise<{ cancelled: boolean; auditId: string }> => {
    return apiClient<{ cancelled: boolean; auditId: string }>(`/shield/audit/${auditId}/cancel`, {
      method: 'POST',
    });
  },

  getAuditHistory: async (
    limit = 20,
    offset = 0,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<AuditHistoryResponse> => {
    const params = new URLSearchParams();
    params.set('limit', limit.toString());
    params.set('offset', offset.toString());
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    return apiClient<AuditHistoryResponse>(`/shield/audits?${params.toString()}`);
  },

  getAuditById: async (auditId: string): Promise<ShieldAudit> => {
    return apiClient<ShieldAudit>(`/shield/audits/${auditId}`);
  },

  getFindings: async (filters?: {
    category?: string;
    severity?: string;
    resolved?: boolean;
  }): Promise<ShieldFinding[]> => {
    const params = new URLSearchParams();
    if (filters?.category) params.append('category', filters.category);
    if (filters?.severity) params.append('severity', filters.severity);
    if (filters?.resolved != null) params.append('resolved', String(filters.resolved));
    const query = params.toString();
    return apiClient<ShieldFinding[]>(`/shield/findings${query ? `?${query}` : ''}`);
  },

  resolveFinding: async (findingId: string): Promise<ShieldFinding> => {
    return apiClient<ShieldFinding>(`/shield/findings/${findingId}/resolve`, { method: 'PATCH' });
  },

  bulkResolveFindings: async (findingIds: string[]): Promise<{ resolved: number }> => {
    return apiClient<{ resolved: number }>('/shield/findings/bulk-resolve', {
      method: 'PATCH',
      body: JSON.stringify({ findingIds }),
    });
  },

  exportAuditPdf: (auditId: string): string => {
    return `/api/v1/shield/audits/${auditId}/export`;
  },

  // Custom Rules
  getCustomRules: async (): Promise<ShieldCustomRule[]> => {
    return apiClient<ShieldCustomRule[]>('/shield/rules');
  },

  createCustomRule: async (rule: string): Promise<ShieldCustomRule> => {
    return apiClient<ShieldCustomRule>('/shield/rules', {
      method: 'POST',
      body: JSON.stringify({ rule }),
    });
  },

  updateCustomRule: async (ruleId: string, data: { rule?: string; isActive?: boolean }): Promise<ShieldCustomRule> => {
    return apiClient<ShieldCustomRule>(`/shield/rules/${ruleId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteCustomRule: async (ruleId: string): Promise<void> => {
    return apiClient(`/shield/rules/${ruleId}`, { method: 'DELETE' });
  },
};
