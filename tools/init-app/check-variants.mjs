#!/usr/bin/env node
/**
 * check-variants — prove that a product scaffolded from this template works with and without each optional
 * feature. Root script: `pnpm verify:scaffold`. CI job: `scaffold-variants` in .github/workflows/ci.yml (manual).
 *
 * For each variant: copy the tree (tracked and untracked, not ignored) to a temp folder; run
 * `init-app --name scaffoldcheck … --yes --force`; check the regenerated alert catalog
 * (check-scaffold-observability.mjs); install; build the foundation packages; regenerate the OpenAPI
 * documents and the RBAC matrix; type-check the backend, apps/web, packages/test-utils and tests/; migrate; run the
 * backend unit and architecture specs.
 *
 *   desk-no   `--desk no --mobile no`. Then search the copy for `inngest` and `domains/desk` (any case): every hit
 *             must be on tools/init-app/features/desk.residue.json, and every entry there must still match.
 *   desk-yes  `--desk yes --mobile no`. Nothing of the Desk manifest may have been removed.
 *
 *   node tools/init-app/check-variants.mjs                 # both variants
 *   node tools/init-app/check-variants.mjs --variant desk-no
 *   node tools/init-app/check-variants.mjs --keep          # leave the temp copies for a look
 *
 * The backend specs read DATABASE_URL and REDIS_URL, as in `pnpm verify`. It takes minutes, so it is not in the
 * pre-push hook: run it before a pull request that touches tools/init-app/, apps/backend/src/platform-glue/features/,
 * a file a manifest names, or a Desk file outside the Desk folder, and paste the last line into the pull request.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { featurePresence, loadManifest } from './apply-feature.mjs';
import { walkRepo } from './repo-walk.mjs';
import { checkScaffoldObservability } from './check-scaffold-observability.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
export const SEARCH_STRINGS = ['inngest', 'domains/desk'];

const VARIANTS = {
  'desk-no': { args: ['--desk', 'no', '--mobile', 'no'], desk: false },
  'desk-yes': { args: ['--desk', 'yes', '--mobile', 'no'], desk: true },
};

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

function makeRunner(variant, cwd) {
  return (step, cmd, args, extraEnv = {}) => {
    console.log(`\n── ${variant}: ${step} ──\n$ ${[cmd, ...args].join(' ')}`);
    const r = spawnSync(cmd, args, {
      cwd,
      stdio: 'inherit',
      env: { ...process.env, CI: 'true', HUSKY: '0', ...extraEnv },
    });
    if (r.status !== 0) {
      const err = new Error(`${variant}: ${step}`);
      err.step = `${variant}: ${step}`;
      throw err;
    }
  };
}

function runVariant(name, { keep }) {
  const variant = VARIANTS[name];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `scaffold-${name}-`));
  const run = makeRunner(name, dir);
  console.log(`\n══ ${name}: ${dir} ══`);
  try {
    console.log(`  copied ${copyTree(ROOT, dir)} files`);
    run('init-app', process.execPath, [
      'tools/init-app/init-app.mjs',
      '--name',
      'scaffoldcheck',
      ...variant.args,
      '--yes',
      '--force',
    ]);

    // The alert catalog is renamed and regenerated by init-app; its own checks need no install.
    console.log(`\n── ${name}: observability catalog ──`);
    const observability = checkScaffoldObservability(dir, { name: 'scaffoldcheck' });
    for (const p of observability) console.error(`  ${p}`);
    if (observability.length) throw Object.assign(new Error(), { step: `${name}: observability catalog` });
    console.log('  the Grafana-as-code catalog is regenerated in the new name and validates.');

    const manifest = loadManifest('desk');
    const { present, missing } = featurePresence(dir, manifest);
    if (variant.desk) {
      const gone = [...missing.paths, ...missing.markers, ...missing.jsonEntries];
      if (gone.length > 0) {
        console.error(`  --desk yes removed part of Desk:\n${gone.map((g) => `    ${g}`).join('\n')}`);
        throw Object.assign(new Error(), { step: `${name}: nothing removed` });
      }
      console.log('  --desk yes kept every path, block and entry of the Desk manifest.');
    } else {
      const left = [...present.paths, ...present.markers, ...present.jsonEntries, ...present.allowlistKeys];
      if (left.length > 0) {
        console.error(`  --desk no left Desk behind:\n${left.map((g) => `    ${g}`).join('\n')}`);
        throw Object.assign(new Error(), { step: `${name}: manifest stripped` });
      }
      console.log('  --desk no removed every path, block and entry of the Desk manifest.');
    }

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

    if (!variant.desk) {
      console.log(`\n── ${name}: residue search ──`);
      const entries = loadResidue(path.join(HERE, 'features', 'desk.residue.json'));
      const { unlisted, stale } = compareResidue(residueHits(dir), entries);
      for (const u of unlisted) console.error(`  not on desk.residue.json: ${u}`);
      for (const s of stale) console.error(`  stale entry on desk.residue.json (no longer matches): ${s}`);
      if (unlisted.length || stale.length) throw Object.assign(new Error(), { step: `${name}: residue search` });
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
