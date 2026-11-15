import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readOAuthReturn, withoutOAuthReturn } from '../oauth-return';
import { withQuery } from '@/shared/lib/with-query';

const params = (query: string) => new URLSearchParams(query);

describe('readOAuthReturn', () => {
  it('reads a successful connection and names the vendor', () => {
    expect(readOAuthReturn(params('oauth=connected&vendor=QUICKBOOKS'))).toEqual({
      status: 'connected',
      title: 'Quickbooks connected',
    });
  });

  it('reads a failed connection and names the vendor', () => {
    expect(readOAuthReturn(params('oauth=error&vendor=HUB_SPOT'))).toEqual({
      status: 'error',
      title: 'Could not connect Hub Spot',
      description: 'The connection was not completed. Please try again.',
    });
  });

  it.each(['unknown', '', '<script>alert(1)</script>', 'a'.repeat(60)])(
    'falls back to a generic name when the vendor is %p',
    (vendor) => {
      const query = new URLSearchParams({ oauth: 'error', vendor });
      expect(readOAuthReturn(query)?.title).toBe('Could not connect the integration');
    },
  );

  it('falls back to a generic name when no vendor is given', () => {
    expect(readOAuthReturn(params('oauth=connected'))?.title).toBe('Integration connected');
  });

  it.each(['', 'tab=1', 'oauth=', 'oauth=pending', 'vendor=QUICKBOOKS'])('ignores a URL without a result (%p)', (q) => {
    expect(readOAuthReturn(params(q))).toBeNull();
  });
});

describe('withoutOAuthReturn', () => {
  it('drops the result keys and keeps everything else', () => {
    expect(withoutOAuthReturn('/settings/general', params('tab=2&oauth=connected&vendor=X'))).toBe(
      '/settings/general?tab=2',
    );
    expect(withoutOAuthReturn('/settings/general', params('oauth=error&vendor=X'))).toBe('/settings/general');
  });
});

describe('withQuery', () => {
  it('carries the query string onto the redirect target', () => {
    expect(withQuery('/settings/general', { oauth: 'connected', vendor: 'QUICKBOOKS' })).toBe(
      '/settings/general?oauth=connected&vendor=QUICKBOOKS',
    );
  });

  it('keeps repeated keys and skips empty ones', () => {
    expect(withQuery('/x', { a: ['1', '2'], b: undefined })).toBe('/x?a=1&a=2');
    expect(withQuery('/x', {})).toBe('/x');
  });
});

describe('Settings shows the result wherever the return lands', () => {
  const app = join(__dirname, '../../../../app/settings');

  it('the Settings layout mounts the notice, so every Settings page shows it', () => {
    expect(readFileSync(join(app, 'layout.tsx'), 'utf8')).toContain('<OAuthReturnNotice />');
  });

  it('/settings forwards its query string when it redirects', () => {
    const page = readFileSync(join(app, 'page.tsx'), 'utf8');
    expect(page).toContain('withQuery(');
    expect(page).toContain('searchParams');
  });
});
