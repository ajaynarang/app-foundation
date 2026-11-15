// foundation:pull on small fixtures. The three-way rules run on three plain folders (base, target, product); the
// command line runs against a fixture template that is a real git repository with two tagged versions and a tiny
// init-app. Nothing here touches the repository the test lives in.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTION, applyPull, compareVersions, planPull, pulledManifest, report, targetRefs } from './pull.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PULL = path.join(HERE, 'pull.mjs');
const temps = [];
const tmp = (name) => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `foundation-${name}-`)));
  temps.push(dir);
  return dir;
};
after(() => {
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
});
const write = (root, rel, text) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
};
const text = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const has = (root, rel) => fs.existsSync(path.join(root, rel));
const git = (cwd, ...args) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(cwd) },
  }).trim();

const scaffold = {
  name: 'acme',
  displayName: 'Acme',
  scope: '@app',
  db: 'acme',
  tenancy: 'multi',
  mobile: 'yes',
  desk: 'no',
  skillPrefix: 'ac',
  plans: 'tracked',
};
const lists = {
  template: 'unused',
  owned: ['packages/appshore/**', '.claude/skills/app-*/**', 'docs/upgrade-notes/**'],
  seams: ['packages/appshore/app.prisma', 'packages/appshore/registry.ts'],
};
const manifest = (version, base = null) => ({ version, ...lists, base, scaffold: base ? scaffold : null });
const LINES = 'one\ntwo\nthree\nfour\nfive\nsix\nseven\n';

/** Three folders: `files` is `{ path: [base, target, product] }`, null for "not there". */
function sides(files) {
  const dirs = [tmp('base'), tmp('target'), tmp('product')];
  for (const [rel, versions] of Object.entries(files))
    versions.forEach((content, i) => content !== null && write(dirs[i], rel, content));
  const [baseDir, targetDir, productDir] = dirs;
  const targetManifest = manifest('0.3.0', { version: '0.3.0', commit: 'a'.repeat(40) });
  return { baseDir, targetDir, productDir, targetManifest };
}
const kinds = (plan) => Object.fromEntries(plan.actions.map((a) => [a.rel, a.kind]));

test('an owned file changed only in the foundation is taken; one changed only here is left alone', () => {
  const s = sides({
    'packages/appshore/a.ts': ['v1\n', 'v2\n', 'v1\n'],
    'packages/appshore/mine.ts': ['v1\n', 'v1\n', 'mine\n'],
    'packages/appshore/same.ts': ['v1\n', 'v2\n', 'v2\n'],
    'packages/appshore/new.ts': [null, 'new\n', null],
    'packages/appshore/gone.ts': ['v1\n', null, 'v1\n'],
    'packages/appshore/deep/only/gone.ts': ['v1\n', null, 'v1\n'],
  });
  const plan = planPull(s);
  assert.deepEqual(kinds(plan), {
    'packages/appshore/a.ts': ACTION.TAKE,
    'packages/appshore/new.ts': ACTION.ADD,
    'packages/appshore/gone.ts': ACTION.REMOVE,
    'packages/appshore/deep/only/gone.ts': ACTION.REMOVE,
  });
  assert.deepEqual(plan.conflicts, []);
  applyPull({ plan, ...s });
  assert.equal(text(s.productDir, 'packages/appshore/a.ts'), 'v2\n');
  assert.equal(text(s.productDir, 'packages/appshore/mine.ts'), 'mine\n');
  assert.equal(text(s.productDir, 'packages/appshore/new.ts'), 'new\n');
  assert.ok(!has(s.productDir, 'packages/appshore/gone.ts'));
  assert.ok(!has(s.productDir, 'packages/appshore/deep'), 'the emptied folders go too');
});

