import { HttpException, HttpStatus } from '@nestjs/common';
import type { AiBudgetState } from '@app/shared-types';

/**
 * Thrown by `AiTelemetryService.assertBudget()` when a tenant has hit its
 * HARD AI cost cap. Maps to HTTP 402 Payment Required so HTTP callers get a
 * clean, user-friendly response; non-HTTP callers (queue workers, Mastra
 * hooks) catch it and run their surface-specific fallback.
 *
 * The `detail` is intentionally vague about exact dollar figures — those are
 * internal margin numbers, not something a tenant's dispatcher should see in
 * a toast. The super-admin view shows the real numbers.
 */
export class AiBudgetExceededError extends HttpException {
  readonly tenantId: number;
  readonly budgetState: AiBudgetState;

  constructor(tenantId: number, budgetState: AiBudgetState) {
    super(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        detail: 'Your account has reached its AI usage limit for now. Contact your administrator to raise it.',
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
    this.tenantId = tenantId;
    this.budgetState = budgetState;
  }
}
