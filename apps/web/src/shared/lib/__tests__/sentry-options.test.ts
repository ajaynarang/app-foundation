import {
  buildSentryOptions,
  dropConsoleBreadcrumbs,
  prepareEvent,
  SENTRY_DATA_COLLECTION,
} from '@appshore/web-core/shared/lib/sentry-options';
import { resolveAppEnvironment } from '@appshore/web-core/shared/lib/app-environment';
import { ApiError } from '@appshore/web-core/shared/lib/api';

jest.mock('@appshore/web-core/auth/session-bridge', () => ({ getSessionStore: jest.fn() }));

const DSN = 'https://key@o123.ingest.de.sentry.io/456';
const REQUEST_ID = '0b9c6a4e-3f2d-4c1b-9a8e-7d6c5b4a3f21';

describe('buildSentryOptions', () => {
  it('is null without a DSN, so Sentry stays off', () => {
    expect(buildSentryOptions(undefined)).toBeNull();
    expect(buildSentryOptions('  ')).toBeNull();
  });

  it('builds errors-only options with every data category off', () => {
    const options = buildSentryOptions(DSN);
    expect(options).toEqual(expect.objectContaining({ dsn: DSN, dataCollection: SENTRY_DATA_COLLECTION }));
    expect(options).not.toHaveProperty('tracesSampleRate');
    expect(options).not.toHaveProperty('replaysSessionSampleRate');
    expect(options).not.toHaveProperty('integrations');
    expect(SENTRY_DATA_COLLECTION).toEqual(
      expect.objectContaining({ userInfo: false, cookies: false, httpHeaders: false, urlQueryParams: false }),
    );
  });
});

describe('prepareEvent', () => {
  const event = { tags: { source: 'x' } } as never;

  it('drops an expected 4xx ApiError', () => {
    expect(prepareEvent(event, { originalException: new ApiError(404, 'gone') })).toBeNull();
  });

  it('drops an aborted fetch', () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    expect(prepareEvent(event, { originalException: abort })).toBeNull();
  });

  it('keeps a 5xx ApiError and tags it with the backend request id', () => {
    const kept = prepareEvent(event, { originalException: new ApiError(500, 'boom', undefined, REQUEST_ID) });
    expect(kept?.tags).toEqual({ source: 'x', requestId: REQUEST_ID });
  });

  it('keeps an ordinary error untouched', () => {
    expect(prepareEvent(event, { originalException: new Error('render') })).toBe(event);
  });
});

describe('dropConsoleBreadcrumbs', () => {
  it('drops console breadcrumbs and keeps the rest', () => {
    expect(dropConsoleBreadcrumbs({ category: 'console', message: 'user a@example.com' })).toBeNull();
    expect(dropConsoleBreadcrumbs({ category: 'navigation' })).toEqual({ category: 'navigation' });
  });
});

describe('resolveAppEnvironment', () => {
  it.each([
    ['production', 'production'],
    ['staging', 'staging'],
    ['development', 'development'],
    [' Staging ', 'staging'],
    [undefined, 'development'],
    ['', 'development'],
    ['sandbox', 'development'],
  ])('reads %p as %s', (raw, expected) => {
    expect(resolveAppEnvironment(raw)).toBe(expected);
  });
});
