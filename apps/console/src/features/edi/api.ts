import { apiClient } from '../../lib/api-client';
import type {
  EdiPartner,
  EdiAutoAcceptRule,
  EdiMessagesResponse,
  EdiMessageDirection,
  EdiMessageType,
  EdiMessageStatus,
} from './types';

// ---------- Partners ----------

export async function listPartners(): Promise<EdiPartner[]> {
  return apiClient<EdiPartner[]>('/edi/partners', { method: 'GET' });
}

export async function togglePartnerStatus(partnerId: string, isActive: boolean): Promise<EdiPartner> {
  return apiClient<EdiPartner>(`/edi/partners/${partnerId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: isActive ? 'ACTIVE' : 'INACTIVE' }),
  });
}

// ---------- Auto-Accept Rules ----------

export async function listRules(): Promise<EdiAutoAcceptRule[]> {
  return apiClient<EdiAutoAcceptRule[]>('/edi/rules', { method: 'GET' });
}

export async function toggleRuleStatus(ruleId: string, isActive: boolean): Promise<EdiAutoAcceptRule> {
  return apiClient<EdiAutoAcceptRule>(`/edi/rules/${ruleId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: isActive ? 'ACTIVE' : 'INACTIVE' }),
  });
}

export async function approveRule(ruleId: string): Promise<EdiAutoAcceptRule> {
  return apiClient<EdiAutoAcceptRule>(`/edi/rules/${ruleId}/approve`, {
    method: 'POST',
  });
}

export async function dismissRule(ruleId: string): Promise<void> {
  return apiClient<void>(`/edi/rules/${ruleId}/dismiss`, { method: 'POST' });
}

// ---------- Messages ----------

export interface ListMessagesParams {
  direction?: EdiMessageDirection;
  transactionType?: EdiMessageType;
  status?: EdiMessageStatus;
  limit?: number;
  offset?: number;
}

export async function listMessages(params: ListMessagesParams = {}): Promise<EdiMessagesResponse> {
  const searchParams = new URLSearchParams();
  if (params.direction) searchParams.set('direction', params.direction);
  if (params.transactionType) searchParams.set('transactionType', params.transactionType);
  if (params.status) searchParams.set('status', params.status);
  if (params.limit) searchParams.set('limit', String(params.limit));
  if (params.offset) searchParams.set('offset', String(params.offset));

  const qs = searchParams.toString();
  return apiClient<EdiMessagesResponse>(`/edi/messages${qs ? `?${qs}` : ''}`, {
    method: 'GET',
  });
}
