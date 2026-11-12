import { TenantPlan } from '@appshore/db';

export interface PlanAiBudget {
  dailySoftUsd: string;
  dailyHardUsd: string;
  monthlySoftUsd: string;
  monthlyHardUsd: string;
}

/**
 * The AI budget each plan starts a workspace on, in USD of PLATFORM-paid spend (a workspace's own key is never
 * capped). PLACEHOLDER dollar values: set your own before real billing; the seeding mechanism is what ships.
 * STARTER mirrors the schema defaults on `TenantAiBudget` (5 / 20 / 50 / 200). TRIAL_EXPIRED and SUSPENDED are zero:
 * no platform-paid AI.
 */
export const PLAN_AI_BUDGETS: Record<TenantPlan, PlanAiBudget> = {
  [TenantPlan.TRIAL]: { dailySoftUsd: '2', dailyHardUsd: '5', monthlySoftUsd: '10', monthlyHardUsd: '25' },
  [TenantPlan.TRIAL_EXPIRED]: { dailySoftUsd: '0', dailyHardUsd: '0', monthlySoftUsd: '0', monthlyHardUsd: '0' },
  [TenantPlan.STARTER]: { dailySoftUsd: '5', dailyHardUsd: '20', monthlySoftUsd: '50', monthlyHardUsd: '200' },
  [TenantPlan.PROFESSIONAL]: { dailySoftUsd: '20', dailyHardUsd: '50', monthlySoftUsd: '200', monthlyHardUsd: '500' },
  [TenantPlan.ENTERPRISE]: { dailySoftUsd: '50', dailyHardUsd: '150', monthlySoftUsd: '500', monthlyHardUsd: '1500' },
  [TenantPlan.SUSPENDED]: { dailySoftUsd: '0', dailyHardUsd: '0', monthlySoftUsd: '0', monthlyHardUsd: '0' },
};

/** The seeder's stamp on `TenantAiBudget.notes`. A row without it is an admin's, and the seeder never touches it. */
export const BUDGET_SEED_NOTE_PREFIX = 'plan:';

/**
 * The stamp on a row created lazily with the schema defaults (the pre-call budget check, the admin spend panel).
 * Nobody chose those caps, so the row stays the seeder's and a later plan change may replace them. An admin edit
 * replaces `notes` and takes the row over. Migration `ai_cost_cache_write_and_payer` stamps existing default rows.
 */
export const BUDGET_SEED_NOTE_DEFAULT = `${BUDGET_SEED_NOTE_PREFIX}DEFAULT`;

/**
 * The note an admin edit stores. The seeder's stamp is never kept: the budget sheet pre-fills the stored note, so a
 * save that changed only the caps sends `plan:…` back, and keeping it would leave the row the seeder's (the next plan
 * change would overwrite the admin's caps). An admin edit always takes the row out of the seeder's hands.
 */
export function adminBudgetNote(notes: string | null | undefined): string | null {
  if (!notes || notes.startsWith(BUDGET_SEED_NOTE_PREFIX)) return null;
  return notes;
}

/** True when the plan seeder owns this budget row (or there is no row yet). */
export function isSeederOwned(notes: string | null | undefined, rowExists: boolean): boolean {
  return !rowExists || (notes?.startsWith(BUDGET_SEED_NOTE_PREFIX) ?? false);
}