test('changes on both sides merge; the same lines changed leave markers and a conflict', () => {
  const s = sides({
    'packages/appshore/apart.ts': [LINES, LINES.replace('one', 'ONE'), LINES.replace('seven', 'SEVEN')],
    'packages/appshore/clash.ts': [LINES, LINES.replace('four', 'theirs'), LINES.replace('four', 'ours')],
    'packages/appshore/both-new.ts': [null, 'theirs\n', 'ours\n'],
  });
  const plan = planPull({ ...s, labels: { base: 'base v0.2.0', theirs: 'foundation v0.3.0' } });
  assert.deepEqual(kinds(plan), {
    'packages/appshore/apart.ts': ACTION.MERGE,
    'packages/appshore/both-new.ts': ACTION.CONFLICT,
    'packages/appshore/clash.ts': ACTION.CONFLICT,
  });
  assert.deepEqual(
    plan.conflicts.map((c) => [c.rel, c.reason]),
    [
      ['packages/appshore/both-new.ts', 'added on both sides: 1 conflict marker(s) in the file'],
      ['packages/appshore/clash.ts', 'changed on both sides: 1 conflict marker(s) in the file'],
    ],
  );
  applyPull({ plan, ...s });
  assert.equal(text(s.productDir, 'packages/appshore/apart.ts'), LINES.replace('one', 'ONE').replace('seven', 'SEVEN'));
  const clash = text(s.productDir, 'packages/appshore/clash.ts');
  assert.match(clash, /<<<<<<< here\nours\n=======\ntheirs\n>>>>>>> foundation v0\.3\.0/);
  assert.match(clash, /^one\ntwo\nthree\n/, 'the lines around the conflict are intact');
});

test('a delete against a change is never settled silently, and a binary file is never merged', () => {
  const png = (n) => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, n]);
  const s = sides({
    'packages/appshore/removed-there.ts': ['v1\n', null, 'mine\n'],
    'packages/appshore/removed-here.ts': ['v1\n', 'v2\n', null],
    'packages/appshore/logo.png': [png(1), png(2), png(3)],
    'packages/appshore/icon.png': [png(1), png(2), png(1)],
  });
  const plan = planPull(s);
  assert.deepEqual(kinds(plan), { 'packages/appshore/icon.png': ACTION.TAKE });
  assert.deepEqual(
    plan.conflicts.map((c) => [c.rel, c.reason]),
    [
      ['packages/appshore/logo.png', 'binary file changed on both sides: kept as it is here'],
      ['packages/appshore/removed-here.ts', 'changed in the foundation, deleted here: left deleted'],
      ['packages/appshore/removed-there.ts', 'removed in the foundation, changed here: kept'],
    ],
  );
  applyPull({ plan, ...s });
  assert.equal(text(s.productDir, 'packages/appshore/removed-there.ts'), 'mine\n');
  assert.ok(!has(s.productDir, 'packages/appshore/removed-here.ts'));
  assert.deepEqual(fs.readFileSync(path.join(s.productDir, 'packages/appshore/logo.png')), png(3));
  assert.deepEqual(fs.readFileSync(path.join(s.productDir, 'packages/appshore/icon.png')), png(2));
});

test('seams and starter content are listed, never written; a seam the product never had is added', () => {
  const s = sides({
    'packages/appshore/app.prisma': ['// models\n', '// models, v2\n', 'model Order {}\n'],
    'packages/appshore/registry.ts': [null, 'export const REGISTRY = [];\n', null],
    'package.json': ['{"a":1}\n', '{"a":2}\n', '{"mine":true}\n'],
    'README.md': ['# T\n', '# T\n', '# Acme\n'],
    'docker-compose.yml': [null, 'services: {}\n', null],
  });
  const plan = planPull(s);
  assert.deepEqual(kinds(plan), { 'packages/appshore/registry.ts': ACTION.ADD });
  assert.deepEqual(plan.seams, ['packages/appshore/app.prisma']);
  assert.deepEqual(plan.starter, ['docker-compose.yml', 'package.json']);
  applyPull({ plan, ...s });
  assert.equal(text(s.productDir, 'packages/appshore/app.prisma'), 'model Order {}\n');
  assert.equal(text(s.productDir, 'package.json'), '{"mine":true}\n');
  assert.ok(!has(s.productDir, 'docker-compose.yml'));
});

