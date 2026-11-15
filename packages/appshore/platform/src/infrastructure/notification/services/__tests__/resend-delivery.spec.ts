import { observeResendResult, ResendRefusedError } from '../resend-delivery';

describe('observeResendResult', () => {
  it('returns quietly for an accepted email', () => {
    expect(() => observeResendResult({ error: null })).not.toThrow();
    expect(() => observeResendResult(undefined)).not.toThrow();
  });

  it('throws ResendRefusedError when Resend refused the email (it reports refusals in `error`, not by throwing)', () => {
    expect(() => observeResendResult({ error: { name: 'validation_error', message: 'bad', statusCode: 422 } })).toThrow(
      ResendRefusedError,
    );
  });

  it("carries the error name and status, never Resend's message (it can echo the address)", () => {
    try {
      observeResendResult({ error: { name: 'validation_error', message: 'bad to@example.com', statusCode: 422 } });
      throw new Error('expected a throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ResendRefusedError);
      const refused = err as ResendRefusedError;
      expect(refused).toMatchObject({ resendError: 'validation_error', status: 422 });
      expect(`${refused.message} ${refused.stack}`).not.toContain('to@example.com');
    }
  });

  it('names an unknown refusal', () => {
    expect(() => observeResendResult({ error: {} })).toThrow(/unknown_error/);
  });
});
