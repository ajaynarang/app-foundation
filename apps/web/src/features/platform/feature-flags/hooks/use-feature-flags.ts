import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { featureFlagsApi } from '../api';
import { showSuccess, showError } from '@app/ui';
import { queryKeys } from '@/shared/constants';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useFeatureFlags() {
  return useQuery({
    queryKey: queryKeys.featureFlags.root,
    queryFn: () => featureFlagsApi.list(),
  });
}

export function useFeatureFlag(key: string) {
  return useQuery({
    queryKey: queryKeys.featureFlags.detail(key),
    queryFn: () => featureFlagsApi.getByKey(key),
    enabled: !!key,
  });
}

export function useFeatureFlagEnabled(key: string) {
  return useQuery({
    queryKey: queryKeys.featureFlags.enabled(key),
    queryFn: () => featureFlagsApi.isEnabled(key),
    enabled: !!key,
  });
}

export function useUpdateFeatureFlag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) => featureFlagsApi.update(key, enabled),
    onMutate: async ({ key, enabled }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.featureFlags.root });
      const previousQueries = queryClient.getQueriesData({ queryKey: queryKeys.featureFlags.root });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      queryClient.setQueriesData({ queryKey: queryKeys.featureFlags.root }, (old: any) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        old?.map?.((item: any) => (item.key === key ? { ...item, enabled } : item)),
      );
      return { previousQueries };
    },
    onSuccess: () => {
      showSuccess('Feature flag updated');
    },
    onError: (error: Error, _variables, context) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      context?.previousQueries?.forEach(([key, data]: [any, any]) => {
        queryClient.setQueryData(key, data);
      });
      showError('Failed to update feature flag', extractErrorMessage(error));
    },
    onSettled: (_, __, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.featureFlags.root });
      queryClient.invalidateQueries({ queryKey: queryKeys.featureFlags.detail(variables.key) });
    },
  });
}
