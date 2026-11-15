#!/usr/bin/env node
/**
 * check-scaffold-observability — prove that a product scaffolded by init-app gets a Grafana-as-code catalog in its own
 * name: the generated alerting and dashboard files match the renamed catalog, they validate, and no template name is
 * left in them.
 *
 * It is one step of `pnpm verify:scaffold` (check-variants.mjs calls `checkScaffoldObservability` on each variant
 * right after init-app), and runs alone too:
 *
 *   node tools/init-app/check-scaffold-observability.mjs          # copy the tree, init-app, check
 *   node tools/init-app/check-scaffold-observability.mjs --keep   # leave the copy for a look
 *
 * Plain Node, no install: the catalog's scripts need no package. It takes seconds.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { copyTree } from './check-variants.mjs';
import { CONSTANTS_FILE, GENERATE_SCRIPT } from './observability-constants.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const CATALOG_DIR = 'infra/observability/grafana-cloud';
const VALIDATE_SCRIPT = `${CATALOG_DIR}/scripts/validate.mjs`;
/** Template names that must not survive a rename anywhere under the catalog. */
export const TEMPLATE_RESIDUE = ['app-production', 'app-staging', 'app-backend'];

/** Files under the catalog folder that still name the template, as `file :: string`. */
export function templateResidue(dir) {
  const hits = [];
  const walk = (abs) => {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const child = path.join(abs, entry.name);
      if (entry.isDirectory()) walk(child);
      else {
        const text = fs.readFileSync(child, 'utf8');
        for (const s of TEMPLATE_RESIDUE)
          if (text.includes(s)) hits.push(`${path.relative(dir, child).split(path.sep).join('/')} :: ${s}`);
      }
    }
  };
  walk(path.join(dir, CATALOG_DIR));
  return hits;
}

function node(dir, script, args = []) {
  const r = spawnSync(process.execPath, [script, ...args], { cwd: dir, encoding: 'utf8' });
  return { ok: r.status === 0, output: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
}

/**
 * The checks on a copy init-app has already run in. Returns the problems; empty means pass.
 * @param {string} dir the scaffolded copy
 * @param {{ name: string, repoUrl?: string }} expected
 */
export function checkScaffoldObservability(dir, { name, repoUrl }) {
  const problems = [];
  const constants = fs.readFileSync(path.join(dir, CONSTANTS_FILE), 'utf8');
  if (!constants.includes(`export const PROJECT = '${name}';`))
    problems.push(`${CONSTANTS_FILE}: PROJECT is not '${name}'`);
  if (repoUrl && !constants.includes(`export const REPO_URL = '${repoUrl}';`))
    problems.push(`${CONSTANTS_FILE}: REPO_URL is not '${repoUrl}'`);
  const generated = node(dir, GENERATE_SCRIPT, ['--check']);
  if (!generated.ok) problems.push(`generate.mjs --check failed after init-app:\n${generated.output}`);
  const validated = node(dir, VALIDATE_SCRIPT);
  if (!validated.ok) problems.push(`validate.mjs failed after init-app:\n${validated.output}`);
  for (const hit of templateResidue(dir)) problems.push(`template name left after init-app: ${hit}`);
  return problems;
}

function main() {
  const { values } = parseArgs({ options: { keep: { type: 'boolean', default: false } } });
  const name = 'scaffoldcheck';
  const repoUrl = 'https://github.com/example/scaffoldcheck';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-observability-'));
  const started = Date.now();
  let problems = [];
  try {
    copyTree(ROOT, dir);
    const init = spawnSync(
      process.execPath,
      [
        'tools/init-app/init-app.mjs',
        '--name',
        name,
        '--repo-url',
        repoUrl,
        '--desk',
        'no',
        '--mobile',
        'no',
        '--yes',
        '--force',
      ],
      { cwd: dir, encoding: 'utf8', env: { ...process.env, HUSKY: '0' } },
    );
    problems =
      init.status === 0 ? checkScaffoldObservability(dir, { name, repoUrl }) : [`init-app failed:\n${init.stderr}`];
  } finally {
    if (values.keep) console.log(`kept ${dir}`);
    else fs.rmSync(dir, { recursive: true, force: true });
  }
  const elapsed = `${Math.round((Date.now() - started) / 1000)}s`;
  for (const p of problems) console.error(`  ${p}`);
  console.log(`\ncheck-scaffold-observability: ${problems.length ? 'FAIL' : 'PASS'} (${elapsed})`);
  if (problems.length) process.exit(1);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) main();
