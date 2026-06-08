/**
 * Plan tier ordering for upgrade/downgrade validation.
 * Higher number = higher tier.
 */
export const PLAN_ORDER: Record<string, number> = {
  TRIAL: 0,
  TRIAL_EXPIRED: 0,
  STARTER: 1,
  PROFESSIONAL: 2,
  ENTERPRISE: 3,
};
