import { useQuery } from '@tanstack/react-query';
import { alertAnalyticsApi } from '../api-analytics';

export function useAlertVolume(days = 7) {
  return useQuery({
    queryKey: ['alerts', 'analytics', 'volume', days],
    queryFn: () => alertAnalyticsApi.getVolume(days),
  });
}

export function useResponseTimeTrend(days = 7) {
  return useQuery({
    queryKey: ['alerts', 'analytics', 'response-time', days],
    queryFn: () => alertAnalyticsApi.getResponseTime(days),
  });
}

export function useResolutionRates(days = 7) {
  return useQuery({
    queryKey: ['alerts', 'analytics', 'resolution', days],
    queryFn: () => alertAnalyticsApi.getResolution(days),
  });
}

export function useTopAlertTypes(days = 7) {
  return useQuery({
    queryKey: ['alerts', 'analytics', 'top-types', days],
    queryFn: () => alertAnalyticsApi.getTopTypes(days),
  });
}

export function useAlertHistory(params: Record<string, string>) {
  return useQuery({
    queryKey: ['alerts', 'history', params],
    queryFn: () => alertAnalyticsApi.getHistory(params),
  });
}
