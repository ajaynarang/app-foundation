import { useQuery } from '@tanstack/react-query';
import { feedbackApi } from '../api';
import { FEEDBACK_KEYS } from './use-admin-feedback';

export function useFeedbackStats() {
  return useQuery({
    queryKey: FEEDBACK_KEYS.stats,
    queryFn: feedbackApi.getStats,
  });
}