test("a renamed skill is pulled under the product's prefix, and an executable keeps its mode", () => {
  const s = sides({
    '.claude/skills/ac-plan/SKILL.md': ['# Plan\n', '# Plan, better\n', '# Plan\n'],
    'packages/appshore/run.sh': [null, '#!/bin/sh\n', null],
  });
  fs.chmodSync(path.join(s.targetDir, 'packages/appshore/run.sh'), 0o755);
  const plan = planPull(s);
  applyPull({ plan, ...s });
  assert.equal(text(s.productDir, '.claude/skills/ac-plan/SKILL.md'), '# Plan, better\n');
  assert.ok(fs.statSync(path.join(s.productDir, 'packages/appshore/run.sh')).mode & 0o100);
});

test('a Markdown table Prettier realigned here is not a change of ours: the newer file is taken', () => {
  const before = '| Skill | Use |\n| ----- | --- |\n| `ac-plan` | plan |\n';
  const realigned = '| Skill     | Use  |\n| --------- | ---- |\n| `ac-plan` | plan |\n';
  const s = sides({ 'packages/appshore/README.md': [before, `${before}\nMore.\n`, realigned] });
  assert.deepEqual(kinds(planPull(s)), { 'packages/appshore/README.md': ACTION.TAKE });
});

test('upgrade notes that are new or gained entries are named with those entries', () => {
  const s = sides({
    'docs/upgrade-notes/operations.md': [
      '# Ops\n\n## 2026-11-13: tokens\n',
      '# Ops\n\n## 2026-11-13: tokens\n\n## 2026-11-20: alerts\n',
      '# Ops\n\n## 2026-11-13: tokens\n',
    ],
    'docs/upgrade-notes/search.md': [null, '# Search\n\n## 2026-11-21: index\n', null],
    'docs/upgrade-notes/old.md': ['# Old\n', '# Old\n', '# Old\n'],
  });
  const plan = planPull(s);
  assert.deepEqual(plan.notes, [
    { rel: 'docs/upgrade-notes/operations.md', entries: ['2026-11-20: alerts'], isNew: false },
    { rel: 'docs/upgrade-notes/search.md', entries: ['2026-11-21: index'], isNew: true },
  ]);
  const out = report({
    from: { version: '0.2.0', commit: 'b'.repeat(40) },
    to: { version: '0.3.0', commit: 'a'.repeat(40) },
    plan,
    dryRun: true,
  });
  assert.match(out, /^foundation: v0\.2\.0 @ bbbbbbb → v0\.3\.0 @ aaaaaaa/);
  assert.match(out, /Would update \(1\)[\s\S]*Would add \(1\)/);
  assert.match(out, /Upgrade notes to read\n {2}docs\/upgrade-notes\/operations\.md\n {4}- 2026-11-20: alerts/);
  assert.match(out, /dry run, nothing written\. 2 file\(s\) would change, 0 conflict\(s\)\./);
});

test("the record after a pull: the target's version and lists, the product's own answers", () => {
  const product = { ...manifest('0.2.0', { version: '0.2.0', commit: null }), owned: ['packages/appshore/**'] };
  const next = pulledManifest({ productManifest: product, targetManifest: manifest('0.3.0'), commit: 'c'.repeat(40) });
  assert.deepEqual(next.base, { version: '0.3.0', commit: 'c'.repeat(40) });
  assert.equal(next.version, '0.3.0');
  assert.deepEqual(next.owned, lists.owned);
  assert.deepEqual(next.scaffold, scaffold);
});

