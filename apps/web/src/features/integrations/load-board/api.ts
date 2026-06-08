import { apiClient } from '@/shared/lib/api';
import type { LoadBoardSearchParams, LoadBoardSearchResult, LoadBoardListing, LoadBoardImportResult } from './types';

export async function searchLoadBoard(params: LoadBoardSearchParams): Promise<LoadBoardSearchResult> {
  return apiClient<LoadBoardSearchResult>('/load-board/search', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function getLoadBoardListing(externalId: string, provider: string = 'dat'): Promise<LoadBoardListing> {
  return apiClient<LoadBoardListing>(`/load-board/listings/${encodeURIComponent(externalId)}?provider=${provider}`);
}

export async function getLoadBoardRecommendations(): Promise<
  Array<{
    driver: { id: string; name: string; location: { city: string; state: string } };
    reason: string;
    listings: LoadBoardListing[];
  }>
> {
  return apiClient('/load-board/recommendations');
}

export async function searchLoadBoardNlp(query: string): Promise<LoadBoardSearchResult> {
  return apiClient<LoadBoardSearchResult>('/load-board/search/nlp', {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
}

export async function importLoadBoardListing(
  externalId: string,
  provider: string = 'dat',
): Promise<LoadBoardImportResult> {
  return apiClient<LoadBoardImportResult>('/load-board/import', {
    method: 'POST',
    body: JSON.stringify({ externalId, provider }),
  });
}

// ── Search History ──

export interface SearchHistoryEntry {
  id: string;
  origin: { city: string; state: string } | null;
  destination: { city: string; state: string } | null;
  equipment: string[];
  minRate: number | null;
  searchedAt: string;
  searchCount: number;
  label: string;
}

export interface SearchHistoryResponse {
  recent: SearchHistoryEntry[];
  frequent: SearchHistoryEntry[];
}

export async function getSearchHistory(query?: string): Promise<SearchHistoryResponse> {
  const params = query ? `?q=${encodeURIComponent(query)}` : '';
  return apiClient<SearchHistoryResponse>(`/load-board/search-history${params}`);
}

export async function clearSearchHistory(): Promise<void> {
  await apiClient('/load-board/search-history', { method: 'DELETE' });
}

// ── Saved Searches ──

export interface SavedSearch {
  savedSearchId: string;
  name: string;
  searchParams: LoadBoardSearchParams;
  isActive: boolean;
  minRate: number | null;
  lastPolledAt: string | null;
  lastMatchCount: number;
  createdAt: string;
  updatedAt: string;
}

export async function getSavedSearches(): Promise<SavedSearch[]> {
  return apiClient<SavedSearch[]>('/load-board/saved-searches');
}

export async function createSavedSearch(data: {
  name: string;
  searchParams: LoadBoardSearchParams;
  minRate?: number;
}): Promise<SavedSearch> {
  return apiClient<SavedSearch>('/load-board/saved-searches', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function toggleSavedSearch(savedSearchId: string): Promise<SavedSearch> {
  return apiClient<SavedSearch>(`/load-board/saved-searches/${savedSearchId}/toggle`, { method: 'PATCH' });
}

export async function deleteSavedSearch(savedSearchId: string): Promise<void> {
  await apiClient(`/load-board/saved-searches/${savedSearchId}`, {
    method: 'DELETE',
  });
}
