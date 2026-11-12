import { Logger } from '@nestjs/common';
import { AiBudgetExceededError } from '../ai-budget-exceeded.error';
import {
  AI_PROVIDER_CREDIT_REFUSED_DETAIL,
  AiProviderCreditRefused,
  isProviderCreditRefusal,
  logPlatformCreditRefusal,
  mapProviderRefusal,
} from '../ai-provider-credit-refused.error';

const PLATFORM = { payer: 'PLATFORM' as const, routeId: 'platform-openrouter' };
const TENANT = { payer: 'TENANT' as const, routeId: 'aicred_x1' };

describe('provider credit refusals', () => {
  afterEach(() => jest.restoreAllMocks());

  describe('isProviderCreditRefusal', () => {
    it.each([
      ['a 402 status', { statusCode: 402, message: 'Payment Required' }],
      [
        "OpenRouter's 402 body",
        { message: 'This request requires more credits, or fewer max_tokens. You requested up to 64000 tokens' },
      ],
      ["OpenRouter's per-key limit", { statusCode: 403, message: 'Key limit exceeded (monthly limit)' }],
      ["OpenRouter's can-only-afford text", { responseBody: '{"error":{"message":"can only afford 812 tokens"}}' }],
      [
        "Anthropic's low balance",
        { statusCode: 400, message: 'Your credit balance is too low to access the Anthropic API.' },
      ],
      ["OpenAI's quota", { statusCode: 429, message: 'You exceeded your current quota', code: 'insufficient_quota' }],
      ['insufficient_quota in the body', { responseBody: '{"error":{"type":"insufficient_quota"}}' }],
      ['insufficient credits', { message: 'Insufficient credits' }],
      ['a RetryError wrapping a 402', { name: 'AI_RetryError', lastError: { statusCode: 402 } }],
      [
        'a cause one layer down',
        Object.assign(new Error('call failed'), { cause: { message: 'credit balance is too low' } }),
      ],
      ['one of several errors', { errors: [new Error('timeout'), { statusCode: 402 }] }],
    ])('detects %s', (_label, error) => {
      expect(isProviderCreditRefusal(error)).toBe(true);
    });

    it.each([
      ['a timeout', new Error('The operation was aborted due to timeout')],
      ['a 429 rate limit', { statusCode: 429, message: 'Rate limit exceeded' }],
      ['a 500', { statusCode: 500, message: 'Internal server error' }],
      ['an invalid key', { statusCode: 401, message: 'invalid x-api-key' }],
      ['nothing', undefined],
      ['a string', 'credit balance is too low'],
    ])('does not mistake %s for one', (_label, error) => {
      expect(isProviderCreditRefusal(error)).toBe(false);
    });

    it('never re-reads the platform cap (already a budget error) as a provider refusal', () => {
      const capped = new AiBudgetExceededError(1, {
        state: 'hard',
        dailyUsdSpent: '20',
        monthlyUsdSpent: '20',
        dailySoftUsd: '5',
        dailyHardUsd: '20',
        monthlySoftUsd: '50',
        monthlyHardUsd: '200',
      });
      expect(isProviderCreditRefusal(capped)).toBe(false);
    });
  });

  describe('AiProviderCreditRefused', () => {
    it('is a budget error (402), so every surface takes its budget path, with copy that says the provider refused', () => {
      const error = new AiProviderCreditRefused(7);
      expect(error).toBeInstanceOf(AiBudgetExceededError);
      expect(error.getStatus()).toBe(402);
      expect(error.getResponse()).toMatchObject({ detail: AI_PROVIDER_CREDIT_REFUSED_DETAIL });
      expect(error.tenantId).toBe(7);
    });
  });

  describe('mapProviderRefusal and the platform log', () => {
    it('maps a refusal to the typed error and logs a platform-paid one at error level', () => {
      const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const mapped = mapProviderRefusal({ statusCode: 402 }, 7, PLATFORM);
      expect(mapped).toBeInstanceOf(AiProviderCreditRefused);
      expect(log).toHaveBeenCalledTimes(1);
      expect(String(log.mock.calls[0][0])).toContain('platform-openrouter');
    });

    it("does not log a refusal on the workspace's own key as a platform fault", () => {
      const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      expect(mapProviderRefusal({ statusCode: 402 }, 7, TENANT)).toBeInstanceOf(AiProviderCreditRefused);
      logPlatformCreditRefusal(TENANT, 7);
      expect(log).not.toHaveBeenCalled();
    });

    it('passes any other error through unchanged, and logs nothing', () => {
      const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const error = new Error('boom');
      expect(mapProviderRefusal(error, 7, PLATFORM)).toBe(error);
      expect(log).not.toHaveBeenCalled();
    });
  });
});
