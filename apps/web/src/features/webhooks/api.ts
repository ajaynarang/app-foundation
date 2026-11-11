import { apiClient } from '@appshore/web-core/shared/lib/api';

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
  /** Set while a rotated-out secret still signs deliveries alongside the current one. */
  previousSecretExpiresAt?: string | null;
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
  return apiClient<WebhookListResponse>(`/webhooks?limit=${limit}&offset=${offset}`);
}

export async function createWebhook(data: CreateWebhookRequest): Promise<WebhookCreatedResponse> {
  return apiClient<WebhookCreatedResponse>('/webhooks', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateWebhook(id: string, data: UpdateWebhookRequest): Promise<WebhookSubscription> {
  return apiClient<WebhookSubscription>(`/webhooks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteWebhook(id: string): Promise<void> {
  return apiClient<void>(`/webhooks/${id}`, {
    method: 'DELETE',
  });
}

export async function getWebhookLogs(
  id: string,
  opts: {
    limit?: number;
    offset?: number;
    dateFrom?: string;
    dateTo?: string;
  } = {},
): Promise<WebhookLogsResponse> {
  const qs = new URLSearchParams({
    limit: String(opts.limit ?? 20),
    offset: String(opts.offset ?? 0),
    ...(opts.dateFrom ? { date_from: opts.dateFrom } : {}),
    ...(opts.dateTo ? { date_to: opts.dateTo } : {}),
  });
  return apiClient<WebhookLogsResponse>(`/webhooks/${id}/logs?${qs.toString()}`);
}

/** 202: the queued test delivery, to follow in the log. */
export async function testWebhook(id: string): Promise<WebhookDeliveryLog> {
  return apiClient<WebhookDeliveryLog>(`/webhooks/${id}/test`, {
    method: 'POST',
  });
}

/** A new signing secret, shown once; the old one keeps signing for `overlapHours`. */
export async function rotateWebhookSecret(id: string, overlapHours: number): Promise<WebhookCreatedResponse> {
  return apiClient<WebhookCreatedResponse>(`/webhooks/${id}/rotate-secret`, {
    method: 'POST',
    body: JSON.stringify({ overlapHours }),
  });
}

export async function fetchEventCatalog(): Promise<{
  categories: WebhookEventCategory[];
}> {
  return apiClient<{ categories: WebhookEventCategory[] }>('/webhooks/events');
}

/** 202: the delivery as it is now, pending again. */
export async function retryDelivery(subscriptionId: string, logId: string): Promise<WebhookDeliveryLog> {
  return apiClient<WebhookDeliveryLog>(`/webhooks/${subscriptionId}/logs/${logId}/retry`, {
    method: 'POST',
  });
}
