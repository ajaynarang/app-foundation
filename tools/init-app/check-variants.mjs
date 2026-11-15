#!/usr/bin/env node
/**
 * check-variants — prove that a product scaffolded from this template works with and without each optional
 * feature, under its own skill prefix, with or without git. Root script: `pnpm verify:scaffold`. CI job:
 * `scaffold-variants` in .github/workflows/ci.yml (manual).
 *
 * For each variant: copy the tree (tracked and untracked, not ignored) to a temp folder; for `defaults`, `git init`
 * it; run `init-app --name <name> … --yes --force`; check what init-app wrote (scaffoldProblems: the prefix, reserved
 * names and plans in .claude/workflow.json, the .gitignore plans line, no `verified:` line, each feature manifest
 * fully kept or fully removed, TENANCY_MODE), the regenerated alert catalog (check-scaffold-observability.mjs) and the
 * runway's starter check (runwayStarterCheck); install; build the foundation packages; regenerate the OpenAPI
 * documents and the RBAC matrix; type-check the backend, apps/web, packages/test-utils and tests/; migrate; run the
 * backend unit and architecture specs; then `pnpm guards`, `pnpm test:guards` and `pnpm test:hooks`, and search for
 * every template skill and agent name, read before the rename (none may be left). Without Desk, the copy is also
 * searched for `inngest` and `domains/desk` (any case): every hit must be on
 * tools/init-app/features/desk.residue.json, and every entry there must still match.
 *
 *   defaults        `--name scaffold-check`, every default (Desk off, mobile on, prefix sc, plans tracked), inside a
 *                   fresh `git init` on the default branch, with the scaffold as its first commit.
 *   lean            `--name scaffoldcheck --mobile no --desk no --tenancy single --skill-prefix zz`, no .git at all.
 *   desk-untracked  `--name scaffoldcheck --desk yes --plans untracked`: Desk on, a one-word name longer than 8
 *                   characters (prefix sca), no .git.
 *
 *   node tools/init-app/check-variants.mjs                 # every variant
 *   node tools/init-app/check-variants.mjs --variant lean
 *   node tools/init-app/check-variants.mjs --keep          # leave the temp copies for a look
 *
 * Every step runs with git's hook variables (GIT_DIR and the rest of `git rev-parse --local-env-vars`) cleared and
 * GIT_CEILING_DIRECTORIES set above the copy, so a run from a git hook cannot reach the repository the hook belongs to.
 * The backend specs read DATABASE_URL and REDIS_URL, as in `pnpm verify`. It takes minutes, so it is not in the
 * pre-push hook: run it before a pull request that touches tools/init-app/, apps/backend/src/platform-glue/features/,
 * a skill or agent name, a file a manifest names, the residue list, or a Desk file outside the Desk folder, and paste
 * the last line into the pull request.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { featurePresence, listFeatureNames, loadManifest } from './apply-feature.mjs';
import { walkRepo } from './repo-walk.mjs';
import { checkScaffoldObservability } from './check-scaffold-observability.mjs';
import { oldSkillNameHits, workflowSkillNames } from './skill-prefix.mjs';
import { verifiedLineFiles } from './scaffold-text.mjs';
import { validateWorkflowConfig } from '../guards/workflow-config.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
export const SEARCH_STRINGS = ['inngest', 'domains/desk'];
const TEMPLATE_DEFAULT_BRANCH = JSON.parse(
  fs.readFileSync(path.join(ROOT, '.claude/workflow.json'), 'utf8'),
).defaultBranch;

/** `expect` is what the scaffold must hold afterwards; `git` is whether the copy is a fresh git repository. */
export const VARIANTS = {
  defaults: {
    name: 'scaffold-check',
    args: [],
    git: true,
    expect: { desk: false, mobile: true, prefix: 'sc', plansTracked: true, tenancy: 'multi' },
  },
  lean: {
    name: 'scaffoldcheck',
    args: ['--mobile', 'no', '--desk', 'no', '--tenancy', 'single', '--skill-prefix', 'zz'],
    git: false,
    expect: { desk: false, mobile: false, prefix: 'zz', plansTracked: true, tenancy: 'single' },
  },
  'desk-untracked': {
    name: 'scaffoldcheck',
    args: ['--desk', 'yes', '--plans', 'untracked'],
    git: false,
    expect: { desk: true, mobile: true, prefix: 'sca', plansTracked: false, tenancy: 'multi' },
  },
};

