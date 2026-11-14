// node --test tools/init-app/*.test.mjs   (root script: pnpm test:init-app, run by pnpm verify)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  VARIANTS,
  compareResidue,
  gitToplevel,
  isolatedGitEnv,
  loadResidue,
  prepareVariant,
  residueHits,
  runwayStarterCheck,
  scaffoldProblems,
  variantDir,
} from './check-variants.mjs';
import { INIT_OPTIONS } from './scaffold-text.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// These tests create git repositories. Run from a git hook (a pre-push hook in a linked worktree exports GIT_DIR), git
// would write into the hook's repository instead: clear git's local variables first, as
// tools/verify/hook-env-isolation.test.sh does for the shell tests.
for (const k of execFileSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean))
  delete process.env[k];

function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-variants-'));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  return root;
}

test('the residue search matches either string in any case, and skips what the rename walker skips', () => {
  const root = tree({
    'a.ts': "import x from '../domains/desk/x';\n",
    'b.md': 'Runs on Inngest.\n',
    'c.ts': 'nothing here\n',
    'tools/init-app/features/desk.json': '"apps/backend/src/domains/desk"',
    'docs/superpowers/spec.md': 'inngest',
    'node_modules/inngest/index.js': 'inngest',
    'pnpm-lock.yaml': 'inngest: 4.2.4',
  });
  assert.deepEqual(
    residueHits(root).sort((x, y) => x.file.localeCompare(y.file)),
    [
      { file: 'a.ts', match: 'domains/desk' },
      { file: 'b.md', match: 'inngest' },
    ],
  );
});

test('a hit not on the list fails, and so does an entry that no longer matches', () => {
  const hits = [
    { file: 'a.ts', match: 'domains/desk' },
    { file: 'b.md', match: 'inngest' },
  ];
  const entries = [
    { file: 'b.md', match: 'inngest', reason: 'r' },
    { file: 'gone.ts', match: 'inngest', reason: 'r' },
  ];
  assert.deepEqual(compareResidue(hits, entries), {
    unlisted: ['a.ts :: domains/desk'],
    stale: ['gone.ts :: inngest'],
  });
  assert.deepEqual(compareResidue(hits.slice(1), entries.slice(0, 1)), { unlisted: [], stale: [] });
});

test('a residue entry names a file, one bare search string and a reason', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'residue-'));
  const write = (entries) => {
    fs.writeFileSync(path.join(dir, 'r.json'), JSON.stringify({ entries }));
    return path.join(dir, 'r.json');
  };
  assert.throws(() => loadResidue(write([{ file: 'x', match: 'app-inngest', reason: 'r' }])), /bad entry/);
  assert.throws(() => loadResidue(write([{ file: 'x', match: 'inngest' }])), /bad entry/);
  assert.equal(loadResidue(write([{ file: 'x', match: 'domains/desk', reason: 'r' }])).length, 1);
});

test('the shipped residue list is well formed and names no file twice for one string', () => {
  const entries = loadResidue(path.join(HERE, 'features', 'desk.residue.json'));
  const keys = entries.map((e) => `${e.file} :: ${e.match}`);
  assert.equal(new Set(keys).size, keys.length);
});

// The runway refuses to run in the starter. Its check must still tell a product from the starter after init-app's
// first rename rule (the template name to the product's) has rewritten every file outside tools/init-app.
test('after the rename, the runway starter check names the template constant, not the product', () => {
  const ROOT = path.resolve(HERE, '..', '..');
  const template = ['app', 'foundation'].join('-');
  const rename = (s) => s.replaceAll(template, 'acme-crm');
  const workflow = fs.readFileSync(path.join(ROOT, '.claude/workflow.json'), 'utf8');
  const prefix = JSON.parse(workflow).skillPrefix;
  const runway = `.claude/skills/${prefix}-runway/SKILL.md`;
  const shipped = fs.readFileSync(path.join(ROOT, runway), 'utf8');
  const renamed = tree({ '.claude/workflow.json': rename(workflow), [runway]: rename(shipped) });
  assert.deepEqual(runwayStarterCheck(renamed, 'acme-crm'), []);

  const literal = tree({
    '.claude/workflow.json': workflow,
    [runway]: '- **Not in the starter itself.** If the root `package.json` is still named `acme-crm`, stop.\n',
  });
  assert.equal(runwayStarterCheck(literal, 'acme-crm').length, 2);
  assert.equal(runwayStarterCheck(tree({ '.claude/workflow.json': workflow, [runway]: '# Runway\n' }), 'x').length, 1);
});

test('isolatedGitEnv drops every repository-local git variable, keeps the rest, and sets the ceiling', () => {
  const env = isolatedGitEnv(
    { GIT_DIR: '/x/.git', GIT_WORK_TREE: '/x', GIT_INDEX_FILE: '/x/i', GIT_FUTURE_VAR: '1', PATH: '/bin', HUSKY: '0' },
    { ceiling: '/tmp', localVars: ['GIT_FUTURE_VAR'] },
  );
  assert.deepEqual(env, { PATH: '/bin', HUSKY: '0', GIT_CEILING_DIRECTORIES: '/tmp' });
});

