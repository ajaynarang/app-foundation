import { QueryLimit, QuerySearch } from '@appshore/kernel/shared/utils/query-dto';

export const DEFAULT_SEARCH_LIMIT = 8;
export const MAX_SEARCH_LIMIT = 25;

/** `GET /search` — `q` (fewer than 2 characters answers no results), `limit` (1…25, default 8). */
export class SearchQueryDto {
  @QuerySearch()
  q?: string;

  @QueryLimit({ max: MAX_SEARCH_LIMIT, default: DEFAULT_SEARCH_LIMIT })
  limit!: number;
}
