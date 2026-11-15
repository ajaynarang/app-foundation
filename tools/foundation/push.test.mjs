// foundation:push on a fixture: a template that is a real git repository with a tiny init-app, a product scaffolded
// from its first commit, and a branch of the template to write into. Nothing here touches the repository the test
// lives in.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rebuildBase } from './base.mjs';
import { choose, productWords } from './push.mjs';

const PUSH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'push.mjs');
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
for (const f of ['packages/appshore/name.ts'])
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('app-foundation', values.name));
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
const manifest = (base = null) => ({
  version: '0.2.0',
  template: 'unused',
  owned: ['packages/appshore/**', '.claude/skills/app-*/**'],
  seams: ['packages/appshore/app.prisma'],
  base,
  scaffold: base ? scaffold : null,
});
const NAME = "export const NAME = 'app-foundation';\nexport const a = 1;\nexport const b = 2;\nexport const c = 3;\n";
const LINES = 'one\ntwo\nthree\nfour\nfive\nsix\nseven\n';

/**
 * A template (one tagged commit, then a later change to guard.ts on main), a product scaffolded from the tagged
 * commit, and `branch`: a clone of the template on a branch of its own, where a push writes.
 */
function fixture() {
  const template = tmp('template');
  write(template, 'tools/init-app/init-app.mjs', FAKE_INIT_APP);
  write(template, 'foundation.json', JSON.stringify(manifest()));
  write(template, 'packages/appshore/name.ts', NAME);
  write(template, 'packages/appshore/guard.ts', LINES);
  write(template, 'packages/appshore/old.ts', 'export {};\n');
  write(template, 'packages/appshore/app.prisma', '// your models\n');
  write(template, '.claude/skills/app-plan/SKILL.md', '# Plan\n\nStep one.\n');
  git(template, 'init', '-q', '-b', 'main');
  git(template, 'add', '-A');
  git(template, 'commit', '-q', '-m', 'v0.2.0');
  const base = git(template, 'rev-parse', 'HEAD');
  write(template, 'packages/appshore/guard.ts', LINES.replace('one', 'ONE'));
  git(template, 'commit', '-q', '-am', 'later');

  const recorded = manifest({ version: '0.2.0', commit: base });
  const { dir: product } = rebuildBase({ manifest: recorded, source: template });
  temps.push(product);
  write(product, 'foundation.json', JSON.stringify(recorded));

  const branch = tmp('branch');
  git(branch, 'clone', '-q', template, '.');
  git(branch, 'switch', '-q', '-c', 'from-acme/guard');
  return { template, product, branch };
}
const run = (product, ...args) => spawnSync(process.execPath, [PUSH, '--root', product, ...args], { encoding: 'utf8' });

test('which files are chosen, and which words name the product', () => {
  const files = ['packages/appshore/a.ts', 'packages/appshore/kernel/b.ts', 'tools/x.mjs'];
  assert.deepEqual(choose(files, []), files);
  assert.deepEqual(choose(files, ['packages/appshore/kernel/']), ['packages/appshore/kernel/b.ts']);
  assert.deepEqual(choose(files, ['tools/x.mjs', 'packages/appshore/a']), ['tools/x.mjs']);
  assert.deepEqual(productWords(scaffold, {}), ['acme', 'Acme']);
  assert.deepEqual(productWords({ name: 'app-foundation', displayName: 'CRM' }, {}), ['CRM']);
});

