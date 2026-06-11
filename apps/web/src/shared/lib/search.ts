import { apiClient } from '@/shared/lib/api';

// ---------------------------------------------------------------------------
// Entity Search API — shared by the ⌘K command palette and the AI chat
// @-mention picker.
//
// EXTENSION POINT: the starter backend ships no `GET /search` endpoint.
// Implement a tenant-scoped `GET /search?q=...&limit=...` returning
// `SearchApiResult[]` for your domain entities, then flip
// ENTITY_SEARCH_ENABLED to true. Until then, searchEntities resolves to an
// empty list so consumers don't fire a 404 on every keystroke.
// ---------------------------------------------------------------------------

export const ENTITY_SEARCH_ENABLED = false;

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
  return apiClient<SearchApiResult[]>(`/search?q=${encodeURIComponent(query)}&limit=8`);
}
