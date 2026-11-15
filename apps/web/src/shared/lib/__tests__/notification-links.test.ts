import { resolveNotificationLink } from '../notification-links';

describe('resolveNotificationLink', () => {
  // Notices stored while a separate console app existed carry `console:<path>`.
  // Those paths were never web routes, so every one of them opens Settings.
  it.each(['console:/integrations/connections', 'console:/overview', 'console:'])(
    'maps the legacy link %s to Settings',
    (actionUrl) => {
      expect(resolveNotificationLink(actionUrl)).toBe('/settings');
    },
  );

  it.each(['/settings/billing', '/settings/general?tab=1', '/ai', '/admin/tenants'])(
    'leaves the web route %s as it is',
    (actionUrl) => {
      expect(resolveNotificationLink(actionUrl)).toBe(actionUrl);
    },
  );

  it('only treats the prefix as legacy, not a path that merely contains the word', () => {
    expect(resolveNotificationLink('/console:/x')).toBe('/console:/x');
    expect(resolveNotificationLink('/consoles/1')).toBe('/consoles/1');
  });
});
