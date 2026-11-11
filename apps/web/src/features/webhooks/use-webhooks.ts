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
  rotateWebhookSecret,
  type CreateWebhookRequest,
  type UpdateWebhookRequest,
  type WebhookSubscription,
  type WebhookCreatedResponse,
  type WebhookDeliveryLog,
} from './api';
import { showSuccess, showError } from '@app/ui';
import { queryKeys } from '@appshore/web-core/shared/constants';
import { extractErrorMessage } from '@appshore/web-core/shared/lib/error-utils';
import { useCursorList } from '@appshore/web-core/shared/list';

const webhookLogsKey = (id: string) => ['webhooks', id, 'logs'] as const;

/** The workspace's webhook endpoints, newest first: a cursor list ("Load more"). */
export function useWebhooks() {
  return useCursorList({
    queryKey: [...queryKeys.webhooks.root, 'list'],
    queryFn: (cursor) => listWebhooks({ cursor }),
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

/** One endpoint's delivery log, newest first: a cursor list ("Load more"). A changed date range is a new list. */
export function useWebhookLogs(id: string, opts: { limit?: number; dateFrom?: string; dateTo?: string } = {}) {
  return useCursorList({
    queryKey: [...webhookLogsKey(id), opts],
    queryFn: (cursor) => getWebhookLogs(id, { ...opts, cursor }),
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

/** Rotates the signing secret; the caller shows the new one once. */
export function useRotateWebhookSecret() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, overlapHours }: { id: string; overlapHours: number }) => rotateWebhookSecret(id, overlapHours),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.root });
      showSuccess('Signing secret rotated');
    },
    onError: (err: Error) => {
      showError('Failed to rotate the signing secret', extractErrorMessage(err));
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
