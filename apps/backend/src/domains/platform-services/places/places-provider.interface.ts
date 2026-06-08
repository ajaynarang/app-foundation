import type { PlaceSuggestion } from '@sally/shared-types';

export interface AutocompleteParams {
  q: string;
  country?: 'US';
  sessionToken?: string;
  limit?: number;
}

export interface IPlacesProvider {
  autocomplete(params: AutocompleteParams): Promise<PlaceSuggestion[]>;
}
