import { resolvePostLoginRedirect } from '@appshore/web-core/shared/lib/navigation';

describe('resolvePostLoginRedirect', () => {
  const role = 'ADMIN';

  it('prefers the middleware redirect, then an internal returnTo, then the role default', () => {
    expect(resolvePostLoginRedirect({ redirect: '/settings/members', returnTo: '/ai', role })).toBe(
      '/settings/members',
    );
    expect(resolvePostLoginRedirect({ redirect: null, returnTo: '/oauth/consent?challenge=c', role })).toBe(
      '/oauth/consent?challenge=c',
    );
    expect(resolvePostLoginRedirect({ redirect: null, returnTo: null, role })).toBe('/ai');
  });

  // Login used to hand the access token, in the URL hash, to an absolute
  // returnTo on localhost or any host ending in the app domain. Nothing in
  // this repo receives that relay any more, so login only ever stays in-app.
  it.each([
    'http://localhost:3002/overview',
    'https://console.example.com/overview',
    'https://evil-example.com/steal',
    '//evil.example/steal',
  ])('ignores an absolute returnTo (%s): login never leaves this app', (returnTo) => {
    const previous = process.env.NEXT_PUBLIC_APP_DOMAIN;
    process.env.NEXT_PUBLIC_APP_DOMAIN = 'example.com';
    try {
      expect(resolvePostLoginRedirect({ redirect: null, returnTo, role })).toBe('/ai');
      expect(resolvePostLoginRedirect({ redirect: returnTo, returnTo: null, role })).toBe('/ai');
    } finally {
      process.env.NEXT_PUBLIC_APP_DOMAIN = previous;
    }
  });
});
