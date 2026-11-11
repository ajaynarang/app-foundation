/**
 * Web-app routes the backend links to (redirects, notification actions).
 * Paths are relative to APP_URL, the origin the web app is served from.
 */

/**
 * Where integration links land: the OAuth callback's return and the
 * integration-sync notices. The template ships no integrations screen, so this
 * is Settings; when the product adds one, point this at it.
 */
export const INTEGRATIONS_WEB_PATH = '/settings';
