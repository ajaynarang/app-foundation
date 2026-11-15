// foundation:status end to end on small fixtures. A fixture "template" is a real git repository whose init-app is a
// few lines that apply the --name and --skill-prefix it is given, so the rebuild (fetch, checkout, scaffold) and the
// comparison run for real without the whole repository. Nothing here touches the repository the test lives in.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { baseRefs, initAppArgs, rebuildBase } from './base.mjs';
import { compareTrees, report, sameContent } from './status.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Every temp folder a test makes (fixtures, and the bases it rebuilds) is removed when the file's tests are done.
const temps = [];
const keep = (dir) => (temps.push(dir), dir);
const tmp = (name) => keep(fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `foundation-${name}-`))));
const rebuild = (options) => {
  const built = rebuildBase(options);
  keep(built.dir);
  return built;
};
after(() => {
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
});
const write = (root, rel, text) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
};
const git = (cwd, ...args) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(cwd) },
  }).trim();

const FAKE_INIT_APP = `
import fs from 'node:fs';
import { parseArgs } from 'node:util';
const { values } = parseArgs({ strict: false, options: { name: { type: 'string' }, 'skill-prefix': { type: 'string' } } });
fs.writeFileSync('packages/appshore/name.ts', fs.readFileSync('packages/appshore/name.ts', 'utf8').replace('app-foundation', values.name));
fs.renameSync('.claude/skills/app-plan', '.claude/skills/' + values['skill-prefix'] + '-plan');
`;

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
const manifestFor = (base) => ({
  version: '0.2.0',
  template: 'unused',
  owned: ['packages/appshore/**', '.claude/skills/app-*/**'],
  seams: ['packages/appshore/app.prisma'],
  base,
  scaffold,
});

/** A template repository with one commit tagged v0.2.0, and a product scaffolded from it. */
function fixture() {
  const template = tmp('template');
  write(template, 'tools/init-app/init-app.mjs', FAKE_INIT_APP);
  write(template, 'packages/appshore/name.ts', "export const NAME = 'app-foundation';\n");
  write(template, 'packages/appshore/guard.ts', 'export const guard = 1;\n');
  write(template, 'packages/appshore/app.prisma', '// your models\n');
  write(template, '.claude/skills/app-plan/SKILL.md', '# Plan\n');
  write(template, 'README.md', '# Template\n');
  git(template, 'init', '-q', '-b', 'main');
  git(template, 'add', '-A');
  git(template, 'commit', '-q', '-m', 'template');
  git(template, 'tag', 'v0.2.0');
  const commit = git(template, 'rev-parse', 'HEAD');
  // A later template commit: the base must be the recorded one, not the tip.
  write(template, 'packages/appshore/guard.ts', 'export const guard = 2;\n');
  git(template, 'commit', '-q', '-am', 'later');

  const manifest = manifestFor({ version: '0.2.0', commit });
  const { dir: product } = rebuild({ manifest, source: template });
  return { template, product, manifest, commit };
}

test('init-app is replayed with the recorded answers', () => {
  assert.deepEqual(initAppArgs({ ...scaffold, repoUrl: 'https://github.com/acme/acme' }).slice(-4), [
    '--repo-url',
    'https://github.com/acme/acme',
    '--yes',
    '--force',
  ]);
  assert.ok(!initAppArgs(scaffold).includes('--repo-url'), 'no flag for an answer that was empty');
  assert.deepEqual(baseRefs({ version: '0.2.0', commit: 'abc' }), ['abc', 'v0.2.0']);
  assert.deepEqual(baseRefs({ version: '0.2.0', commit: null }), ['v0.2.0']);
});

test('a product that changed nothing is in step with its base, renames and all', () => {
  const { template, product, manifest } = fixture();
  assert.match(fs.readFileSync(path.join(product, 'packages/appshore/name.ts'), 'utf8'), /'acme'/);
  const { dir, ref } = rebuild({ manifest, source: template });
  const result = compareTrees({ baseDir: dir, productDir: product, manifest });
  assert.equal(ref, manifest.base.commit);
  assert.deepEqual([result.changed, result.deleted, result.added], [[], [], []]);
  assert.equal(result.owned, 3, 'name.ts, guard.ts and the renamed skill; the seam and README are not owned');
  assert.match(report({ manifest, ref, result }), /in step\. All 3 foundation files match/);
});

