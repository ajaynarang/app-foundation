/** What Resend's `emails.send` resolves to: it reports API failures in `error` instead of throwing. */
export interface ResendSendResult {
  error?: { name?: string; message?: string; statusCode?: number | null } | null;
}

/**
 * Resend accepted the call but refused the email (sender domain, quota, validation). Carries the error name and HTTP
 * status only: Resend's message can echo the recipient address.
 */
export class ResendRefusedError extends Error {
  constructor(
    readonly resendError: string,
    readonly status: number | undefined,
  ) {
    super(`Resend refused the email: ${resendError} (status ${status ?? 'unknown'})`);
    this.name = 'ResendRefusedError';
  }
}

/**
 * Turn a Resend refusal into a thrown `ResendRefusedError`. Without this a refused email returns normally, so it is
 * logged and ledgered as sent. `EmailService.sendEmail` catches it with every other send failure, counts it once in
 * `app_outbound_failed{channel="email"}` and rethrows, so the delivery ledger records `FAILED`.
 */
export function observeResendResult(result: ResendSendResult | null | undefined): void {
  const error = result?.error;
  if (!error) return;
  throw new ResendRefusedError(error.name ?? 'unknown_error', error.statusCode ?? undefined);
}
