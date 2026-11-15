/**
 * Reads and validates `.claude/workflow.json`: the skill prefix, the reserved names, the default branch, the plans
 * folder, the CI mode and the `manualAlways` list. Every guard under tools/guards reads the file through here, so a
 * malformed file fails every guard the same way. Node built-ins only.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * True when the module at `metaUrl` (its import.meta.url) is the script node was started with. Compares file paths,
 * not URL pathnames: a pathname is percent-encoded, so a checkout under a path with a space or non-ASCII characters
 * would never match and the guard would exit 0 having checked nothing. realpath on both sides covers symlinks.
 */
export function isEntryModule(metaUrl) {
  if (!process.argv[1]) return false;
  const real = (p) => {
    try {
      return fs.realpathSync(p);
    } catch {
      return path.resolve(p);
    }
  };
  return real(process.argv[1]) === real(fileURLToPath(metaUrl));
}

/** The repository root for a guard module under tools/guards: two folders above the module's own file. */
export const repoRootOf = (metaUrl) => path.resolve(path.dirname(fileURLToPath(metaUrl)), '..', '..');

export const WORKFLOW_FILE = '.claude/workflow.json';
export const CI_MODES = ['manual', 'on-push'];
export const PREFIX_PATTERN = /^[a-z][a-z0-9]{1,11}$/;

/** Returns a list of problems with a parsed workflow config; empty when it is valid. */
export function validateWorkflowConfig(cfg) {
  const errors = [];
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return ['the file must hold one JSON object'];
  if (typeof cfg.skillPrefix !== 'string' || !PREFIX_PATTERN.test(cfg.skillPrefix))
    errors.push('skillPrefix must be 2 to 12 lowercase letters or digits, starting with a letter');
  if (!Array.isArray(cfg.reservedNames) || cfg.reservedNames.some((n) => typeof n !== 'string' || !n))
    errors.push('reservedNames must be a list of names');
  else if (cfg.reservedNames.includes(cfg.skillPrefix)) errors.push('skillPrefix must not be a reserved name');
  if (typeof cfg.defaultBranch !== 'string' || !cfg.defaultBranch) errors.push('defaultBranch must be a branch name');
  if (
    !cfg.plans ||
    typeof cfg.plans.folder !== 'string' ||
    !cfg.plans.folder ||
    path.isAbsolute(cfg.plans.folder) ||
    typeof cfg.plans.tracked !== 'boolean'
  )
    errors.push('plans must be { "folder": "<repo-relative path>", "tracked": true | false }');
  if (!CI_MODES.includes(cfg.ci)) errors.push(`ci must be one of: ${CI_MODES.join(', ')}`);
  if (!Array.isArray(cfg.manualAlways) || cfg.manualAlways.some((n) => typeof n !== 'string' || !n))
    errors.push('manualAlways must be a list of workflow file names');
  if (!(cfg.githubProject === null || (Number.isInteger(cfg.githubProject) && cfg.githubProject > 0)))
    errors.push('githubProject must be a project number or null');
  return errors;
}

/** Loads `<root>/.claude/workflow.json`; throws one Error naming every problem. */
export function loadWorkflowConfig(root) {
  const file = path.join(root, WORKFLOW_FILE);
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`${WORKFLOW_FILE}: cannot read it (${e.code === 'ENOENT' ? 'missing' : e.message})`);
  }
  const errors = validateWorkflowConfig(cfg);
  if (errors.length) throw new Error(`${WORKFLOW_FILE}: ${errors.join('; ')}`);
  return cfg;
}
