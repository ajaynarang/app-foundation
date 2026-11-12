import { z } from 'zod';
import { defineResponseSchema } from '@appshore/platform/shared/openapi/api-result';

/** One hit of `GET /search`: mirrors `SearchResult` (search.provider.ts). */
const SearchResultSchema = z.object({
  type: z.string().describe('Entity type discriminator'),
  id: z.string().describe('Public entity id'),
  label: z.string(),
  description: z.string(),
  href: z.string().describe('Web-app route to open on selection'),
  referenceNumber: z.string().optional(),
});

export const SearchResultsResponse = defineResponseSchema(
  'SearchResults',
  z.object({ results: z.array(SearchResultSchema) }),
);
