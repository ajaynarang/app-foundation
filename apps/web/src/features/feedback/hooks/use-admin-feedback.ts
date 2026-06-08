import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FeedbackStatusEnum } from '@sally/shared-types';
import { showSuccess, showError } from '@/shared/lib/toast';
import { feedbackApi } from '../api';
import { queryKeys } from '@/shared/constants';
import { extractErrorMessage } from '@/shared/lib/error-utils';

const FEEDBACK_KEYS = {
  all: queryKeys.admin.feedback,
  list: (params?: Record<string, string>) => [...queryKeys.admin.feedback, 'list', params] as const,
  detail: (id: number) => [...queryKeys.admin.feedback, 'detail', id] as const,
  stats: [...queryKeys.admin.feedback, 'stats'] as const,
  tenants: [...queryKeys.admin.feedback, 'tenants'] as const,
};

export { FEEDBACK_KEYS };

export function useAdminFeedback(params?: Record<string, string>) {
  return useQuery({
    queryKey: FEEDBACK_KEYS.list(params),
    queryFn: () => feedbackApi.listAll(params),
  });
}

export function useResolveFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: number; note: string }) => feedbackApi.resolve(id, { note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: FEEDBACK_KEYS.all });
      showSuccess('Feedback resolved');
    },
    onError: (err: Error) => showError('Failed to resolve', extractErrorMessage(err)),
  });
}

export function useMarkReviewed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => feedbackApi.updateStatus(id, { status: FeedbackStatusEnum.enum.REVIEWED }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: FEEDBACK_KEYS.all });
      showSuccess('Marked as reviewed');
    },
    onError: (err: Error) => showError('Failed to update', extractErrorMessage(err)),
  });
}

export function useCategorizeFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => feedbackApi.categorize(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: FEEDBACK_KEYS.all });
      showSuccess('Category updated by AI');
    },
    onError: (err: Error) => showError('Failed to categorize', extractErrorMessage(err)),
  });
}

export function useBulkCategorize() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => feedbackApi.bulkCategorize(),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: FEEDBACK_KEYS.all });
      showSuccess(`Categorized ${data.categorized} of ${data.total} items`);
    },
    onError: (err: Error) => showError('Failed to bulk categorize', extractErrorMessage(err)),
  });
}

export function useFeedbackTenants() {
  return useQuery({
    queryKey: FEEDBACK_KEYS.tenants,
    queryFn: feedbackApi.getTenants,
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, category }: { id: number; category: 'bug' | 'idea' | 'general' }) =>
      feedbackApi.updateCategory(id, { category }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: FEEDBACK_KEYS.all });
      showSuccess('Category updated');
    },
    onError: (err: Error) => showError('Failed to update category', extractErrorMessage(err)),
  });
}
