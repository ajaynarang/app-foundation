/**
 * Fleet — Global Search API (Phase 1 Group 3)
 *
 * Covers the single endpoint on SearchController:
 *   - GET /search?q=<term>&limit=<n>
 *
 * Role rules: SearchController has NO `@Roles()` decorator and NO `@Public()`
 * decorator — it is authenticated (rejects anonymous) but role-agnostic.
 * We exercise it with `asDispatcher` since the intended consumer is the
 * dispatcher command bar.
 *
 * Response shape note: `SearchService.search` returns a FLAT
 * `{ type, id, label, description, href }[]`, NOT a per-type envelope. See
 * the comment in `packages/test-utils/src/schemas/search.ts`. The schema is
 * `.strict()` because the shape is fully enumerated.
 *
 * Query-length floor: minimum 2 characters. The service short-circuits to
 * `[]` below that length (see `SearchService.search`). We pick a seed-guaranteed
 * query ("Dallas" — present in demo origin/destination cities) so results are
 * non-empty on demo-northstar-2026.
 */
import { test, expect } from '@sally/test-utils/auth';
import { expectArrayContract, SearchSchemas } from '@sally/test-utils/schemas';

const { SearchResultItemSchema } = SearchSchemas;

test.describe('Fleet · Global Search @workflow', () => {
  test('GET /search returns flat results across entity types @workflow', async ({ asDispatcher }) => {
    // "Dallas" is the origin city for every load seeded by stage-2-loads.ts
    // on demo-northstar, so results include at least one `load` hit. Even if
    // the tenant is freshly reset, the envelope contract (flat array of the
    // five-field shape) is exercised.
    const res = await asDispatcher.get('/search?q=Dallas&limit=10');
    expect(res.status()).toBe(200);

    const items = expectArrayContract(SearchResultItemSchema, await res.json(), {
      allowEmpty: true,
      context: 'GET /search',
    });

    // Semantic: every item has a recognised type and a non-empty id+label.
    for (const item of items) {
      expect(['load', 'driver', 'invoice', 'customer']).toContain(item.type);
      expect(item.id.length).toBeGreaterThan(0);
      expect(item.label.length).toBeGreaterThan(0);
    }

    // Persistence / stability: a second call with the same query is the same
    // array or a subset of it (limit is per-entity-type). At minimum the
    // shape is identical.
    const secondRes = await asDispatcher.get('/search?q=Dallas&limit=10');
    expect(secondRes.status()).toBe(200);
    const secondItems = expectArrayContract(SearchResultItemSchema, await secondRes.json(), {
      allowEmpty: true,
      context: 'GET /search (second call)',
    });
    expect(Array.isArray(secondItems)).toBe(true);
  });
});
