import { api } from '../../lib/api-client';

// --- Types ---

export interface WebhookEventCategory {
  label: string;
  events: { name: string; label: string; description: string }[];
}

export interface WebhookSubscription {
  id: string;
  tenantId: string;
  url: string;
  events: string[];
  active: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { deliveryLogs: number };
}

export interface WebhookCreatedResponse extends WebhookSubscription {
  signingSecret: string;
}

export interface WebhookListResponse {
  subscriptions: WebhookSubscription[];
  total: number;
}

export interface WebhookDeliveryLog {
  id: string;
  subscriptionId: string;
  event: string;
  payload: unknown;
  responseStatus: number | null;
  responseBody: string | null;
  attempts: number;
  deliveredAt: string | null;
  failedAt: string | null;
  createdAt: string;
}

export interface WebhookLogsResponse {
  logs: WebhookDeliveryLog[];
  total: number;
}

export interface CreateWebhookRequest {
  url: string;
  events: string[];
  description?: string;
}

export interface UpdateWebhookRequest {
  url?: string;
  events?: string[];
  active?: boolean;
  description?: string;
}

// --- API Functions ---

export async function listWebhooks(limit = 20, offset = 0): Promise<WebhookListResponse> {
  return api.get<WebhookListResponse>(`/webhooks?limit=${limit}&offset=${offset}`);
}

export async function createWebhook(data: CreateWebhookRequest): Promise<WebhookCreatedResponse> {
  return api.post<WebhookCreatedResponse>('/webhooks', data);
}

export async function updateWebhook(id: string, data: UpdateWebhookRequest): Promise<WebhookSubscription> {
  return api.patch<WebhookSubscription>(`/webhooks/${id}`, data);
}

export async function deleteWebhook(id: string): Promise<void> {
  return api.delete<void>(`/webhooks/${id}`);
}

export async function getWebhookLogs(id: string, limit = 20, offset = 0): Promise<WebhookLogsResponse> {
  return api.get<WebhookLogsResponse>(`/webhooks/${id}/logs?limit=${limit}&offset=${offset}`);
}

export async function testWebhook(id: string): Promise<{ message: string }> {
  return api.post<{ message: string }>(`/webhooks/${id}/test`);
}

export async function fetchEventCatalog(): Promise<{ categories: WebhookEventCategory[] }> {
  return api.get<{ categories: WebhookEventCategory[] }>('/webhooks/events');
}

export async function retryDelivery(subscriptionId: string, logId: string): Promise<void> {
  return api.post<void>(`/webhooks/${subscriptionId}/logs/${logId}/retry`);
}
