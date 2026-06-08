/**
 * Platform — Reference Data (Phase 4 Group 4a).
 *
 * Covers the one endpoint on `ReferenceDataController`:
 *
 *   1. GET /reference-data — public. Returns a flat envelope of category →
 *      ReferenceItem[]. Used by every frontend selector (driver_status,
 *      equipment_type, country, state, …).
 *
 * Role fixture: `asAnonymous` — the controller is `@Public()` and the route
 * is mounted outside JwtAuthGuard. No tenant context required.
 *
 * Schema note: the live response serialises `sort_order` (snake_case), which
 * drifts from the shared-types `ReferenceItemSchema` (`sortOrder`). Hand-
 * written `ReferenceDataSchema` mirrors the observed shape. See finding #35
 * and SCHEMA-AUDIT.md for details.
 *
 * Tags: `@workflow @contract` (one read path, shape-focused). No plan gate —
 * endpoint is public + tenant-agnostic.
 */
import { test, expect } from '@sally/test-utils/auth';
import { expectContract, PlatformSchemas } from '@sally/test-utils/schemas';

test.describe('Platform · Reference Data @workflow', () => {
  // 1 ── GET /reference-data ───────────────────────────────────────────────
  test('GET /reference-data returns nested category → ReferenceItem[] envelope @workflow @contract', async ({
    asAnonymous,
  }) => {
    const res = await asAnonymous.get('/reference-data');
    expect(res.status()).toBe(200);
    // Top-level schema is `z.record(string, array(item))` — records don't
    // take `.strict()` in Zod v3, but the nested `ReferenceDataItemSchema`
    // IS strict-by-default (objects default to `strip` unless `.passthrough`).
    // That catches extra-key drift where it matters (per-item).
    const body = expectContract(PlatformSchemas.ReferenceDataSchema, await res.json(), 'GET /reference-data');

    // Semantic — demo-northstar-2026 always seeds the core reference-data
    // categories. Assert a stable subset exists + each carries at least one
    // item + items are well-formed (non-empty code + label + numeric
    // sort_order + object metadata).
    const expectedCategories = ['driver_status', 'equipment_type', 'country', 'cdl_class'];
    for (const category of expectedCategories) {
      expect(body[category], `reference-data is missing expected category "${category}"`).toBeDefined();
      const items = body[category];
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(item.code.length).toBeGreaterThan(0);
        expect(item.label.length).toBeGreaterThan(0);
        expect(Number.isFinite(item.sort_order)).toBe(true);
        expect(typeof item.metadata).toBe('object');
      }
    }

    // Semantic — country category always includes US. Hard-coded expected
    // code because the frontend drop-down for phone/address flows depends
    // on it; if this regresses, the dropdown is broken.
    const countries = body['country'];
    const us = countries.find((c) => c.code === 'US');
    expect(us).toBeDefined();
    expect(us?.label).toBe('United States');
  });
});
