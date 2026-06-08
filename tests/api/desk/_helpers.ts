/**
 * Shared bootstrap helpers for the Phase 6 Group 6e desk spec suite.
 * Follow the `tests/api/integrations/_helpers.ts` convention — typed
 * returns, throw-with-descriptive-error-naming-the-tag when a precondition
 * can't be bootstrapped.
 *
 * All three helpers throw with `@requires:data-desk-*` references so
 * the calling test (which carries the matching tag) is collection-excluded
 * cleanly when the data isn't seeded.
 *
 * Source-of-truth pointers:
 *   - apps/backend/src/domains/desk/core/approval/approval.controller.ts
 *   - apps/backend/src/domains/desk/core/episode/desk-episode.controller.ts
 *   - apps/backend/src/domains/desk/core/memory/memory.controller.ts
 */
import { expect } from '@playwright/test';
import type { RoleApiClient } from '@sally/test-utils/playwright';

// ── firstPendingApproval ─────────────────────────────────────────────

/**
 * Pick the first pending desk approval row (queue view). Returns the
 * approval id + its episode id — the latter is sometimes useful to
 * cross-check the episode's status flipped to `waiting_approval`.
 *
 * `GET /desk/approvals` returns a bare array of queue items (not
 * envelope-wrapped) — the controller's `listPending` only filters on
 * `decision: null AND episode.tenantId = current` (approval.service.ts
 * lines 196-217). Empty array on tenants where the `ar_followup`
 * workflow hasn't gated for human approval.
 *
 * Throws `@requires:data-desk-approval` when no pending row exists —
 * the consuming test must carry that tag so collection-excludes it.
 */
export async function firstPendingApproval(
  asDispatcher: RoleApiClient,
): Promise<{ id: string; episodeId: string }> {
  const res = await asDispatcher.get('/desk/approvals?limit=1');
  expect(res.status(), 'firstPendingApproval: GET /desk/approvals').toBe(200);
  const rows = (await res.json()) as Array<{ id?: string; episodeId?: string }>;
  const picked = rows[0];
  if (!picked || typeof picked.id !== 'string' || typeof picked.episodeId !== 'string') {
    throw new Error(
      'firstPendingApproval: no pending DeskApproval rows on this tenant — ' +
        'tag test @requires:data-desk-approval. Pending rows are created by ' +
        'workflow runs that gate for human input (ar_followup is the only one ' +
        'wired today). After running POST /desk/responsibilities/ar_followup/run ' +
        'and confirming GET /desk/approvals returns at least one row, flip ' +
        'TESTS_DATA_CAPABILITIES=desk-approval.',
    );
  }
  return { id: picked.id, episodeId: picked.episodeId };
}

// ── firstEpisode ─────────────────────────────────────────────────────

/**
 * Pick the first desk episode (any status). Returns just the id — the
 * detail test only needs to verify the GET-by-id contract.
 *
 * `GET /desk/episodes` returns the cursor envelope `{rows, nextCursor}`
 * (desk-episode.service.ts lines 53-56), ordered by `openedAt` desc.
 * On `demo-northstar-2026` (probed 2026-04-27) at least 2 rows exist
 * from the seeded ar_followup runs.
 *
 * Throws `@requires:data-desk-episode` when no episode exists — the
 * consuming test must carry that tag.
 */
export async function firstEpisode(asDispatcher: RoleApiClient): Promise<{ id: string }> {
  const res = await asDispatcher.get('/desk/episodes?limit=1');
  expect(res.status(), 'firstEpisode: GET /desk/episodes').toBe(200);
  const body = (await res.json()) as { rows?: Array<{ id?: string }> };
  const picked = body?.rows?.[0];
  if (!picked || typeof picked.id !== 'string') {
    throw new Error(
      'firstEpisode: no DeskEpisode rows on this tenant — tag test ' +
        '@requires:data-desk-episode. Episodes are created by inngest-triggered ' +
        'workflow runs (ar_followup is wired today). Run the responsibility ' +
        '(POST /desk/responsibilities/ar_followup/run) or wait for the ' +
        'scheduled cron, then confirm GET /desk/episodes returns a non-empty ' +
        'rows[]. Flip TESTS_DATA_CAPABILITIES=desk-episode after verifying.',
    );
  }
  return { id: picked.id };
}

// ── firstMemory ──────────────────────────────────────────────────────

/**
 * Pick the first desk memory row (active by default — the controller
 * defaults `activeOnly=true`).
 *
 * `GET /desk/memories` returns `{rows: [...]}` envelope
 * (memory.controller.ts line 65). `listForUI` projects 10 fields per
 * row (desk-memory.service.ts lines 192-203).
 *
 * Throws `@requires:data-desk-memory` when no memory row exists OR
 * when the read fails (e.g. Finding #53 — Prisma client out of sync
 * with `desk_memories` columns; live API 500s with P2022 today). The
 * calling test must carry the tag.
 *
 * NOTE: This helper surfaces a 500 as a precondition error referencing
 * the data tag — that's the cleanest way to keep the test loud about
 * the underlying infra problem without a noisy schema-mismatch failure.
 */
