/**
 * Level 0 of docs/observability.md: with no SENTRY_DSN the entry points' instrument import initialises nothing, and
 * reportError is a silent no-op. Uses the real SDK, not a mock, so a change that initialises Sentry without a key
 * fails here.
 */
describe('error-tracking instrument with no SENTRY_DSN', () => {
  const saved = process.env.SENTRY_DSN;

  beforeAll(() => {
    delete process.env.SENTRY_DSN;
  });

  afterAll(() => {
    if (saved !== undefined) process.env.SENTRY_DSN = saved;
  });

  it('initialises nothing, and reportError neither throws nor captures', () => {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Sentry = require('@sentry/nestjs') as typeof import('@sentry/nestjs');
      const capture = jest.spyOn(Sentry, 'captureException');

      require('../instrument');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { reportError, reportServerError } = require('../sentry') as typeof import('../sentry');

      expect(Sentry.isInitialized()).toBe(false);
      expect(() => reportError(new Error('boom'))).not.toThrow();
      expect(() => reportServerError(new Error('boom'), 500)).not.toThrow();
      expect(capture).not.toHaveBeenCalled();
    });
  });
});