// git's own list (`git rev-parse --local-env-vars`) is read at run time; this is the floor when git is absent.
const GIT_LOCAL_ENV_FLOOR = [
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_COMMON_DIR',
  'GIT_CONFIG',
  'GIT_CONFIG_COUNT',
  'GIT_CONFIG_PARAMETERS',
  'GIT_DIR',
  'GIT_GRAFT_FILE',
  'GIT_IMPLICIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_INTERNAL_SUPER_PREFIX',
  'GIT_NAMESPACE',
  'GIT_NO_REPLACE_OBJECTS',
  'GIT_OBJECT_DIRECTORY',
  'GIT_PREFIX',
  'GIT_REPLACE_REF_BASE',
  'GIT_SHALLOW_FILE',
  'GIT_WORK_TREE',
];

function gitLocalEnvVars() {
  try {
    return execFileSync('git', ['rev-parse', '--local-env-vars'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * `env` without git's repository-local variables, so git inside a scaffold copy never resolves to the repository a
 * hook was started from (a pre-push hook in a linked worktree exports GIT_DIR). With `ceiling`, git also stops looking
 * for a repository above that folder.
 */
export function isolatedGitEnv(env, { ceiling, localVars = gitLocalEnvVars() } = {}) {
  const out = { ...env };
  for (const k of new Set([...GIT_LOCAL_ENV_FLOOR, ...localVars])) delete out[k];
  if (ceiling) out.GIT_CEILING_DIRECTORIES = ceiling;
  return out;
}

/** The git toplevel git resolves from `dir` under `env`, or null when `dir` is in no repository (or git is absent). */
export function gitToplevel(dir, env) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: dir,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * What is wrong with a scaffold `dir` made by init-app for `variant`; empty when it holds. Reads the disk only, so it
 * runs before install.
 */
export function scaffoldProblems(dir, variant, { manifestsDir } = {}) {
  const { name, expect } = variant;
  const problems = [];
  const read = (rel) => (fs.existsSync(path.join(dir, rel)) ? fs.readFileSync(path.join(dir, rel), 'utf8') : null);

  let cfg = null;
  try {
    cfg = JSON.parse(read('.claude/workflow.json'));
  } catch (e) {
    problems.push(`.claude/workflow.json: ${e.message}`);
  }
  if (cfg) {
    for (const e of validateWorkflowConfig(cfg)) problems.push(`.claude/workflow.json: ${e}`);
    if (cfg.skillPrefix !== expect.prefix)
      problems.push(`.claude/workflow.json: skillPrefix is "${cfg.skillPrefix}", expected "${expect.prefix}"`);
    if (cfg.plans?.tracked !== expect.plansTracked)
      problems.push(`.claude/workflow.json: plans.tracked is ${cfg.plans?.tracked}, expected ${expect.plansTracked}`);
    for (const r of [`${name}-backend`, `${name}-inngest`])
      if (!cfg.reservedNames?.includes(r)) problems.push(`.claude/workflow.json: reservedNames lacks ${r}`);
    if (cfg.reservedNames?.some((r) => r.startsWith('app-')))
      problems.push('.claude/workflow.json: reservedNames still holds a template name (app-…)');
    const names = workflowSkillNames(dir, cfg.skillPrefix);
    const all = [
      ...fs.readdirSync(path.join(dir, '.claude/skills')),
      ...fs.readdirSync(path.join(dir, '.claude/agents')).map((f) => f.replace(/\.md$/, '')),
    ];
    for (const n of all.filter((n) => !names.includes(n)))
      problems.push(`.claude: ${n} lacks the prefix ${cfg.skillPrefix}-`);
    const ignoresPlans = (read('.gitignore') ?? '')
      .split('\n')
      .some((l) => l.trim().replace(/^\/|\/$/g, '') === cfg.plans.folder);
    if (ignoresPlans === expect.plansTracked)
      problems.push(`.gitignore: ${ignoresPlans ? 'still ignores' : 'no longer ignores'} ${cfg.plans.folder}`);
  }
  for (const rel of verifiedLineFiles(dir)) problems.push(`${rel}: still carries the template's verified: line`);
  const mode = (read('apps/backend/.env.example') ?? '').match(/^TENANCY_MODE=(.*)$/m)?.[1];
  if (mode !== expect.tenancy)
    problems.push(`apps/backend/.env.example: TENANCY_MODE=${mode}, expected ${expect.tenancy}`);

  for (const feature of listFeatureNames(manifestsDir)) {
    if (!(feature in expect)) {
      problems.push(`variant does not say whether "${feature}" is kept`);
      continue;
    }
    const { present, missing } = featurePresence(dir, loadManifest(feature, manifestsDir));
    if (expect[feature]) {
      for (const g of [...missing.paths, ...missing.markers, ...missing.jsonEntries])
        problems.push(`kept ${feature}, but init-app removed ${g}`);
    } else {
      for (const g of [...present.paths, ...present.markers, ...present.jsonEntries, ...present.allowlistKeys])
        problems.push(`dropped ${feature}, but ${g} is left`);
    }
  }
  return problems;
}

/** Every (file, search string) pair in the tree, lower-cased match. */
export function residueHits(root) {
  const hits = [];
  for (const { abs, rel } of walkRepo(root)) {
    let text;
    try {
      text = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    if (text.includes('\0')) continue;
    const lower = text.toLowerCase();
    for (const s of SEARCH_STRINGS) if (lower.includes(s)) hits.push({ file: rel, match: s });
  }
  return hits;
}

/**
 * The runway skill refuses to run in the starter. After init-app has renamed the template to the product, that check
 * must not name the product (it would then refuse the product), and must point at TEMPLATE_NAME in init-app.mjs, which
 * the rename walker never rewrites. Returns the problems, empty when the check holds.
 */
export function runwayStarterCheck(root, name) {
  const prefix = JSON.parse(fs.readFileSync(path.join(root, '.claude/workflow.json'), 'utf8')).skillPrefix;
  const rel = `.claude/skills/${prefix}-runway/SKILL.md`;
  const text = fs.readFileSync(path.join(root, rel), 'utf8');
  const start = text.indexOf('**Not in the starter itself.**');
  if (start < 0) return [`${rel}: no "Not in the starter itself" check`];
  const rest = text.slice(start);
  const end = rest.search(/\n(?:- \*\*|#)/);
  const check = end < 0 ? rest : rest.slice(0, end);
  const problems = [];
  if (check.includes(name)) problems.push(`${rel}: the starter check names the product "${name}"`);
  if (!check.includes('`TEMPLATE_NAME`') || !check.includes('`tools/init-app/init-app.mjs`'))
    problems.push(
      `${rel}: the starter check does not compare against \`TEMPLATE_NAME\` in tools/init-app/init-app.mjs`,
    );
  return problems;
}

/** Reads the residue list and checks its shape: every entry names a file, one bare search string and a reason. */
export function loadResidue(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const entries = raw.entries ?? [];
  for (const e of entries) {
    if (!e.file || !SEARCH_STRINGS.includes(e.match) || !e.reason) {
      throw new Error(
        `${file}: bad entry ${JSON.stringify(e)} (needs file, match ∈ ${SEARCH_STRINGS.join(' | ')}, reason)`,
      );
    }
  }
  return entries;
}

/** Hits that are not on the list, and entries that no longer match. */
export function compareResidue(hits, entries) {
  const key = (x) => `${x.file} :: ${x.match}`;
  const allowed = new Set(entries.map(key));
  const found = new Set(hits.map(key));
  return {
    unlisted: hits.filter((h) => !allowed.has(key(h))).map(key),
    stale: entries.filter((e) => !found.has(key(e))).map(key),
  };
}

/** Copies the tree (tracked and untracked, not ignored) of the repo at `root` into `dest`. Returns the file count. */
export function copyTree(root, dest) {
  const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  let n = 0;
  for (const rel of out.split('\0').filter(Boolean)) {
    const from = path.join(root, rel);
    const st = fs.lstatSync(from, { throwIfNoEntry: false });
    if (!st || st.isDirectory()) continue; // deleted in the working tree, or a submodule
    const to = path.join(dest, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    if (st.isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(from), to);
    else fs.copyFileSync(from, to);
    n++;
  }
  return n;
}

function makeRunner(variant, cwd, env, { quiet = false } = {}) {
  return (step, cmd, args, extraEnv = {}) => {
    if (!quiet) console.log(`\n── ${variant}: ${step} ──\n$ ${[cmd, ...args].join(' ')}`);
    const r = spawnSync(cmd, args, {
      cwd,
      stdio: quiet ? 'pipe' : 'inherit',
      encoding: 'utf8',
      env: { ...env, ...extraEnv },
    });
    if (r.status !== 0) {
      if (quiet) console.error(`${r.stdout ?? ''}${r.stderr ?? ''}`);
      const err = new Error(`${variant}: ${step}`);
      err.step = `${variant}: ${step}`;
      throw err;
    }
  };
}

const fail = (step, lines = []) => {
  for (const l of lines) console.error(`  ${l}`);
  throw Object.assign(new Error(step), { step });
};

/** A new, empty temp folder for a variant, by its real path (macOS's tmpdir is a symlink). */
export const variantDir = (name) => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `scaffold-${name}-`)));

/**
 * Copies the repo into `dir`, makes it a fresh git repository when the variant says so, runs init-app and checks what
 * it wrote. Returns the runner for the later steps.
 */
export function prepareVariant(name, dir, { root = ROOT, quiet = false } = {}) {
  const variant = VARIANTS[name];
  const env = isolatedGitEnv({ ...process.env, CI: 'true', HUSKY: '0' }, { ceiling: path.dirname(dir) });
  const run = makeRunner(name, dir, env, { quiet });
  const log = quiet ? () => {} : console.log;
  log(`\n══ ${name}: ${dir} ══`);
  log(`  copied ${copyTree(root, dir)} files`);
  if (variant.git) {
    run('git init', 'git', ['init', '-q', '-b', TEMPLATE_DEFAULT_BRANCH]);
    const top = gitToplevel(dir, env);
    if (!top || fs.realpathSync(top) !== dir)
      fail(`${name}: git init`, [`git resolves to ${top}, not the copy ${dir}`]);
  } else if (gitToplevel(dir, env) !== null) {
    fail(`${name}: no git`, [`git still finds a repository from ${dir}`]);
  }
  run('init-app', process.execPath, [
    'tools/init-app/init-app.mjs',
    '--name',
    variant.name,
    ...variant.args,
    '--yes',
    '--force',
  ]);
  if (variant.git) {
    // A new product's first commit: the hooks and guards then see tracked files and a default branch, as in a product.
    run('git add', 'git', ['add', '-A']);
    run('first commit', 'git', [
      '-c',
      'user.name=scaffold-check',
      '-c',
      'user.email=scaffold-check@example.com',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-q',
      '--no-verify',
      '-m',
      'Scaffold from the template',
    ]);
  }
  const problems = scaffoldProblems(dir, variant);
  if (problems.length) fail(`${name}: what init-app wrote`, problems);
  log(`  init-app wrote the prefix, reserved names, plans choice, tenancy and feature choices the variant asked for.`);
  return run;
}

function runVariant(name, { keep }) {
  const variant = VARIANTS[name];
  // Captured before the rename: the template's own skill and agent names, which must all be gone afterwards.
  const templatePrefix = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude/workflow.json'), 'utf8')).skillPrefix;
  const oldNames = workflowSkillNames(ROOT, templatePrefix);
  const dir = variantDir(name);
  try {
    const run = prepareVariant(name, dir);

    // The alert catalog is renamed and regenerated by init-app; its own checks need no install.
    console.log(`\n── ${name}: observability catalog ──`);
    const observability = checkScaffoldObservability(dir, { name: variant.name });
    if (observability.length) fail(`${name}: observability catalog`, observability);
    console.log('  the Grafana-as-code catalog is regenerated in the new name and validates.');

    const runway = runwayStarterCheck(dir, variant.name);
    if (runway.length) fail(`${name}: runway starter check`, runway);
    console.log('  the runway still tells the product from the starter.');

    run('install', 'pnpm', ['install', '--no-frozen-lockfile', '--prefer-offline']);
    run('build foundation packages', 'pnpm', [
      'exec',
      'turbo',
      'run',
      'build',
      '--filter=@app/backend^...',
      '--filter=@app/web^...',
      '--output-logs=errors-only',
    ]);
    run('regenerate OpenAPI', 'pnpm', ['--filter', '@app/backend', 'openapi:generate']);
    run('regenerate RBAC matrix', 'pnpm', ['--filter', '@app/qa', 'generate:rbac']);
    run('type-check backend', 'pnpm', ['--filter', '@app/backend', 'type-check']);
    run('type-check web', 'pnpm', ['--filter', '@app/web', 'type-check']);
    run('type-check test-utils', 'pnpm', ['--filter', '@app/test-utils', 'type-check']);
    run('type-check tests/', 'pnpm', ['--filter', '@app/qa', 'exec', 'tsc', '-p', 'tsconfig.json', '--noEmit']);
    // The template's migrations are the same with or without Desk (its tables stay), so this is a no-op on a database
    // the repo already migrated, and makes a fresh CI database ready for the integration specs.
    run('migrate', 'pnpm', ['--filter', '@appshore/db', 'prisma:migrate:deploy']);
    run('backend unit and architecture specs', 'pnpm', ['--filter', '@app/backend', 'test']);

    // The workflow guards, under the product's prefix, with or without git.
    run('guards', 'pnpm', ['guards']);
    run('guard tests', 'pnpm', ['test:guards']);
    run('hook fixture tests', 'pnpm', ['test:hooks']);

    console.log(`\n── ${name}: old skill and agent names ──`);
    const prefix = JSON.parse(fs.readFileSync(path.join(dir, '.claude/workflow.json'), 'utf8')).skillPrefix;
    if (prefix !== templatePrefix) {
      const hits = oldSkillNameHits(dir, oldNames);
      if (hits.length)
        fail(
          `${name}: old skill names`,
          hits.map((h) => `still names a template skill: ${h}`),
        );
      console.log(`  none of the ${oldNames.length} template skill and agent names is left.`);
    }

    if (!variant.expect.desk) {
      console.log(`\n── ${name}: residue search ──`);
      const entries = loadResidue(path.join(HERE, 'features', 'desk.residue.json'));
      const { unlisted, stale } = compareResidue(residueHits(dir), entries);
      if (unlisted.length || stale.length)
        fail(`${name}: residue search`, [
          ...unlisted.map((u) => `not on desk.residue.json: ${u}`),
          ...stale.map((s) => `stale entry on desk.residue.json (no longer matches): ${s}`),
        ]);
      console.log(
        `  ${entries.length} residue entries, all matched; nothing else names ${SEARCH_STRINGS.join(' or ')}.`,
      );
    }
  } finally {
    if (keep) console.log(`  kept ${dir}`);
    else fs.rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  const { values } = parseArgs({
    options: { variant: { type: 'string', multiple: true }, keep: { type: 'boolean', default: false } },
  });
  const names = values.variant ?? Object.keys(VARIANTS);
  for (const n of names)
    if (!VARIANTS[n]) throw new Error(`Unknown variant "${n}" (known: ${Object.keys(VARIANTS).join(', ')})`);
  const started = Date.now();
  const elapsed = () => `${Math.round((Date.now() - started) / 1000)}s`;
  try {
    for (const n of names) runVariant(n, { keep: values.keep });
  } catch (e) {
    console.log(`\nverify:scaffold: FAIL at "${e.step ?? e.message}" (${elapsed()})`);
    process.exit(1);
  }
  console.log(`\nverify:scaffold: PASS (${names.join(', ')}) (${elapsed()})`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
