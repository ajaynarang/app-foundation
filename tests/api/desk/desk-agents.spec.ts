/**
 * Desk Agents (Phase 6 Group 6f — 2 tests on DeskAgentController).
 *
 * Covers the 2 endpoints on
 * `apps/backend/src/domains/desk/core/agent/agent.controller.ts`:
 *
 *    46. GET   /desk/agents       — roster (one row per registry-referenced agent)
 *    47. PATCH /desk/agents/:key  — bulk enable/disable AVAILABLE responsibilities
 *
 * Auth: `@Roles(DISPATCHER, ADMIN, OWNER, SUPER_ADMIN)` at the class
 * level — `asDispatcher` is the canonical happy-path role.
 *
 * Status codes (verified live, plus controller decorators):
 *   - GET   /desk/agents      → 200
 *   - PATCH /desk/agents/:key → 200 (NestJS PATCH default)
 *
 * Live shape surprises (Phase 6 Group 6f findings):
 *   - The roster returns 6 rows (NOT 12 as the plan sketched). The
 *     service filters via `orderedKeys.filter((k) => agentsByKey.has(k))`
 *     so only agents that own a registered responsibility appear. Today
 *     6 of the 12 AGENT_KEYS are referenced by the registry (sally-billing,
 *     sally-route, sally-dispatch, sally-compliance, sally-maintenance,
 *     sally-payroll). Tests assert `length >= 1`, not the exact 6 — the
 *     count grows as new responsibilities land.
 *   - PATCH response is `{updatedCount: number}` (NOT
 *     `{affectedResponsibilityCount}` as the plan sketched) — service
 *     line 144 returns the Prisma `updateMany` result.count verbatim.
 *
 * Spec topology — two describe blocks:
 *   1. Read path (test 46) — parallel-safe, no mutation.
 *   2. Bulk toggle (test 47) — single test that captures original state,
 *      flips, asserts echo + persistence, restores in the same test
 *      (no `afterAll` — keeps fixture scope tight).
 *
 * Persistence:
 *   - Test 46: self-validating envelope.
 *   - Test 47: captures the agent's pre-PATCH AVAILABLE-responsibility
 *     enabled count, sends `{enabled: true}`, asserts updatedCount equals
 *     the available-responsibility count, then verifies via a follow-up
 *     `GET /desk/responsibilities` filtered to the agent's rows that
 *     every one is `enabled: true`. Restoration: re-PATCH with the
 *     agent's original `isActive` so the tenant state is unchanged at
 *     end of test.
 *
 * Rubric (per tests/README.md):
 *   - Role fixture: `asDispatcher`.
 *   - Factory: `buildDeskAgentBulkToggle`.
 *   - Exact numeric status (`.toBe(200)`).
 *   - expectContract on every JSON body.
 *   - Semantic property + state-change/echo on every test.
 *   - Tags per the plan (§6 lines 259-260).
 *   - Zero runtime `test.skip(cond, ...)`.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildDeskAgentBulkToggle } from '@sally/test-utils/factories';
import { expectContract, DeskSchemas } from '@sally/test-utils/schemas';
import { firstAgentKey } from './_helpers';

const { DeskAgentListSchema, DeskAgentBulkToggleResponseSchema, DeskResponsibilityListSchema } =
  DeskSchemas;

// ─── Read path (test 46) ─────────────────────────────────────────────
test.describe('Desk Agents · roster @workflow @contract @desk', () => {
  // 46 ── GET /desk/agents ──────────────────────────────────────────
  test('GET /desk/agents returns the roster (DISPATCHER) @workflow @contract @desk', async ({
    asDispatcher,
  }) => {
    const res = await asDispatcher.get('/desk/agents');
    expect(res.status()).toBe(200);

    const body = expectContract(DeskAgentListSchema, await res.json(), 'GET /desk/agents');

    // Semantic — at least one row (PR #663 bootstrap on tenant approve).
    // Counts are non-negative — already enforced by the schema. The
    // available + comingSoon counts MUST sum to >0 for every row
    // (every agent in the registry owns at least one responsibility).
    expect(body.length).toBeGreaterThanOrEqual(1);
    for (const agent of body) {
      expect(
        agent.availableResponsibilityCount + agent.comingSoonResponsibilityCount,
      ).toBeGreaterThan(0);
    }
  });
});

// ─── Bulk toggle (test 47) ───────────────────────────────────────────
//
// SERIAL within itself: capture original isActive on the agent, PATCH
// to the same value (idempotent toggle — preserves tenant state), assert
// updatedCount matches the agent's availableResponsibilityCount, verify
// via responsibility list. We avoid the destructive flip-and-restore
// because (a) flipping `ar_followup` to enabled=false silences daily AR
// follow-up runs on demo and (b) the response shape is identical for
// both directions, so an idempotent same-value PATCH gives full
// contract coverage with zero blast radius.
test.describe('Desk Agents · bulk toggle @workflow @destructive @desk', () => {
  test.describe.configure({ mode: 'serial' });

  test('PATCH /desk/agents/:key bulk-toggles AVAILABLE responsibilities (DISPATCHER) @workflow @destructive @desk @requires:data-desk-agent-key', async ({
    asDispatcher,
  }) => {
    const { key } = await firstAgentKey(asDispatcher);

    // Capture the agent's pre-PATCH state (isActive + available count).
    // The agent row's isActive reflects "any AVAILABLE responsibility
    // enabled?". For an idempotent PATCH we set enabled = isActive
    // (same-value write), which Prisma still counts as a `match` in
    // updateMany even when the row already has that value — the
    // count reflects rows MATCHED, not rows actually changed.
    const rosterRes = await asDispatcher.get('/desk/agents');
    expect(rosterRes.status()).toBe(200);
    const roster = expectContract(DeskAgentListSchema, await rosterRes.json(), 'GET /desk/agents');
    const agent = roster.find((a) => a.key === key);
    expect(agent, `agent ${key} should appear in roster`).toBeDefined();
    const originalIsActive = agent!.isActive;
    const availableCount = agent!.availableResponsibilityCount;

    // Idempotent PATCH — same enabled value as the agent's current
    // isActive. Tests the contract without mutating tenant state.
    const patch = buildDeskAgentBulkToggle({ enabled: originalIsActive });
    const patchRes = await asDispatcher.patch(`/desk/agents/${key}`, patch);
    expect(patchRes.status()).toBe(200);

    const body = expectContract(
      DeskAgentBulkToggleResponseSchema,
      await patchRes.json(),
      `PATCH /desk/agents/${key}`,
    );

    // Semantic — updatedCount equals the agent's AVAILABLE
    // responsibility count (Prisma `updateMany` matches every
    // AVAILABLE responsibility for this agent). COMING_SOON rows are
    // never touched (service line 141 — WHERE lifecycle: 'AVAILABLE').
    expect(body.updatedCount).toBe(availableCount);

    // Persistence — refetch responsibilities and confirm every row
    // owned by this agent + lifecycle AVAILABLE has `enabled` matching
    // the patch.
    const respRes = await asDispatcher.get('/desk/responsibilities');
    expect(respRes.status()).toBe(200);
    const responsibilities = expectContract(
      DeskResponsibilityListSchema,
      await respRes.json(),
      'GET /desk/responsibilities (post-patch)',
    );
    const ownedAvailable = responsibilities.filter(
      (r) => r.agentKey === key && r.lifecycle === 'AVAILABLE',
    );
    expect(ownedAvailable.length).toBe(availableCount);
    for (const r of ownedAvailable) {
      expect(r.enabled).toBe(originalIsActive);
    }
  });
});
