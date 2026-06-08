import type { ZodSchema } from 'zod';

import type { AgentKey, ConditionsUISpec, Lifecycle, ResponsibilityKey, TrustLevel } from '@sally/shared-types';

import type { ReinforcementJudge } from '../core/memory/reinforcement.types';

/**
 * Result of evaluating a responsibility's hard conditions. `conditionsMet`
 * drives the gate's ASSISTED-tier decision; `checks` is persisted on the
 * gate step row for the approval UI / audit trail.
 */
export interface ConditionsResult {
  conditionsMet: boolean;
  checks: Record<string, boolean>;
}

/**
 * Pure evaluator a responsibility supplies to turn its snapshotted
 * conditions into a {@link ConditionsResult}.
 *
 * The gate is job-blind: it hands the evaluator the responsibility's OWN
 * hydrate output verbatim (typed `unknown` here so the gate stays free of
 * any per-responsibility entity shape). The evaluator casts it to the
 * shape it produced in its own hydrate step and reads the fields its rules
 * need. Absent when the responsibility has no conditions schema — the gate
 * then treats conditions as met (the trust/confidence rules still apply).
 */
export type ConditionsEvaluator = (conditions: unknown, hydrate: unknown) => ConditionsResult;

/**
 * Shape of a responsibility definition — every responsibility (the
 * AVAILABLE ones and the COMING_SOON stubs alike) conforms to this. To add
 * a new responsibility, author a definition under `responsibilities/<key>/`
 * and register it in `responsibilities/index.ts` — no shared-runtime edits.
 *
 * Authored in code (not user-editable). Seeds read this to create per-
 * tenant rows. Controllers read this for UI metadata.
 */
export interface ResponsibilityDefinition {
  key: ResponsibilityKey;
  agentKey: AgentKey; // e.g. 'sally-billing'
  title: string; // shown in Desk index + settings
  description: string; // shown in settings + coming-soon card
  lifecycle: Lifecycle; // AVAILABLE | COMING_SOON

  /** Zod schema for the conditions JSON. null for COMING_SOON stubs. */
  conditionsSchema: ZodSchema | null;

  /** UI spec for rendering the conditions form. null for stubs. */
  conditionsUI: ConditionsUISpec | null;

  /**
   * Pure evaluator for this responsibility's hard conditions, consumed by
   * the shared gate step. Absent when `conditionsSchema === null` (no
   * conditions to evaluate) — the gate then treats conditions as met.
   */
  conditionsEvaluator?: ConditionsEvaluator;

  /** Default tenant config at seed time. */
  defaults: {
    trustLevel: TrustLevel;
    conditions: Record<string, unknown>;
  };

  /** Triggers — authored in code, not user-editable. */
  triggers: Array<
    | { kind: 'scheduled'; cron: string; tz?: string }
    | { kind: 'manual' }
    | { kind: 'domain-event'; event: string; condition?: Record<string, unknown> }
    | { kind: 'webhook'; source: string }
  >;

  /** MCP tool names this responsibility's workflow may call. Used to
   *  derive the DeskResponsibilityPrincipal's scope set via
   *  ScopeRegistryService. Empty for COMING_SOON stubs. */
  tools: string[];

  /**
   * Per-responsibility reinforcement judge — called by DeskMemoryReinforcer
   * at episode close for every memory the run actually used. Optional
   * because COMING_SOON stubs have no judge yet; the reinforcer no-ops
   * cleanly when missing. New responsibilities ship their judge alongside
   * their other registry fields.
   */
  reinforcementJudge?: ReinforcementJudge;
}
