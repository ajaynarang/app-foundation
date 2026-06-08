/**
 * Platform — Onboarding (Phase 4 Group 4a).
 *
 * Covers the 1 endpoint on `OnboardingController`:
 *
 *   1. GET /onboarding/status — OWNER/ADMIN only. Returns the tenant's
 *      onboarding progress envelope: `overallProgress`, counts, and a
 *      structured `milestones[]` with `items[]` (+ optional `loadPaths[]`).
 *
 * Role fixture: `asOwner`. The controller is `@Roles(OWNER, ADMIN)` + guarded
 * by `JwtAuthGuard`, `TenantGuard`, `RolesGuard`. We test the OWNER path —
 * ADMIN follows the same code path. Testing every allowed role belongs to
 * the RBAC matrix (separate suite), not the workflow spec.
 *
 * Schema strategy: re-export shared-types `OnboardingStatusResponseSchema` —
 * 1:1 match with the controller's `OnboardingStatusResponse` interface.
 *
 * Response cache — the controller caches for 30s. The semantic assertions
 * below don't depend on freshness beyond schema conformance + progress
 * bounds, so the cache is transparent. Persistence (criterion 6) is asserted
 * by a second GET — if the cache hit and the miss disagree on shape,
 * `.strict()` will catch it.
 */
import { test, expect } from '@sally/test-utils/auth';
import { expectContract, PlatformSchemas } from '@sally/test-utils/schemas';

test.describe('Platform · Onboarding @workflow', () => {
  // 1 ── GET /onboarding/status ───────────────────────────────────────────
  test('GET /onboarding/status returns overallProgress + milestones envelope for OWNER @workflow @contract', async ({
    asOwner,
  }) => {
    const res = await asOwner.get('/onboarding/status');
    expect(res.status()).toBe(200);
    const body = expectContract(
      PlatformSchemas.OnboardingStatusSchema.strict(),
      await res.json(),
      'GET /onboarding/status',
    );

    // Semantic — progress math invariants.
    expect(body.overallProgress).toBeGreaterThanOrEqual(0);
    expect(body.overallProgress).toBeLessThanOrEqual(100);
    expect(body.completedItems).toBeGreaterThanOrEqual(0);
    expect(body.totalItems).toBeGreaterThan(0);
    expect(body.completedItems).toBeLessThanOrEqual(body.totalItems);
    expect(Number.isInteger(body.completedItems)).toBe(true);
    expect(Number.isInteger(body.totalItems)).toBe(true);

    // overallProgress should match the completed-over-total ratio within 1%
    // (service rounds to an integer). Verify to catch divergence between
    // the displayed KPI + the underlying counts.
    const computed = Math.round((body.completedItems / body.totalItems) * 100);
    expect(Math.abs(body.overallProgress - computed)).toBeLessThanOrEqual(1);

    // Milestones — at least one milestone, each with a non-empty title +
    // items[] of well-formed OnboardingItems. Every item's actionType is
    // one of the four documented variants (Zod enforces this — assert
    // again for semantic clarity).
    expect(body.milestones.length).toBeGreaterThan(0);
    const validActionTypes = new Set(['link', 'chat', 'sheet', 'console']);
    const validStatuses = new Set(['complete', 'in_progress', 'available']);
    for (const milestone of body.milestones) {
      expect(milestone.id.length).toBeGreaterThan(0);
      expect(milestone.title.length).toBeGreaterThan(0);
      expect(validStatuses.has(milestone.status)).toBe(true);
      expect(milestone.items.length).toBeGreaterThan(0);
      for (const item of milestone.items) {
        expect(item.id.length).toBeGreaterThan(0);
        expect(item.title.length).toBeGreaterThan(0);
        expect(typeof item.complete).toBe('boolean');
        expect(validActionTypes.has(item.actionType)).toBe(true);
      }
    }

    // Persistence — second GET returns the same totals (cache is 30s, so
    // counts are stable across two rapid calls). Envelope shape is reasserted.
    const second = await asOwner.get('/onboarding/status');
    expect(second.status()).toBe(200);
    const secondBody = expectContract(PlatformSchemas.OnboardingStatusSchema.strict(), await second.json());
    expect(secondBody.totalItems).toBe(body.totalItems);
    expect(secondBody.completedItems).toBe(body.completedItems);
  });
});
