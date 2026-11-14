import { ForbiddenException } from '@nestjs/common';
import { TenantPlan } from '@appshore/db';
import { ApiErrorCode } from '@app/shared-types';

/**
 * Every 403 a plan gate answers, built here so the route guard, the entitlement service and the seat check speak in
 * one shape. Each carries `code` and `detail` only: the error envelope drops any other key (ADR "API contract"), so
 * the web builds its upgrade prompt from `code` and shows `detail`.
 */

/** The plan codes a denial can carry. `PLAN_UPGRADE_REQUIRED` and `USER_LIMIT_REACHED` open the web's upgrade prompt. */
export const PLAN_DENIAL_CODES = {
  FEATURE_DISABLED: 'FEATURE_DISABLED',
  NO_TENANT: 'NO_TENANT',
  TRIAL_EXPIRED: 'TRIAL_EXPIRED',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  PLAN_UPGRADE_REQUIRED: ApiErrorCode.PLAN_UPGRADE_REQUIRED,
  USER_LIMIT_REACHED: ApiErrorCode.USER_LIMIT_REACHED,
} as const;
export type PlanDenialCode = (typeof PLAN_DENIAL_CODES)[keyof typeof PLAN_DENIAL_CODES];

const PLAN_DISPLAY_NAMES: Partial<Record<TenantPlan, string>> = {
  [TenantPlan.STARTER]: 'Starter',
  [TenantPlan.PROFESSIONAL]: 'Professional',
  [TenantPlan.ENTERPRISE]: 'Enterprise',
};

/** Paid plans, cheapest first: the order an upgrade suggestion walks. */
export const UPGRADE_PATH: readonly TenantPlan[] = [TenantPlan.STARTER, TenantPlan.PROFESSIONAL, TenantPlan.ENTERPRISE];

export function planDisplayName(plan: TenantPlan | null | undefined): string {
  return (plan && PLAN_DISPLAY_NAMES[plan]) ?? 'Enterprise';
}

const deny = (code: PlanDenialCode, detail: string) => new ForbiddenException({ code, detail });

export function featureDisabledError(): ForbiddenException {
  return deny(PLAN_DENIAL_CODES.FEATURE_DISABLED, 'This feature is currently unavailable.');
}

export function noTenantError(): ForbiddenException {
  return deny(PLAN_DENIAL_CODES.NO_TENANT, 'Open a workspace to use this feature.');
}

export function trialExpiredError(): ForbiddenException {
  return deny(PLAN_DENIAL_CODES.TRIAL_EXPIRED, 'Your trial has ended. Please contact sales to continue.');
}

export function accountSuspendedError(): ForbiddenException {
  return deny(PLAN_DENIAL_CODES.ACCOUNT_SUSPENDED, 'Your account has been suspended. Please contact support.');
}

export function planUpgradeRequiredError(requiredPlan: string): ForbiddenException {
  return deny(
    PLAN_DENIAL_CODES.PLAN_UPGRADE_REQUIRED,
    `This feature needs the ${requiredPlan} plan or higher. A workspace owner can upgrade from Plan & Billing.`,
  );
}

export function userLimitReachedError(plan: TenantPlan, userLimit: number): ForbiddenException {
  return deny(
    PLAN_DENIAL_CODES.USER_LIMIT_REACHED,
    `Your ${planDisplayName(plan)} plan includes ${userLimit} users, and they are all in use (pending invitations count). Remove a member, cancel a pending invitation or upgrade your plan to add more.`,
  );
}
