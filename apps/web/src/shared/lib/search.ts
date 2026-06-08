import { apiClient } from '@/shared/lib/api';

// ---------------------------------------------------------------------------
// Entity Search API — shared across home page search and other consumers
// ---------------------------------------------------------------------------

export interface SearchApiResult {
  type: string;
  id: string;
  label: string;
  description: string;
  href: string;
  referenceNumber?: string;
}

export async function searchEntities(query: string): Promise<SearchApiResult[]> {
  if (!query || query.length < 2) return [];
  return apiClient<SearchApiResult[]>(`/search?q=${encodeURIComponent(query)}&limit=8`);
}
