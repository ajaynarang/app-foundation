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

/**
 * The workspace AI settings screen (retention policy and the workspace's own AI keys), where a failing-key notice
 * sends its owner and the budget notice's "Connect a key" action points (the web app's AI Keys screen).
 */
export const AI_SETTINGS_WEB_PATH = '/settings/ai';

/**
 * Where an external agent's approval link lands: the web app's page to approve or deny one write, or enter the PIN
 * for a sensitive one. The pipeline hands it out with `approval_required`, and with a sensitive `hitl_required`.
 */
export function agentActionWebPath(token: string): string {
  return `/agent-actions/${encodeURIComponent(token)}/approve`;
}