test('what to fetch, and which way is forward', () => {
  assert.deepEqual(targetRefs({}), ['HEAD']);
  assert.deepEqual(targetRefs({ version: '0.3.0' }), ['v0.3.0']);
  assert.deepEqual(targetRefs({ version: 'v0.3.0' }), ['v0.3.0']);
  assert.deepEqual(targetRefs({ version: '0.3.0', ref: 'next' }), ['next']);
  assert.throws(() => targetRefs({ version: 'main' }), /not a version like 1\.2\.3 \(use --ref/);
  assert.equal(compareVersions('0.10.0', '0.9.9'), 1);
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
  assert.equal(compareVersions('0.2.9', '0.3.0'), -1);
});

const FAKE_INIT_APP = `
import fs from 'node:fs';
import { parseArgs } from 'node:util';
const { values } = parseArgs({ strict: false, options: { name: { type: 'string' }, 'skill-prefix': { type: 'string' } } });
for (const f of ['packages/appshore/name.ts'])
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('app-foundation', values.name));
fs.renameSync('.claude/skills/app-plan', '.claude/skills/' + values['skill-prefix'] + '-plan');
`;

/** A template with v0.2.0 and v0.3.0, and a product scaffolded from v0.2.0 and committed in its own repository. */
function fixture() {
  const template = tmp('template');
  write(template, 'tools/init-app/init-app.mjs', FAKE_INIT_APP);
  write(template, 'foundation.json', JSON.stringify(manifest('0.2.0')));
  write(template, 'packages/appshore/name.ts', "export const NAME = 'app-foundation';\n");
  write(template, 'packages/appshore/guard.ts', LINES);
  write(template, 'packages/appshore/app.prisma', '// your models\n');
  write(template, '.claude/skills/app-plan/SKILL.md', '# Plan\n');
  write(template, 'package.json', '{"version":"0.2.0"}\n');
  git(template, 'init', '-q', '-b', 'main');
  git(template, 'add', '-A');
  git(template, 'commit', '-q', '-m', 'v0.2.0');
  git(template, 'tag', 'v0.2.0');
  const base = git(template, 'rev-parse', 'HEAD');

  write(template, 'foundation.json', JSON.stringify(manifest('0.3.0')));
  write(template, 'packages/appshore/guard.ts', LINES.replace('one', 'ONE'));
  write(template, 'packages/appshore/name.ts', "export const NAME = 'app-foundation';\nexport const V = 3;\n");
  write(template, '.claude/skills/app-plan/SKILL.md', '# Plan, better\n');
  write(template, 'packages/appshore/added.ts', 'export {};\n');
  write(template, 'docs/upgrade-notes/search.md', '# Search\n\n## 2026-11-21: index\n');
  write(template, 'package.json', '{"version":"0.3.0"}\n');
  git(template, 'add', '-A');
  git(template, 'commit', '-q', '-m', 'v0.3.0');
  git(template, 'tag', 'v0.3.0');
  const head = git(template, 'rev-parse', 'HEAD');

  const product = tmp('product');
  git(product, 'init', '-q', '-b', 'main');
  write(product, 'foundation.json', JSON.stringify(manifest('0.2.0', { version: '0.2.0', commit: base })));
  write(product, 'packages/appshore/name.ts', "export const NAME = 'acme';\n");
  write(product, 'packages/appshore/guard.ts', LINES.replace('seven', 'SEVEN')); // the product's own edit
  write(product, 'packages/appshore/app.prisma', 'model Order {}\n');
  write(product, '.claude/skills/ac-plan/SKILL.md', '# Plan\n');
  write(product, 'package.json', '{"name":"acme"}\n');
  git(product, 'add', '-A');
  git(product, 'commit', '-q', '-m', 'acme');
  return { template, product, base, head };
}
const run = (product, template, ...args) =>
  spawnSync(process.execPath, [PULL, '--root', product, '--from', template, ...args], { encoding: 'utf8' });

test('the command: a dry run writes nothing; a pull merges, renames, records the new base, and is then up to date', () => {
  const { template, product, head } = fixture();

  const dry = run(product, template, '0.3.0', '--dry-run', '--keep');
  assert.equal(dry.status, 0, dry.stderr);
  const [, baseDir, targetDir] = dry.stdout.match(/Kept for comparing[^\n]*\n {2}base {4}(\S+)\n {2}target {2}(\S+)/);
  temps.push(baseDir, targetDir);
  assert.equal(text(baseDir, 'package.json'), '{"version":"0.2.0"}\n', 'the base as this product received it');
  assert.equal(text(targetDir, 'package.json'), '{"version":"0.3.0"}\n');
  assert.match(dry.stdout, /dry run, nothing written\. 5 file\(s\) would change, 0 conflict\(s\)\./);
  assert.equal(git(product, 'status', '--porcelain'), '');

  const pull = run(product, template, '0.3.0');
  assert.equal(pull.status, 0, pull.stderr + pull.stdout);
  assert.match(pull.stdout, /Merged with the changes here \(1\)\n {2}packages\/appshore\/guard\.ts/);
  assert.match(pull.stdout, /outside the foundation: take what you need by hand \(1\)\n {2}package\.json/);
  assert.match(pull.stdout, /docs\/upgrade-notes\/search\.md \(new\)\n {4}- 2026-11-21: index/);
  assert.match(pull.stdout, /now on v0\.3\.0\. 5 file\(s\) written, 0 conflict\(s\) to settle\./);
  assert.equal(text(product, 'packages/appshore/guard.ts'), LINES.replace('one', 'ONE').replace('seven', 'SEVEN'));
  assert.equal(text(product, 'packages/appshore/name.ts'), "export const NAME = 'acme';\nexport const V = 3;\n");
  assert.equal(text(product, '.claude/skills/ac-plan/SKILL.md'), '# Plan, better\n');
  assert.ok(has(product, 'packages/appshore/added.ts'));
  assert.equal(text(product, 'packages/appshore/app.prisma'), 'model Order {}\n', 'the seam is the product’s');
  assert.equal(text(product, 'package.json'), '{"name":"acme"}\n');
  const recorded = JSON.parse(text(product, 'foundation.json'));
  assert.deepEqual(recorded.base, { version: '0.3.0', commit: head });
  assert.equal(recorded.version, '0.3.0');
  assert.deepEqual(recorded.scaffold, scaffold);

  git(product, 'add', '-A');
  git(product, 'commit', '-q', '-m', 'foundation 0.3.0');
  const again = run(product, template);
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /already on v0\.3\.0 @ [0-9a-f]{7}\. Nothing to pull\./);
});