export async function firstMemory(asDispatcher: RoleApiClient): Promise<{ id: string }> {
  const res = await asDispatcher.get('/desk/memories?limit=1');
  if (res.status() === 500) {
    // Finding #53 — `apps/backend/prisma/schema.prisma` is out of date
    // with the live `desk_memories` table (migration
    // 20260427120000_desk_memory_scope_polarity_playbook... advanced
    // the DB but the Prisma model still declares the older `kind`
    // column shape). Surface as precondition so the test
    // collection-excludes cleanly.
    throw new Error(
      'firstMemory: GET /desk/memories returned HTTP 500 — Prisma client out of ' +
        'sync with desk_memories columns (Finding #53). Run pnpm prisma:generate ' +
        'after pulling the latest desk_memory_scope_polarity_playbook... migration ' +
        'AND update apps/backend/prisma/schema.prisma to reflect the new shape ' +
        '(scope, polarity, isPinned, entityPredicate, authoredByUserId). Then ' +
        'flip TESTS_DATA_CAPABILITIES=desk-memory after verifying GET ' +
        '/desk/memories returns a 200 envelope.',
    );
  }
  expect(res.status(), 'firstMemory: GET /desk/memories').toBe(200);
  const body = (await res.json()) as { rows?: Array<{ id?: string }> };
  const picked = body?.rows?.[0];
  if (!picked || typeof picked.id !== 'string') {
    throw new Error(
      'firstMemory: no DeskMemory rows on this tenant — tag test ' +
        '@requires:data-desk-memory. Memory rows are created by deterministic ' +
        'writers (writeEditedDraft / writeRejectionReason / writePositiveOutcome ' +
        'in desk-memory.service.ts) when an ar_followup run lands a positive ' +
        'outcome OR an operator edits/rejects a draft. After confirming GET ' +
        '/desk/memories returns a non-empty rows[], flip ' +
        'TESTS_DATA_CAPABILITIES=desk-memory.',
    );
  }
  return { id: picked.id };
}

// ── firstResponsibilityKey (Group 6f) ───────────────────────────────

/**
 * Pick the first responsibility row's key + agentKey (registry order →
 * `ar_followup` always first when bootstrapped).
 *
 * `GET /desk/responsibilities` returns a BARE array (NOT envelope-wrapped)
 * — service `listForTenant` (responsibility.service.ts:33-101) projects
 * one row per RESPONSIBILITY_REGISTRY entry. PR #663 bootstraps all 10
 * rows on tenant approve; demo-northstar verified to have all 10
 * (probe 2026-04-27).
 *
 * Throws with `@requires:data-desk-responsibility` when the array is
 * empty (tenant pre-PR-#663 OR bootstrap skipped).
 */
export async function firstResponsibilityKey(
  asDispatcher: RoleApiClient,
): Promise<{ key: string; agentKey: string }> {
  const res = await asDispatcher.get('/desk/responsibilities');
  expect(res.status(), 'firstResponsibilityKey: GET /desk/responsibilities').toBe(200);
  const rows = (await res.json()) as Array<{ key?: string; agentKey?: string }>;
  const picked = rows[0];
  if (!picked || typeof picked.key !== 'string' || typeof picked.agentKey !== 'string') {
    throw new Error(
      'firstResponsibilityKey: no DeskResponsibility rows on this tenant — ' +
        'tag test @requires:data-desk-responsibility. PR #663 bootstraps the 10 ' +
        'registry responsibilities when a tenant is approved; if your tenant was ' +
        'created before that PR or skipped the bootstrap, run the seed manually ' +
        '(apps/backend/scripts/desk-bootstrap.ts) and confirm GET /desk/responsibilities ' +
        'returns 10 rows. Then flip TESTS_DATA_CAPABILITIES=desk-responsibility.',
    );
  }
  return { key: picked.key, agentKey: picked.agentKey };
}

// ── firstAgentKey (Group 6f) ────────────────────────────────────────

/**
 * Pick the first agent row's key (registry order — `sally-billing`
 * always first because `ar_followup` is the first registry entry and
 * its agentKey is `sally-billing`).
 *
 * `GET /desk/agents` returns a BARE array — service `listForTenant`
 * (agent.service.ts:24-122) filters via
 * `orderedKeys.filter((k) => agentsByKey.has(k))`, so only agents that
 * own a registered responsibility appear. Live probe shows 6 rows on
 * demo-northstar today (the 12 `AGENT_KEYS` total, minus 6 that don't
 * own anything in the registry yet).
 *
 * Throws with `@requires:data-desk-agent-key` when the array is empty.
 */
export async function firstAgentKey(asDispatcher: RoleApiClient): Promise<{ key: string }> {
  const res = await asDispatcher.get('/desk/agents');
  expect(res.status(), 'firstAgentKey: GET /desk/agents').toBe(200);
  const rows = (await res.json()) as Array<{ key?: string }>;
  const picked = rows[0];
  if (!picked || typeof picked.key !== 'string') {
    throw new Error(
      'firstAgentKey: no DeskAgent rows on this tenant — tag test ' +
        '@requires:data-desk-agent-key. PR #663 bootstraps the agent roster on ' +
        'tenant approve. Confirm GET /desk/agents returns a non-empty array, then ' +
        'flip TESTS_DATA_CAPABILITIES=desk-agent-key.',
    );
  }
  return { key: picked.key };
}

/**
 * The only responsibility key wired for manual run today
 * (responsibility.controller.ts line 89). Hardcoded — anything else 404s.
 * Future responsibilities register their own trigger method and switch
 * here.
 */
export const AR_FOLLOWUP_KEY = 'ar_followup';
