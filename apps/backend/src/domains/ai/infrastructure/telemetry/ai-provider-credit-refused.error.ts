import { Logger } from '@nestjs/common';
import type { AiBudgetState, AiPayer } from '@app/shared-types';
import { AiBudgetExceededError } from './ai-budget-exceeded.error';

/** No platform cap was hit (the provider said no), so the state carries no spend figures. */
const PROVIDER_REFUSED_STATE: AiBudgetState = {
  state: 'hard',
  dailyUsdSpent: '0',
  monthlyUsdSpent: '0',
  dailySoftUsd: '0',
  dailyHardUsd: '0',
  monthlySoftUsd: '0',
  monthlyHardUsd: '0',
};

export const AI_PROVIDER_CREDIT_REFUSED_DETAIL =
  "The AI provider refused the call: the key's credit can't cover it. Add credit or raise the key's limit, then try again.";

/**
 * The provider refused a call because the key's credit (or its per-key limit) cannot cover it: OpenRouter's 402
 * "requires more credits, or fewer max_tokens" and 403 "Key limit exceeded", Anthropic's "credit balance is too low",
 * OpenAI's "insufficient_quota". It IS an {@link AiBudgetExceededError}, so every surface's existing budget path (the
 * 402 to an HTTP caller, the chat's limit message, a failed job or Desk step) runs instead of the feature quietly
 * producing nothing. Its copy says the provider refused, not that the workspace's budget ran out.
 */
export class AiProviderCreditRefused extends AiBudgetExceededError {
  constructor(tenantId: number) {
    super(tenantId, PROVIDER_REFUSED_STATE, AI_PROVIDER_CREDIT_REFUSED_DETAIL);
  }
}

const CREDIT_REFUSAL_TEXT =
  /requires more credits|can only afford|insufficient[_ ](credits?|balance|funds|quota)|credit balance is too low|exceeded your current quota|key limit exceeded/i;

/** The error, its `lastError` (an AI SDK RetryError), `cause` and `errors`: a refusal is often one layer down. */
function layersOf(error: unknown, depth = 0): unknown[] {
  if (!error || typeof error !== 'object' || depth > 3) return [];
  const record = error as Record<string, unknown>;
  const nested = [record.lastError, record.cause, ...(Array.isArray(record.errors) ? record.errors : [])];
  return [error, ...nested.flatMap((inner) => layersOf(inner, depth + 1))];
}

/** True when a provider refused the call for credit: a 402, or a body that says the key can't pay for it. */
export function isProviderCreditRefusal(error: unknown): boolean {
  if (error instanceof AiBudgetExceededError) return false;
  return layersOf(error).some((layer) => {
    const record = layer as Record<string, unknown>;
    if (record.statusCode === 402) return true;
    const text = [record.message, record.responseBody].filter((part) => typeof part === 'string').join(' ');
    return CREDIT_REFUSAL_TEXT.test(text);
  });
}

const logger = new Logger('AiProviderCreditRefused');

/**
 * The one place a credit refusal on a PLATFORM-paid route is reported: at error level, because it follows the budget
 * path (a 402, not a 5xx) and so would otherwise reach no alert. On `platform-openrouter` it usually means the
 * platform's OpenRouter balance ran out. The error tracker's call goes here when one is added. A refusal on a
 * workspace's own key is the workspace's to fix and is not logged as a platform fault.
 */
export function logPlatformCreditRefusal(route: { payer: AiPayer; routeId: string }, tenantId: number | null): void {
  if (route.payer !== 'PLATFORM') return;
  const whose = tenantId === null ? 'platform content' : `workspace ${tenantId}`;
  logger.error(`Provider refused a platform-paid call for credit on ${route.routeId} (${whose})`);
}

/**
 * For a catch block: the typed refusal for a credit error, else the error unchanged, to rethrow. A platform-paid
 * refusal is logged once (`logPlatformCreditRefusal`); one on a workspace's own key is handed to the route's
 * `reportCreditRefusal`, which records it on the credential and tells the owner (status stays ACTIVE).
 */
export function mapProviderRefusal(
  error: unknown,
  tenantId: number,
  route: { payer: AiPayer; routeId: string; reportCreditRefusal?: (detail: string) => void },
): unknown {
  if (!isProviderCreditRefusal(error)) return error;
  logPlatformCreditRefusal(route, tenantId);
  if (route.payer === 'TENANT') route.reportCreditRefusal?.(refusalText(error));
  return new AiProviderCreditRefused(tenantId);
}

/** The provider's own words for a refusal, from the first layer that has any; the recorder redacts it. */
function refusalText(error: unknown): string {
  for (const layer of layersOf(error)) {
    const message = (layer as Record<string, unknown>).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return 'the provider refused the call for credit';
}
