/**
 * Web-app routes the backend links to (redirects, notification actions).
 * Paths are relative to APP_URL, the origin the web app is served from.
 */

/**
 * Where integration links land: the OAuth callback's return and the
 * integration-sync notices. The template ships no integrations screen, so this
 * is a Settings screen; when the product adds one, point this at it.
 *
 * The OAuth callback appends its outcome as a query string, so the target must
 * be a real page that shows it, never one that redirects: the web Settings
 * layout mounts the notice for every screen under /settings. A target outside
 * Settings has to mount it too. `shared/__tests__/web-routes.spec.ts` holds this.
 */
export const INTEGRATIONS_WEB_PATH = '/settings/general';
