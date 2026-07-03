/**
 * Entity search extension point.
 *
 * The starter ships a working `GET /search` endpoint (used by the web app's
 * ⌘K command palette and the AI-chat @-mention picker) that returns no
 * results by default. To surface your domain entities, implement
 * `SearchProvider` in your domain module and register it under the
 * `SEARCH_PROVIDERS` token — see `SearchModule.register()`.
 */

/** Shape consumed by the web app (packages/appshore/web-core/src/shared/lib/search.ts). */
export interface SearchResult {
  /** Entity type discriminator, e.g. 'customer', 'order'. */
  type: string;
  /** Public entity id. */
  id: string;
  /** Primary display label. */
  label: string;
  /** Secondary display line. */
  description: string;
  /** Web-app route to navigate to on selection. */
  href: string;
  /** Optional human-facing reference number shown alongside the label. */
  referenceNumber?: string;
}

/** A domain searcher. Must scope every query to the given tenant. */
export interface SearchProvider {
  search(tenantDbId: number, query: string): Promise<SearchResult[]>;
}

/**
 * Injection token for the array of registered `SearchProvider`s.
 * Defaults to an empty array — the endpoint returns `{ results: [] }`
 * until an app registers providers via `SearchModule.register()`.
 */
export const SEARCH_PROVIDERS = Symbol('SEARCH_PROVIDERS');