// The incident this guards against: a hook exported GIT_DIR, a test ran `git init` and `git config`, and the real
// repository's config was rewritten. Here a decoy repository plays the real one.
test('a git init in a scaffold copy under the isolated env stays in the copy, even with GIT_DIR exported', () => {
  const decoy = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'decoy-')));
  execFileSync('git', ['init', '-q', decoy]);
  const before = fs.readFileSync(path.join(decoy, '.git/config'), 'utf8');
  const copy = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'copy-')));
  const hookEnv = { ...process.env, GIT_DIR: path.join(decoy, '.git') };
  const gitDir = (env) => {
    try {
      return fs.realpathSync(
        path.resolve(
          copy,
          execFileSync('git', ['rev-parse', '--git-dir'], { cwd: copy, env, encoding: 'utf8', stdio: 'pipe' }).trim(),
        ),
      );
    } catch {
      return null;
    }
  };
  // Without isolation, git in the copy uses the decoy's repository: the test would catch a runner that forgot it.
  assert.equal(gitDir(hookEnv), path.join(decoy, '.git'));
  const env = isolatedGitEnv(hookEnv, { ceiling: path.dirname(copy) });
  assert.equal(gitDir(env), null);
  execFileSync('git', ['init', '-q'], { cwd: copy, env });
  execFileSync('git', ['config', 'core.bare', 'false'], { cwd: copy, env });
  assert.equal(gitDir(env), path.join(copy, '.git'));
  assert.equal(gitToplevel(copy, env), copy);
  assert.equal(fs.readFileSync(path.join(decoy, '.git/config'), 'utf8'), before);
});

test('the three variants cover Desk on and off, mobile on and off, git and no git, and a custom prefix', () => {
  const v = Object.values(VARIANTS);
  assert.deepEqual(Object.keys(VARIANTS), ['defaults', 'lean', 'desk-untracked']);
  assert.ok(v.some((x) => x.expect.desk) && v.some((x) => !x.expect.desk));
  assert.ok(v.some((x) => x.expect.mobile) && v.some((x) => !x.expect.mobile));
  assert.ok(v.some((x) => x.git) && v.some((x) => !x.git));
  assert.deepEqual(VARIANTS.defaults.args, []);
  assert.ok(VARIANTS.lean.args.includes('--skill-prefix'));
  assert.ok(VARIANTS['desk-untracked'].name.length > 8 && !VARIANTS['desk-untracked'].name.includes('-'));
});

// The defaults variant runs init-app with no option flags, so what it expects is what init-app picks on its own.
// Those expectations must be the defaults INIT_OPTIONS (and so `--describe`) states: a default changed in one place
// and not the other fails here or in the variant run below.
test('the defaults variant expects exactly the defaults INIT_OPTIONS states', () => {
  const def = (name) => INIT_OPTIONS.find((o) => o.name === name).default;
  const { expect } = VARIANTS.defaults;
  assert.equal(expect.desk, def('desk') === 'yes');
  assert.equal(expect.mobile, def('mobile') === 'yes');
  assert.equal(expect.plansTracked, def('plans') === 'tracked');
  assert.equal(expect.tenancy, def('tenancy'));
});

// The part of each variant that needs no install: copy, git init when asked, init-app, and the checks of what it
// wrote. A real scaffold of this repository, so a change to init-app that breaks a variant fails here first.
for (const name of Object.keys(VARIANTS)) {
  test(`variant ${name}: init-app writes what the variant asks for`, () => {
    const dir = variantDir(name);
    try {
      prepareVariant(name, dir, { quiet: true });
      assert.deepEqual(scaffoldProblems(dir, VARIANTS[name]), []);
      assert.deepEqual(runwayStarterCheck(dir, VARIANTS[name].name), []);
      assert.equal(
        gitToplevel(dir, isolatedGitEnv(process.env, { ceiling: path.dirname(dir) })),
        VARIANTS[name].git ? dir : null,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('scaffoldProblems names a wrong prefix, a kept verified: line, the plans line and a half-removed feature', () => {
  const dir = variantDir('lean');
  try {
    prepareVariant('lean', dir, { quiet: true });
    const cfgFile = path.join(dir, '.claude/workflow.json');
    const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
    fs.writeFileSync(cfgFile, JSON.stringify({ ...cfg, skillPrefix: 'yy' }));
    fs.writeFileSync(path.join(dir, 'docs/x.md'), '---\nverified: abc1234\n---\n');
    fs.appendFileSync(path.join(dir, '.gitignore'), '\ndocs/superpowers/\n');
    fs.mkdirSync(path.join(dir, 'apps/mobile'));
    const problems = scaffoldProblems(dir, VARIANTS.lean).join('\n');
    assert.match(problems, /skillPrefix is "yy", expected "zz"/);
    assert.match(problems, /docs\/x\.md: still carries/);
    assert.match(problems, /\.gitignore: still ignores docs\/superpowers/);
    assert.match(problems, /dropped mobile, but apps\/mobile is left/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
