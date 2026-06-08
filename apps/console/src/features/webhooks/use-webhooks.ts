import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listWebhooks,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  getWebhookLogs,
  testWebhook,
  fetchEventCatalog,
  retryDelivery,
  type CreateWebhookRequest,
  type UpdateWebhookRequest,
  type WebhookSubscription,
  type WebhookCreatedResponse,
  type WebhookDeliveryLog,
} from './api';
import { showSuccess, showError } from '@app/ui';

const WEBHOOKS_KEY = ['webhooks'] as const;
const webhookLogsKey = (id: string) => ['webhooks', id, 'logs'] as const;

export function useWebhooks() {
  return useQuery({
    queryKey: WEBHOOKS_KEY,
    queryFn: () => listWebhooks(100, 0),
  });
}

export function useCreateWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateWebhookRequest) => createWebhook(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WEBHOOKS_KEY });
      showSuccess('Webhook created');
    },
    onError: (err: Error) => {
      showError('Failed to create webhook', err.message);
    },
  });
}

export function useUpdateWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateWebhookRequest }) => updateWebhook(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WEBHOOKS_KEY });
      showSuccess('Webhook updated');
    },
    onError: (err: Error) => {
      showError('Failed to update webhook', err.message);
    },
  });
}

export function useDeleteWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteWebhook(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WEBHOOKS_KEY });
      showSuccess('Webhook deleted');
    },
    onError: (err: Error) => {
      showError('Failed to delete webhook', err.message);
    },
  });
}

export function useWebhookLogs(id: string, limit = 20, offset = 0) {
  return useQuery({
    queryKey: [...webhookLogsKey(id), { limit, offset }],
    queryFn: () => getWebhookLogs(id, limit, offset),
    enabled: !!id,
  });
}

export function useTestWebhook() {
  return useMutation({
    mutationFn: (id: string) => testWebhook(id),
    onSuccess: () => {
      showSuccess('Test event queued for delivery');
    },
    onError: (err: Error) => {
      showError('Failed to send test event', err.message);
    },
  });
}

export function useEventCatalog() {
  return useQuery({
    queryKey: ['webhook-event-catalog'],
    queryFn: fetchEventCatalog,
    staleTime: 5 * 60 * 1000,
  });
}

export function useRetryDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ subscriptionId, logId }: { subscriptionId: string; logId: string }) =>
      retryDelivery(subscriptionId, logId),
    onSuccess: (_, { subscriptionId }) => {
      queryClient.invalidateQueries({ queryKey: ['webhooks', subscriptionId, 'logs'] });
      showSuccess('Delivery retry queued');
    },
    onError: (err: Error) => {
      showError('Failed to retry delivery', err.message);
    },
  });
}

export type { WebhookSubscription, WebhookCreatedResponse, WebhookDeliveryLog };
