// node --test tools/init-app/*.test.mjs   (root script: pnpm test:init-app, run by pnpm verify)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareResidue, loadResidue, residueHits, runwayStarterCheck } from './check-variants.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

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
