import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTourStatus, updateTourStatus } from '../api';
import { useTourStore } from '../store';
import { showError } from '@sally/ui';
import { queryKeys } from '@/shared/constants';
import { useEffect } from 'react';
import type { TourStatus } from '../types';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useTourStatus() {
  const { setTourStatus, setLoading } = useTourStore();

  const query = useQuery({
    queryKey: queryKeys.preferences.user,
    queryFn: getTourStatus,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (query.data) {
      setTourStatus((query.data.platformTourStatus as TourStatus) ?? null);
      setLoading(false);
    }
    if (query.error) {
      setLoading(false);
    }
  }, [query.data, query.error, setTourStatus, setLoading]);

  return query;
}

export function useUpdateTourStatus() {
  const queryClient = useQueryClient();
  const { setTourStatus } = useTourStore();

  return useMutation({
    mutationFn: (status: 'dismissed' | 'completed') => updateTourStatus(status),
    onSuccess: (_, status) => {
      setTourStatus(status);
      queryClient.invalidateQueries({ queryKey: queryKeys.preferences.user });
    },
    onError: (error: Error) => {
      showError('Failed to save tour progress', extractErrorMessage(error));
    },
  });
}
