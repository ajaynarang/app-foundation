import { ApiErrorCode } from '@app/shared-types';
import { toast } from '@app/ui';
import { ApiError } from './api/client';

/** Where a workspace sees and changes its plan. */
export const PLAN_UPGRADE_PATH = '/settings/subscription';

export interface PlanUpgradePrompt {
  code: typeof ApiErrorCode.PLAN_UPGRADE_REQUIRED | typeof ApiErrorCode.USER_LIMIT_REACHED;
  title: string;
  /** The backend's own copy (which plan, how many seats). */
  detail: string;
  href: string;
}

const TITLES: Record<PlanUpgradePrompt['code'], string> = {
  [ApiErrorCode.PLAN_UPGRADE_REQUIRED]: 'Upgrade to use this feature',
  [ApiErrorCode.USER_LIMIT_REACHED]: 'Your plan has no free seats',
};

const isUpgradeCode = (code: unknown): code is PlanUpgradePrompt['code'] =>
  code === ApiErrorCode.PLAN_UPGRADE_REQUIRED || code === ApiErrorCode.USER_LIMIT_REACHED;

/**
 * The upgrade prompt a plan gate's 403 asks for, or null for any other error. Built from the envelope's `code`
 * (`PLAN_UPGRADE_REQUIRED`, `USER_LIMIT_REACHED`) and its `detail`: the envelope carries no other key.
 */
export function planUpgradePromptFor(error: unknown): PlanUpgradePrompt | null {
  if (!(error instanceof ApiError) || !isUpgradeCode(error.data?.code)) return null;
  const code = error.data.code as PlanUpgradePrompt['code'];
  const detail = typeof error.data?.detail === 'string' ? error.data.detail : '';
  return { code, title: TITLES[code], detail, href: PLAN_UPGRADE_PATH };
}

/**
 * Show the upgrade prompt for a plan gate's 403 and return true; return false (showing nothing) for any other error,
 * so the caller shows its own. The global mutation fallback calls it first; a mutation with its own `onError` calls
 * it before its own toast.
 */
export function showPlanUpgradePrompt(error: unknown): boolean {
  const prompt = planUpgradePromptFor(error);
  if (!prompt) return false;
  toast.error(prompt.title, {
    description: prompt.detail || undefined,
    duration: 10000,
    action: {
      label: 'View plans',
      onClick: () => {
        window.location.href = prompt.href;
      },
    },
  });
  return true;
}
