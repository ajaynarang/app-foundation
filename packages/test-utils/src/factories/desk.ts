/**
 * Factories for the Desk core domain (Phase 6 Group 6e).
 *
 * Mirror the class-validator DTOs on
 * `apps/backend/src/domains/desk/core/{approval,memory}/dto/*` exactly —
 * missing required fields or out-of-enum values trip the DTO layer with a
 * 400 before the service runs.
 *
 * The `[QA-TEST]` prefix in patch content flags the row in DB inspection
 * (same convention as integrations + ai factories).
 */

/**
 * `POST /desk/approvals/:id/decide` body — `DecideApprovalDto`
 * (apps/backend/src/domains/desk/core/approval/dto/decide-approval.dto.ts).
 *
 * Required: `decision` ∈ {APPROVED, EDITED, REJECTED}.
 * Conditional:
 *   - `editedAction`: required iff decision === 'EDITED'.
 *   - `rejectionReason`: required iff decision === 'REJECTED' (≤2000 chars).
 *   - `terminate`: optional bool; iff true requires decision === 'REJECTED'.
 *
 * Default 'APPROVED' — terminal happy-path. Tests overriding to EDITED or
 * REJECTED MUST also pass the matching conditional field.
 */
export function buildDeskApprovalDecide(
  overrides: {
    decision?: 'APPROVED' | 'EDITED' | 'REJECTED';
    editedAction?: Record<string, unknown>;
    rejectionReason?: string;
    terminate?: boolean;
  } & Record<string, unknown> = {},
) {
  return {
    decision: 'APPROVED' as const,
    ...overrides,
  };
}

/**
 * `PATCH /desk/memories/:id` body — `UpdateMemoryDto`
 * (apps/backend/src/domains/desk/core/memory/dto/update-memory.dto.ts).
 *
 * Both fields optional but the service requires at least one (Zod refine
 * on UpdateMemoryRequestSchema in shared-types). Default `content` echoes
 * a unique [QA-TEST] string so the persistence assertion can verify the
 * follow-up GET reflects the patch.
 *
 *   - `content`: 1..4000 chars when provided.
 *   - `isActive`: bool — flip to false to soft-archive (precedes
 *     `DELETE` in test 40 ordering, but distinct semantics: PATCH leaves
 *     decided/source rows unchanged; DELETE flips `isActive` to false
 *     via `softDelete`).
 */
export function buildDeskMemoryPatch(
  overrides: {
    content?: string;
    isActive?: boolean;
  } & Record<string, unknown> = {},
) {
  return {
    content: `[QA-TEST] desk memory patched ${Date.now()}`,
    ...overrides,
  };
}

/**
 * `PATCH /desk/responsibilities/:key` body — `UpdateResponsibilityDto`
 * (apps/backend/src/domains/desk/core/responsibility/dto/update-responsibility.dto.ts).
 *
 * All fields optional but the underlying Zod refine
 * (`UpdateDeskResponsibilityRequestSchema` in shared-types) requires at
 * least one. Default `notesForAssistant` echoes a unique [QA-TEST] string so
 * the persistence assertion can verify the follow-up GET reflects it.
 *
 *   - `enabled`: bool — flips the per-tenant row. Skipped here because
 *     toggling enabled on `ar_followup` ripples into every active episode.
 *   - `trustLevel`: SUPERVISED | ASSISTED | AUTONOMOUS.
 *   - `conditions`: typed-per-responsibility JSON. Validated by the
 *     registry's Zod schema in service `updateForTenant` (line 186-192).
 *   - `notesForAssistant`: ≤2000 chars OR null. Safe to mutate on any
 *     responsibility — purely operator notes, no side effects.
 *   - `supervisorUserId`: positive int OR null.
 */
export function buildDeskResponsibilityPatch(
  overrides: {
    enabled?: boolean;
    trustLevel?: 'SUPERVISED' | 'ASSISTED' | 'AUTONOMOUS';
    conditions?: Record<string, unknown>;
    notesForAssistant?: string | null;
    supervisorUserId?: number | null;
  } & Record<string, unknown> = {},
) {
  return {
    notesForAssistant: `[QA-TEST] desk responsibility note ${Date.now()}`,
    ...overrides,
  };
}

/**
 * `PATCH /desk/agents/:key` body — `UpdateAgentDto`
 * (apps/backend/src/domains/desk/core/agent/dto/update-agent.dto.ts).
 *
 * Required: `enabled` (bool). When false, bulk-disables every AVAILABLE
 * responsibility for the agent (panic-stop). When true, bulk-enables.
 * Default `true` — safe initial state; tests mutating to `false` MUST
 * restore in afterAll.
 */
export function buildDeskAgentBulkToggle(overrides: { enabled?: boolean } = {}) {
  return {
    enabled: true,
    ...overrides,
  };
}
