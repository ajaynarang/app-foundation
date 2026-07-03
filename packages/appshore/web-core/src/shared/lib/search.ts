import { apiClient } from './api';

// ---------------------------------------------------------------------------
// Entity Search API — shared by the ⌘K command palette and the AI chat
// @-mention picker.
//
// Backed by the backend's `GET /search?q=...&limit=...` endpoint
// (apps/backend/src/platform-glue/search/). The starter ships no search
// providers, so the endpoint returns `{ results: [] }` until you register
// domain searchers under the SEARCH_PROVIDERS token — see
// `SearchModule.register()` in the backend.
// ---------------------------------------------------------------------------

export const ENTITY_SEARCH_ENABLED = true;

export interface SearchApiResult {
  type: string;
  id: string;
  label: string;
  description: string;
  href: string;
  referenceNumber?: string;
}

export async function searchEntities(query: string): Promise<SearchApiResult[]> {
  if (!ENTITY_SEARCH_ENABLED) return [];
  if (!query || query.length < 2) return [];
  const response = await apiClient<{ results: SearchApiResult[] }>(`/search?q=${encodeURIComponent(query)}&limit=8`);
  return response?.results ?? [];
}
