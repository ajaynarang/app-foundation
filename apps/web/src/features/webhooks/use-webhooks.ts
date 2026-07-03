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
import { queryKeys } from '@appshore/web-core/shared/constants';
import { extractErrorMessage } from '@appshore/web-core/shared/lib/error-utils';

const webhookLogsKey = (id: string) => ['webhooks', id, 'logs'] as const;

export function useWebhooks() {
  return useQuery({
    queryKey: queryKeys.webhooks.root,
    queryFn: () => listWebhooks(100, 0),
  });
}

export function useCreateWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateWebhookRequest) => createWebhook(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.root });
      showSuccess('Webhook created');
    },
    onError: (err: Error) => {
      showError('Failed to create webhook', extractErrorMessage(err));
    },
  });
}

export function useUpdateWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateWebhookRequest }) => updateWebhook(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.root });
      showSuccess('Webhook updated');
    },
    onError: (err: Error) => {
      showError('Failed to update webhook', extractErrorMessage(err));
    },
  });
}

export function useDeleteWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteWebhook(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.root });
      showSuccess('Webhook deleted');
    },
    onError: (err: Error) => {
      showError('Failed to delete webhook', extractErrorMessage(err));
    },
  });
}

export function useWebhookLogs(
  id: string,
  opts: {
    limit?: number;
    offset?: number;
    dateFrom?: string;
    dateTo?: string;
  } = {},
) {
  return useQuery({
    queryKey: [...webhookLogsKey(id), opts],
    queryFn: () => getWebhookLogs(id, opts),
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
      showError('Failed to send test event', extractErrorMessage(err));
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
      queryClient.invalidateQueries({
        queryKey: ['webhooks', subscriptionId, 'logs'],
      });
      showSuccess('Delivery retry queued');
    },
    onError: (err: Error) => {
      showError('Failed to retry delivery', extractErrorMessage(err));
    },
  });
}

export type { WebhookSubscription, WebhookCreatedResponse, WebhookDeliveryLog };
