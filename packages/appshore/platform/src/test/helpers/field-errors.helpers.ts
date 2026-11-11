import { BadRequestException } from '@nestjs/common';

/**
 * The `fieldErrors` of the 400 a call earned. Fails the test when the call succeeds or throws anything but a 400,
 * and returns `{}` for a 400 that names no field, so `toHaveProperty('limit')` reads as "a 400 that blames limit".
 */
export async function fieldErrorsOf(call: Promise<unknown> | (() => unknown)): Promise<Record<string, string>> {
  let error: unknown;
  try {
    await (typeof call === 'function' ? call() : call);
  } catch (caught) {
    error = caught;
  }
  if (!(error instanceof BadRequestException)) {
    throw new Error(`Expected a 400, got ${error === undefined ? 'no error' : String(error)}`);
  }
  const body = error.getResponse();
  return (typeof body === 'object' && (body as { fieldErrors?: Record<string, string> }).fieldErrors) || {};
}
