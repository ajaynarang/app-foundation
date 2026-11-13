/**
 * The init-app rule for the Grafana-as-code catalog: it sets PROJECT and REPO_URL in
 * infra/observability/grafana-cloud/catalog/constants.mjs, from which every service name, AWS name, folder, board
 * and runbook link in the generated files derives. init-app then runs generate.mjs so the committed YAML and JSON
 * match the new name (check-scaffold-observability.mjs proves they do).
 */

export const CONSTANTS_FILE = 'infra/observability/grafana-cloud/catalog/constants.mjs';
export const GENERATE_SCRIPT = 'infra/observability/grafana-cloud/scripts/generate.mjs';

const REPO_URL_PATTERN = /^https:\/\/[A-Za-z0-9.-]+\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** A web URL for a git remote (`git@host:org/repo.git` or `https://host/org/repo(.git)`), or null. */
export function repoUrlFromRemote(remote) {
  const text = (remote ?? '').trim();
  const ssh = /^git@([^:]+):(.+?)(?:\.git)?$/.exec(text);
  const https = /^https:\/\/(?:[^@/]+@)?([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(text);
  const m = ssh ?? https;
  if (!m) return null;
  const url = `https://${m[1]}/${m[2]}`;
  return REPO_URL_PATTERN.test(url) ? url : null;
}

export function isValidRepoUrl(url) {
  return REPO_URL_PATTERN.test(url ?? '');
}

/** constants.mjs with PROJECT and, when given, REPO_URL set. Throws when a line it must set is missing. */
export function setObservabilityConstants(text, { project, repoUrl }) {
  const projectLine = /^export const PROJECT = '[^']*';$/m;
  const repoLine = /^export const REPO_URL = '[^']*';$/m;
  if (!projectLine.test(text)) throw new Error(`${CONSTANTS_FILE}: no "export const PROJECT = '…';" line`);
  if (!repoLine.test(text)) throw new Error(`${CONSTANTS_FILE}: no "export const REPO_URL = '…';" line`);
  let out = text.replace(projectLine, `export const PROJECT = '${project}';`);
  if (repoUrl) out = out.replace(repoLine, `export const REPO_URL = '${repoUrl}';`);
  return out;
}
