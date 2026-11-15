/**
 * Where a notification's action link opens in the web app.
 *
 * Notices stored while a separate console app existed carry `console:<path>`.
 * Those paths were never web routes, so each one opens Settings, the screen
 * that took over what the console did. Every other link is a web route already.
 */
const RETIRED_APP_LINK_PREFIX = 'console:';
const RETIRED_APP_LINK_HOME = '/settings';

export function resolveNotificationLink(actionUrl: string): string {
  return actionUrl.startsWith(RETIRED_APP_LINK_PREFIX) ? RETIRED_APP_LINK_HOME : actionUrl;
}
