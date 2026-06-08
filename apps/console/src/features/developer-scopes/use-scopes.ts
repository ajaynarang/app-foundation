import { useQuery } from '@tanstack/react-query';
import { listDeveloperScopes } from './api';

const SCOPES_KEY = ['developer-scopes'] as const;

export function useDeveloperScopes() {
  return useQuery({
    queryKey: SCOPES_KEY,
    queryFn: listDeveloperScopes,
    staleTime: 10 * 60 * 1000, // scope map is near-static; refresh every 10m
  });
}