test('a product change arrives in the template with the renames undone, merged with what the template did since', () => {
  const { product, branch } = fixture();
  write(product, 'packages/appshore/guard.ts', LINES.replace('seven', 'SEVEN')); // the template changed line one since
  write(product, 'packages/appshore/name.ts', text(product, 'packages/appshore/name.ts').replace('c = 3', 'c = 30'));
  write(product, '.claude/skills/ac-plan/SKILL.md', '# Plan\n\nStep one.\n\nStep two.\n'); // a renamed skill
  write(product, 'packages/appshore/helper.ts', 'export const help = 1;\n'); // new in an owned folder
  write(product, 'packages/appshore/app.prisma', 'model Order {}\n'); // a seam: never sent
  write(product, 'README.md', '# Acme\n'); // the product's own
  fs.rmSync(path.join(product, 'packages/appshore/old.ts')); // a delete: never sent

  const dry = run(product, '--to', branch, '--dry-run');
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /dry run, nothing written\. 4 file\(s\) would be written, 0 to settle\./);
  assert.equal(git(branch, 'status', '--porcelain'), '');

  const push = run(product, '--to', branch);
  assert.equal(push.status, 0, push.stderr + push.stdout);
  assert.match(push.stdout, /\.claude\/skills\/app-plan\/SKILL\.md {2}\(here: \.claude\/skills\/ac-plan\/SKILL\.md\)/);
  assert.match(push.stdout, /Not sent \(1\)\n {2}packages\/appshore\/old\.ts\n {6}deleted here/);
  assert.match(push.stdout, /4 file\(s\) written, 0 to settle\. Nothing was committed/);
  assert.equal(text(branch, 'packages/appshore/guard.ts'), LINES.replace('one', 'ONE').replace('seven', 'SEVEN'));
  assert.equal(
    text(branch, 'packages/appshore/name.ts'),
    NAME.replace('c = 3', 'c = 30'),
    'the template keeps its name',
  );
  assert.equal(text(branch, '.claude/skills/app-plan/SKILL.md'), '# Plan\n\nStep one.\n\nStep two.\n');
  assert.equal(text(branch, 'packages/appshore/helper.ts'), 'export const help = 1;\n');
  assert.equal(text(branch, 'packages/appshore/app.prisma'), '// your models\n');
  assert.ok(fs.existsSync(path.join(branch, 'packages/appshore/old.ts')));
  assert.equal(git(branch, 'log', '--oneline').split('\n').length, 2, 'nothing was committed');

  git(branch, 'add', '-A');
  git(branch, 'commit', '-q', '-m', 'from acme');
  const again = run(product, '--to', branch);
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /nothing to send\. The chosen foundation files match the template\./);
});

test('only the named files are sent; a clash and a product name are left to settle, with exit 2', () => {
  const { product, branch } = fixture();
  write(product, 'packages/appshore/guard.ts', LINES.replace('one', 'uno')); // the template changed this line too
  write(product, 'packages/appshore/helper.ts', "export const owner = 'Acme';\n");
  write(product, 'packages/appshore/name.ts', text(product, 'packages/appshore/name.ts').replace('c = 3', 'c = 30'));

  const one = run(product, '--to', branch, 'packages/appshore/name.ts', '--json');
  assert.equal(one.status, 0, one.stderr);
  assert.deepEqual(JSON.parse(one.stdout).actions, [
    { rel: 'packages/appshore/name.ts', from: 'packages/appshore/name.ts' },
  ]);
  git(branch, 'add', '-A');
  git(branch, 'commit', '-q', '-m', 'name');

  const rest = run(product, '--to', branch);
  assert.equal(rest.status, 2, rest.stderr);
  assert.match(
    rest.stdout,
    /Conflicts: settle each one in the template checkout \(1\)\n {2}packages\/appshore\/guard\.ts/,
  );
  assert.match(
    rest.stdout,
    /Names this product: reword for every product \(1\)\n {2}packages\/appshore\/helper\.ts\n {6}Acme/,
  );
  assert.match(text(branch, 'packages/appshore/guard.ts'), /<<<<<<< template\nONE\n=======\nuno\n>>>>>>> product/);
});

test('a push is refused into the default branch, a dirty checkout, a product, and from the template itself', () => {
  const { template, product, branch } = fixture();
  write(product, 'packages/appshore/guard.ts', LINES.replace('seven', 'SEVEN'));

  const main = run(product, '--to', template);
  assert.equal(main.status, 1);
  assert.match(main.stderr, /--to is on "main"\. Make a branch for this first/);
  assert.equal(run(product, '--to', template, '--dry-run').status, 0, 'a dry run may look at the default branch');

  write(branch, 'scratch.txt', 'x');
  assert.match(run(product, '--to', branch).stderr, /--to has uncommitted changes/);
  assert.match(run(product, '--to', product).stderr, /--to is a product, not the template/);
  assert.match(run(product).stderr, /say where the template is checked out: --to <path>/);
  assert.match(run(template, '--to', branch).stderr, /this is the template \(v0\.2\.0\)/);
  assert.equal(text(template, 'packages/appshore/guard.ts'), LINES.replace('one', 'ONE'), 'main was never written');
});