test('the command: conflicts exit 2 with markers in the file; a dirty tree, the template and a step back are refused', () => {
  const { template, product, base } = fixture();
  write(product, 'packages/appshore/guard.ts', LINES.replace('one', 'uno'));
  const dirty = run(product, template);
  assert.equal(dirty.status, 1);
  assert.match(dirty.stderr, /uncommitted changes\. Commit or stash them first/);

  git(product, 'commit', '-q', '-am', 'uno');
  const pull = run(product, template, '--json');
  assert.equal(pull.status, 2, pull.stderr);
  const out = JSON.parse(pull.stdout);
  assert.deepEqual(
    out.conflicts.map((c) => c.rel),
    ['packages/appshore/guard.ts'],
  );
  assert.ok(!('content' in out.actions[0]), 'the JSON names the actions without the file bodies');
  assert.match(
    text(product, 'packages/appshore/guard.ts'),
    /<<<<<<< here\nuno\n=======\nONE\n>>>>>>> foundation v0\.3\.0/,
  );

  const inTemplate = tmp('cli-template');
  write(inTemplate, 'foundation.json', JSON.stringify(manifest('0.3.0')));
  const t = spawnSync(process.execPath, [PULL, '--root', inTemplate], { encoding: 'utf8' });
  assert.equal(t.status, 1);
  assert.match(t.stderr, /this is the template \(v0\.3\.0\)/);

  const newer = tmp('newer');
  write(newer, 'foundation.json', JSON.stringify(manifest('0.4.0', { version: '0.4.0', commit: base })));
  const back = run(newer, template, '0.3.0');
  assert.equal(back.status, 1);
  assert.match(back.stderr, /the target is v0\.3\.0, older than the base v0\.4\.0\. A pull only goes forward\./);

  // A temp folder of this run's own: other test files make and remove theirs in the shared one at the same time.
  const own = tmp('tmpdir');
  const missing = spawnSync(process.execPath, [PULL, '--root', product, '--from', template, '9.9.9', '--allow-dirty'], {
    encoding: 'utf8',
    env: { ...process.env, TMPDIR: own },
  });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /could not fetch the target/);
  assert.deepEqual(fs.readdirSync(own), [], 'a failed pull leaves no temp folder behind');
});
