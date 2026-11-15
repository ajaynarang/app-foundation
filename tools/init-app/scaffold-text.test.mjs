// node --test tools/init-app/*.test.mjs   (root script: pnpm test:init-app, run by pnpm verify)
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  INIT_OPTIONS,
  clearVerifiedLines,
  formatJson,
  normalizeTenancy,
  stripPlansIgnore,
  verifiedLineFiles,
  writeWorkflowConfig,
} from './scaffold-text.mjs';
import { validateWorkflowConfig } from '../guards/workflow-config.mjs';

// Every temp folder a test makes is removed once the file's tests are done, so runs do not pile up in the temp dir.
const temps = [];
const tempDir = (prefix) => {
  const dir = fs.mkdtempSync(prefix);
  temps.push(dir);
  return dir;
};
after(() => {
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
});

const HERE = path.dirname(fileURLToPath(import.meta.url));

function tree(files) {
  const root = tempDir(path.join(os.tmpdir(), 'scaffold-text-'));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  return root;
}

test('--tenancy takes the mode names and the short names', () => {
  assert.equal(normalizeTenancy('multi'), 'multi');
  assert.equal(normalizeTenancy('mt'), 'multi');
  assert.equal(normalizeTenancy('single'), 'single');
  assert.equal(normalizeTenancy('st'), 'single');
  assert.equal(normalizeTenancy('personal'), 'personal');
  assert.equal(normalizeTenancy('MT'), null);
  assert.equal(normalizeTenancy('tenant'), null);
});

test('tracked plans: the plans folder line and the comment above it leave .gitignore, nothing else does', () => {
  const before = [
    '.worktrees/',
    '',
    '# Local AI planning artifacts (specs/plans) — kept out of the public repo',
    'docs/superpowers/',
    '',
    'docs/superpowers-other/',
    '',
  ].join('\n');
  assert.equal(
    stripPlansIgnore(before, 'docs/superpowers'),
    ['.worktrees/', '', 'docs/superpowers-other/', ''].join('\n'),
  );
  // The other spellings of the same pattern go too; a file without it is returned as it was.
  assert.equal(stripPlansIgnore('/docs/superpowers\nx\n', 'docs/superpowers'), 'x\n');
  assert.equal(stripPlansIgnore('docs/superpowers/**\n', 'docs/superpowers'), '');
  assert.equal(stripPlansIgnore('node_modules/\n', 'docs/superpowers'), 'node_modules/\n');
});

test('verified: lines leave the frontmatter of every doc; a verified: line in the body stays', () => {
  const root = tree({
    'docs/domain-map.md': '---\nowner: product\nverified: 2d3e125\nsources:\n  - a.ts\n---\n# Map\n',
    'docs/plain.md': '# Plain\n\nverified: in prose, not frontmatter\n',
    'docs/superpowers/plan.md': '---\nverified: abc1234\n---\n',
    'apps/x.ts': 'verified: 1\n',
  });
  assert.deepEqual(verifiedLineFiles(root), ['docs/domain-map.md']);
  const actions = clearVerifiedLines(root);
  assert.deepEqual(actions, ['clear verified: in docs/domain-map.md']);
  assert.equal(
    fs.readFileSync(path.join(root, 'docs/domain-map.md'), 'utf8'),
    '---\nowner: product\nsources:\n  - a.ts\n---\n# Map\n',
  );
  assert.equal(
    fs.readFileSync(path.join(root, 'docs/plain.md'), 'utf8'),
    '# Plain\n\nverified: in prose, not frontmatter\n',
  );
  assert.equal(fs.readFileSync(path.join(root, 'docs/superpowers/plan.md'), 'utf8'), '---\nverified: abc1234\n---\n');
  assert.deepEqual(verifiedLineFiles(root), []);
});

test('the shipped docs carry verified: lines, so the clearing step has work in a scaffold', () => {
  assert.ok(verifiedLineFiles(path.resolve(HERE, '..', '..')).length > 0);
});

test('workflow.json is rewritten with the prefix, the reserved names and the plans choice, and stays valid', () => {
  const root = tree({
    '.claude/workflow.json': JSON.stringify({
      $comment: 'kept',
      skillPrefix: 'app',
      reservedNames: ['acme-backend'],
      defaultBranch: 'main',
      plans: { folder: 'docs/superpowers', tracked: false },
      ci: 'manual',
      manualAlways: ['deploy-all.yml'],
      githubProject: null,
    }),
  });
  const cfg = writeWorkflowConfig(root, {
    skillPrefix: 'ac',
    reservedNames: ['acme-crm', 'acme-crm-inngest'],
    plansTracked: true,
  });
  const onDisk = JSON.parse(fs.readFileSync(path.join(root, '.claude/workflow.json'), 'utf8'));
  assert.deepEqual(onDisk, cfg);
  assert.equal(onDisk.$comment, 'kept');
  assert.equal(onDisk.skillPrefix, 'ac');
  assert.deepEqual(onDisk.reservedNames, ['acme-crm', 'acme-crm-inngest']);
  assert.deepEqual(onDisk.plans, { folder: 'docs/superpowers', tracked: true });
  assert.deepEqual(validateWorkflowConfig(onDisk), []);
});

test('every option has a flag, a question, its choices and a default', () => {
  const names = INIT_OPTIONS.map((o) => o.name);
  for (const flag of [
    'name',
    'display-name',
    'scope',
    'db',
    'tenancy',
    'mobile',
    'desk',
    'skill-prefix',
    'plans',
    'repo-url',
  ])
    assert.ok(names.includes(flag), `missing ${flag}`);
  for (const o of INIT_OPTIONS) {
    assert.equal(typeof o.question, 'string', o.name);
    assert.ok('default' in o && 'choices' in o, o.name);
  }
  const tenancy = INIT_OPTIONS.find((o) => o.name === 'tenancy');
  assert.deepEqual(tenancy.choices, ['multi', 'single', 'personal']);
  assert.equal(INIT_OPTIONS.find((o) => o.name === 'plans').default, 'tracked');
});

test('init-app --describe prints the options as JSON and changes nothing', () => {
  const out = execFileSync(process.execPath, [path.join(HERE, 'init-app.mjs'), '--describe'], { encoding: 'utf8' });
  const parsed = JSON.parse(out);
  assert.deepEqual(
    parsed.options.map((o) => o.name),
    INIT_OPTIONS.map((o) => o.name),
  );
  for (const o of parsed.options)
    for (const k of ['name', 'question', 'choices', 'default']) assert.ok(k in o, `${o.name}.${k}`);
});

test('the JSON layout matches the shipped workflow.json byte for byte, so a rewrite passes the format check', () => {
  const file = path.resolve(HERE, '..', '..', '.claude/workflow.json');
  const text = fs.readFileSync(file, 'utf8');
  assert.equal(formatJson(JSON.parse(text)), text);
  // A short list fits on one line, as Prettier would print it.
  assert.equal(formatJson({ a: ['x', 'y'], b: { c: 1 } }), '{\n  "a": ["x", "y"],\n  "b": { "c": 1 }\n}\n');
});