test('only changes to owned files are listed', () => {
  const { template, product, manifest } = fixture();
  write(product, 'packages/appshore/guard.ts', 'export const guard = 99;\n'); // owned: changed
  fs.rmSync(path.join(product, '.claude/skills/ac-plan'), { recursive: true }); // owned (renamed): deleted
  write(product, 'packages/appshore/new-helper.ts', 'export {};\n'); // owned folder: added
  write(product, 'packages/appshore/app.prisma', 'model Thing {}\n'); // seam: ignored
  write(product, 'README.md', '# Acme\n'); // starter: ignored
  write(product, 'apps/backend/src/domains/orders/x.ts', 'export {};\n'); // the product's own: ignored
  const { dir, ref } = rebuild({ manifest, source: template });
  const result = compareTrees({ baseDir: dir, productDir: product, manifest });
  assert.deepEqual(result.changed, ['packages/appshore/guard.ts']);
  assert.deepEqual(result.deleted, ['.claude/skills/ac-plan/SKILL.md']);
  assert.deepEqual(result.added, ['packages/appshore/new-helper.ts']);
  const text = report({ manifest, ref, result });
  assert.match(text, /3 of 3 foundation files differ from the base \(1 changed, 1 deleted, 1 added\)/);
});

test('a realigned Markdown table or a doubled blank line is not a change; a changed cell is', () => {
  const md = (text) => Buffer.from(text);
  const before = md('Intro\n\n| Skill | Use |\n| ----- | --- |\n| `ac-plan` | plan |\n\n  indented | not a table\n');
  const realigned = md(
    'Intro\n\n| Skill     | Use  |\n| --------- | ---- |\n| `ac-plan` | plan |\n\n  indented | not a table\n',
  );
  const reworded = md(
    'Intro\n\n| Skill     | Use  |\n| --------- | ---- |\n| `ac-plan` | plot |\n\n  indented | not a table\n',
  );
  assert.ok(sameContent('docs/x.md', before, realigned));
  assert.ok(!sameContent('docs/x.md', before, reworded));
  assert.ok(sameContent('docs/x.md', md('a\n\n\n- b\n'), md('a\n\n- b\n')), 'a doubled blank line is not a change');
  assert.ok(!sameContent('src/x.ts', before, realigned), 'only Markdown is compared this way');
  assert.ok(!sameContent('docs/x.md', md('a  b\n'), md('a b\n')), 'prose spacing still counts');
});

test('with no recorded commit the version tag is the base', () => {
  const { template, product } = fixture();
  const manifest = manifestFor({ version: '0.2.0', commit: null });
  const { dir, ref } = rebuild({ manifest, source: template });
  assert.equal(ref, 'v0.2.0');
  assert.deepEqual(compareTrees({ baseDir: dir, productDir: product, manifest }).changed, []);
});

test('a base that cannot be fetched fails with the way out, and leaves no temp folder behind', () => {
  const { template } = fixture();
  const manifest = manifestFor({ version: '9.9.9', commit: 'f'.repeat(40) });
  // A temp folder of this test's own: other test files make and remove theirs in the shared one at the same time.
  const own = tmp('tmpdir');
  const shared = process.env.TMPDIR;
  process.env.TMPDIR = own;
  try {
    assert.throws(() => rebuildBase({ manifest, source: template }), /could not fetch the base[\s\S]*--from/);
    assert.throws(() => rebuildBase({ manifest: { ...manifest, base: null, scaffold: null } }), /this is the template/);
    assert.deepEqual(fs.readdirSync(own), []);
  } finally {
    if (shared === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = shared;
  }
});

test('the command line: the template says there is nothing to compare; a product gets its lists as JSON', () => {
  const inTemplate = tmp('cli-template');
  write(inTemplate, 'foundation.json', JSON.stringify({ ...manifestFor(null), scaffold: null }));
  const a = spawnSync(process.execPath, [path.join(HERE, 'status.mjs'), '--root', inTemplate], { encoding: 'utf8' });
  assert.equal(a.status, 0, a.stderr);
  assert.match(a.stdout, /this is the template \(v0\.2\.0\)/);

  const { template, product, manifest } = fixture();
  write(product, 'foundation.json', JSON.stringify(manifest));
  write(product, 'packages/appshore/guard.ts', 'export const guard = 99;\n');
  const b = spawnSync(
    process.execPath,
    [path.join(HERE, 'status.mjs'), '--root', product, '--from', template, '--json'],
    { encoding: 'utf8' },
  );
  assert.equal(b.status, 0, b.stderr);
  assert.deepEqual(JSON.parse(b.stdout).changed, ['packages/appshore/guard.ts']);

  const c = spawnSync(process.execPath, [path.join(HERE, 'status.mjs'), '--root', tmp('empty')], { encoding: 'utf8' });
  assert.equal(c.status, 1);
  assert.match(c.stderr, /foundation: foundation\.json: not found/);
});
