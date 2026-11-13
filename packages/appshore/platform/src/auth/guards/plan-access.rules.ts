import { UserRole } from '@appshore/db';
import { FEATURE_KEYS } from '@app/shared-types';
import { WHATSAPP_FEATURE_FLAG } from '../../infrastructure/notifications/channels/whatsapp/whatsapp.constants';

/**
 * Plan-access rules shared by `PlanGuard` (route gates) and `TenantEntitlementsService` (jobs, crons, handlers whose
 * feature depends on the body, and the AI tool pipeline), so the two cannot drift. The order every check follows:
 * kill switch, super-admin bypass, single-tenant bypass, plan status, plan entitlement.
 */

/** Platform staff act on any tenant regardless of its plan. The kill switch still applies. */
export function bypassesPlanChecks(role: string | null | undefined): boolean {
  return role === UserRole.SUPER_ADMIN;
}

/**
 * The feature flag that switches a plan feature off for everyone. It is the feature's own key, except where the
 * platform already had a launch flag under another name: the WhatsApp channel's switch is `whatsapp_channel`, and a
 * second, empty `whatsapp_notifications` flag would leave the channel off for every tenant.
 */
const KILL_SWITCH_KEYS: Readonly<Record<string, string>> = {
  [FEATURE_KEYS.WHATSAPP_NOTIFICATIONS]: WHATSAPP_FEATURE_FLAG,
};

export function killSwitchKey(feature: string): string {
  return KILL_SWITCH_KEYS[feature] ?? feature;
}

/**
 * `PLAN_ENFORCEMENT`: `enforce` (default) refuses; `log` writes one `plan.would_deny` warning and lets the call
 * through, so a product with live tenants can read a week of would-be denials before it turns the gates on. A kill
 * switch is an operational lever, not a plan rule, and holds in both modes.
 */
export const PLAN_ENFORCEMENT_MODES = ['enforce', 'log'] as const;
export type PlanEnforcementMode = (typeof PLAN_ENFORCEMENT_MODES)[number];

export function planEnforcementMode(value: unknown): PlanEnforcementMode {
  return value === 'log' ? 'log' : 'enforce';
}
