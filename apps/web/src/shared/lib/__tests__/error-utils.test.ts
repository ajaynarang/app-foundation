import { ApiError } from '@appshore/web-core/shared/lib/api';
import { extractErrorCode, extractErrorMessage, extractFieldErrors } from '@appshore/web-core/shared/lib/error-utils';

jest.mock('@appshore/web-core/shared/lib/sentry', () => ({ captureError: jest.fn() }));

/** The error envelope as the web client receives it. */
const apiError = (status: number, body: Record<string, unknown>) =>
  new ApiError(status, String(body.detail ?? ''), { statusCode: status, ...body });

describe('error-utils reads the error envelope', () => {
  it('shows the detail of a 403 the backend explained, not the generic copy, and reads its code', () => {
    const error = apiError(403, { code: 'FEATURE_DISABLED', detail: 'This feature is currently unavailable.' });
    expect(extractErrorMessage(error)).toBe('This feature is currently unavailable.');
    expect(extractErrorCode(error)).toBe('FEATURE_DISABLED');
  });

  it("keeps the generic 403 copy over Nest's bare default", () => {
    expect(extractErrorMessage(apiError(403, { code: 'FORBIDDEN', detail: 'Forbidden resource' }))).toMatch(
      /permission/,
    );
    expect(extractErrorMessage(apiError(403, { code: 'FORBIDDEN' }))).toMatch(/permission/);
  });

  it('a 429 the backend explained says when; the throttler\u2019s bare text keeps the generic copy', () => {
    const explained = 'A code was sent 3 minutes ago \u2014 wait before asking for another';
    expect(extractErrorMessage(apiError(429, { code: 'RATE_LIMITED', detail: explained }))).toBe(explained);
    expect(
      extractErrorMessage(apiError(429, { code: 'RATE_LIMITED', detail: 'ThrottlerException: Too Many Requests' })),
    ).toBe('Too many requests. Please wait a moment and try again.');
    // The client's own stand-in when the 429 body was not our envelope (a proxy page).
    expect(extractErrorMessage(apiError(429, { detail: 'Request failed with status 429' }))).toBe(
      'Too many requests. Please wait a moment and try again.',
    );
  });

  it('a 409 is any state conflict: the detail says which, and the fallback does not claim a duplicate', () => {
    expect(extractErrorMessage(apiError(409, { code: 'INVALID_STATE', detail: 'This ticket is already closed' }))).toBe(
      'This ticket is already closed',
    );
    expect(extractErrorMessage(apiError(409, { code: 'STALE' }))).toMatch(/Refresh/);
    expect(extractErrorMessage(apiError(409, { code: 'STALE' }))).not.toMatch(/already exists/);
  });

  it('never reads a `message` key: the envelope has none', () => {
    expect(extractErrorMessage(apiError(400, { message: 'legacy copy' }))).toBe('Request failed. Please try again.');
  });

  it('returns fieldErrors from a 400', () => {
    const error = apiError(400, {
      code: 'VALIDATION_FAILED',
      detail: 'Unknown sort option',
      fieldErrors: { sort: 'Unknown sort option' },
    });
    expect(extractFieldErrors(error)).toEqual({ sort: 'Unknown sort option' });
  });
});
