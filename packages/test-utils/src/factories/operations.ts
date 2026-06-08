import { unique } from './common.js';

// ── Alert factories (Phase 3 Group 3b/3c) ─────────────────────────────────────
//
// Reconciled against:
//   - apps/backend/.../alerts/dto/snooze-alert.dto.ts  → SnoozeAlertDto
//   - apps/backend/.../alerts/dto/add-note.dto.ts      → AddNoteDto
//   - apps/backend/.../alerts/dto/resolve-alert.dto.ts → ResolveAlertDto
//   - apps/backend/.../alerts/dto/bulk-action.dto.ts   → BulkAcknowledgeDto,
//                                                        BulkResolveAlertsDto
//
// Backend ValidationPipe runs with `whitelist: true, forbidNonWhitelisted: true`
// — factories must NOT emit unknown keys.

/**
 * POST /alerts/:alert_id/snooze body — `SnoozeAlertDto`.
 *
 * `durationMinutes` is bounded [5..480] on the DTO (`@Min(5) @Max(480)`).
 * Default is 60 minutes — comfortable middle of the range that still lets a
 * test verify the clock-math without waiting for the snooze to elapse.
 */
export interface SnoozeAlertPayload {
  durationMinutes: number;
  note?: string;
}

export function buildSnoozeAlertPayload(overrides: Partial<SnoozeAlertPayload> = {}): SnoozeAlertPayload {
  return {
    durationMinutes: 60,
    ...overrides,
  };
}

/** POST /alerts/:alert_id/resolve body — `ResolveAlertDto`. */
export interface ResolveAlertPayload {
  resolutionNotes?: string;
}

export function buildResolveAlertPayload(overrides: Partial<ResolveAlertPayload> = {}): ResolveAlertPayload {
  return {
    resolutionNotes: `Resolved via QA ${unique('RES')}`,
    ...overrides,
  };
}

/** POST /alerts/:alert_id/notes body — `AddNoteDto` (content required, `@MinLength(1)`). */
export interface AlertNotePayload {
  content: string;
}

export function buildAlertNote(overrides: Partial<AlertNotePayload> = {}): AlertNotePayload {
  return {
    content: `QA alert note ${unique('NOTE')}`,
    ...overrides,
  };
}

/** POST /alerts/bulk/acknowledge body — `BulkAcknowledgeDto`. `@ArrayMinSize(1)`. */
export interface BulkAcknowledgePayload {
  alertIds: string[];
}

export function buildBulkAcknowledgePayload(alertIds: string[]): BulkAcknowledgePayload {
  return { alertIds };
}

/** POST /alerts/bulk/resolve body — `BulkResolveAlertsDto`. */
export interface BulkResolveAlertsPayload {
  alertIds: string[];
  resolutionNotes?: string;
}

export function buildBulkResolveAlertsPayload(
  alertIds: string[],
  overrides: Partial<Omit<BulkResolveAlertsPayload, 'alertIds'>> = {},
): BulkResolveAlertsPayload {
  return { alertIds, ...overrides };
}

// ── Shield factories (Phase 3 Group 3d) ───────────────────────────────────────
//
// Reconciled against:
//   - apps/backend/.../shield/dto/trigger-audit.dto.ts → TriggerAuditDto
//   - apps/backend/.../shield/dto/custom-rule.dto.ts   → CreateCustomRuleDto,
//                                                        UpdateCustomRuleDto
//
// NOTE on CustomRule shape: the live DTO is a SINGLE natural-language rule
// string (`rule: string`, 10..500 chars, with prompt-injection defense),
// NOT a structured { name, category, severity, conditions } object. The
// spec document signature is preserved for caller ergonomics, but only the
// `rule` text is forwarded to the backend. TODO(phase-3-verify).

export type ShieldAuditScope = 'FULL' | 'HOS' | 'DRIVERS' | 'VEHICLES' | 'LOADS';

/** POST /shield/audit body — `TriggerAuditDto`. All fields optional. */
export interface TriggerAuditPayload {
  scope?: ShieldAuditScope;
  includeAi?: boolean;
  includeCustomRules?: boolean;
  auditPeriodDays?: number;
}

export function buildTriggerAuditPayload(overrides: Partial<TriggerAuditPayload> = {}): TriggerAuditPayload {
  // Default: FULL scope, no AI (fast, deterministic envelope in CI), no
  // custom rules layer, minimum 7-day audit window to keep the audit
  // snappy. Callers flipping `includeAi: true` should tag `@slow`.
  return {
    scope: 'FULL',
    includeAi: false,
    includeCustomRules: false,
    auditPeriodDays: 7,
    ...overrides,
  };
}

export type ShieldRuleCategory = 'HOS' | 'DRIVERS' | 'VEHICLES' | 'LOADS';
export type ShieldRuleSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export interface CustomRulePayloadOptions {
  name?: string;
  category?: ShieldRuleCategory;
  severity?: ShieldRuleSeverity;
  conditions?: string;
  /** Override the emitted rule text directly. Takes priority over the
   *  assembled sentence when present. */
  rule?: string;
}

export interface CustomRulePayload {
  rule: string;
}

/**
 * POST /shield/rules body — `CreateCustomRuleDto`.
 *
 * The live DTO accepts a single `rule: string` (10..500 chars). Structured
 * overrides are assembled into a descriptive sentence before emission.
 */
export function buildCustomRulePayload(overrides: CustomRulePayloadOptions = {}): CustomRulePayload {
  if (overrides.rule) return { rule: overrides.rule };
  const suffix = unique('RULE');
  const name = overrides.name ?? `QA compliance rule ${suffix}`;
  const category = overrides.category ?? 'DRIVERS';
  const severity = overrides.severity ?? 'WARNING';
  const conditions = overrides.conditions ?? 'drivers must carry a current medical certificate on file';
  const text =
    `${name}: all ${category.toLowerCase()} ` +
    `must comply with ${severity.toLowerCase()} requirement — ${conditions}`;
  // Clip to the 500-char cap defensively.
  return { rule: text.slice(0, 500) };
}

/** PATCH /shield/rules/:id body — `UpdateCustomRuleDto`. Partial. */
export interface CustomRuleUpdatePayload {
  rule?: string;
  isActive?: boolean;
}

export function buildCustomRuleUpdate(overrides: CustomRuleUpdatePayload = {}): CustomRuleUpdatePayload {
  return { ...overrides };
}

// ── Command Center factories (Phase 3 Group 3f) ───────────────────────────────

export type ShiftNotePriority = 'urgent' | 'action_required' | 'info';

/** POST /command-center/shift-notes body — `CreateShiftNoteDto`. */
export interface ShiftNotePayload {
  content: string;
  isPinned?: boolean;
  priority?: ShiftNotePriority;
}

export function buildShiftNote(overrides: Partial<ShiftNotePayload> = {}): ShiftNotePayload {
  return {
    content: `QA shift note ${unique('SN')} — safe to delete`,
    ...overrides,
  };
}
