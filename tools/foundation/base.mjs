/**
 * Rebuilds the template as a product received it: the base commit (or the tag of the base version), checked out into
 * a temp folder, then that version's own init-app run with the answers the product recorded. The renames, the skill
 * prefix and the removed optional features are then the same on both sides, with no second copy of init-app's rules.
 * Reads the template with the developer's own git access; writes only inside the temp folder.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const INIT_APP = 'tools/init-app/init-app.mjs';
const FLAGS = [
  ['name', 'name'],
  ['displayName', 'display-name'],
  ['scope', 'scope'],
  ['db', 'db'],
  ['tenancy', 'tenancy'],
  ['mobile', 'mobile'],
  ['desk', 'desk'],
  ['skillPrefix', 'skill-prefix'],
  ['plans', 'plans'],
  ['repoUrl', 'repo-url'],
];

/** The init-app command line that reproduces a recorded scaffold. */
export function initAppArgs(scaffold) {
  const args = [];
  for (const [key, flag] of FLAGS) if (scaffold[key]) args.push(`--${flag}`, scaffold[key]);
  return [...args, '--yes', '--force'];
}

/** What to fetch, most exact first: the recorded commit, then the version's tag. */
export function baseRefs(base) {
  return [base.commit, `v${base.version}`].filter(Boolean);
}

/** git with the caller's repository variables cleared, so a run from a hook never reaches the hook's repository. */
function git(cwd, args) {
  const env = { ...process.env };
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_PREFIX']) delete env[k];
  env.GIT_CEILING_DIRECTORIES = path.dirname(cwd);
  return execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** A local folder is fetched by its absolute path; anything else is a URL git already understands. */
export function resolveSource(source, cwd = process.cwd()) {
  const local = path.resolve(cwd, source);
  return fs.existsSync(local) ? local : source;
}

/**
 * Returns `{ dir, ref }`: a temp folder holding the base as scaffolded, and the ref that was fetched. The caller
 * removes `dir`. Throws with the git or init-app output when the base cannot be fetched or scaffolded.
 */
export function rebuildBase({ manifest, source }) {
  if (!manifest.base || !manifest.scaffold) throw new Error('no base recorded: this is the template itself');
  const from = resolveSource(source ?? manifest.template);
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'foundation-base-')));
  try {
    git(dir, ['init', '-q']);
    let ref = null;
    const errors = [];
    for (const candidate of baseRefs(manifest.base)) {
      try {
        git(dir, ['fetch', '-q', '--depth', '1', from, candidate]);
        ref = candidate;
        break;
      } catch (e) {
        errors.push(
          `${candidate}: ${String(e.stderr || e.message)
            .trim()
            .split('\n')
            .pop()}`,
        );
      }
    }
    if (!ref)
      throw new Error(
        `could not fetch the base from ${from}\n  ${errors.join('\n  ')}\n` +
          '  Pass --from <path or url> to read the template from somewhere else.',
      );
    git(dir, ['checkout', '-q', 'FETCH_HEAD']);
    fs.rmSync(path.join(dir, '.git'), { recursive: true, force: true });
    if (!fs.existsSync(path.join(dir, INIT_APP))) throw new Error(`${ref} has no ${INIT_APP}`);
    try {
      execFileSync(process.execPath, [INIT_APP, ...initAppArgs(manifest.scaffold)], {
        cwd: dir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(dir), HUSKY: '0' },
      });
    } catch (e) {
      throw new Error(`init-app failed on the base (${ref}):\n${e.stdout ?? ''}${e.stderr ?? e.message}`);
    }
    return { dir, ref };
  } catch (e) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw e;
  }
}
