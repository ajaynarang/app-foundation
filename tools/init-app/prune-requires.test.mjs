// Tests for prune-requires.mjs: after the feature manifests run, init-app deletes every skill, reference, agent and
// hotspot file that requires a feature whose folder is gone, and the index rows that linked to a deleted file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pruneRequires } from './prune-requires.mjs';
import { FEATURE_FOLDERS } from '../guards/skills-guard.mjs';

function repo(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-requires-'));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    if (text !== null) fs.writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}
const exists = (dir, rel) => fs.existsSync(path.join(dir, rel));
const fm = (body) => `---\n${body}\n---\n\n# Title\n`;

const INDEX = `${fm('name: fx-conventions\nowner: foundation')}
| Working on | Read |
| --- | --- |
| The API | [api](references/api.md) |
| The phone app | [mobile](references/mobile.md) |
| The workflow engine | [the feature skill](../fx-feature/SKILL.md) |
| Plain row | none |
`;

const files = () => ({
  '.claude/skills/fx-conventions/SKILL.md': INDEX,
  '.claude/skills/fx-conventions/references/api.md': fm('owner: foundation'),
  '.claude/skills/fx-conventions/references/mobile.md': fm('owner: foundation\nrequires: mobile'),
  '.claude/skills/fx-feature/SKILL.md': fm('name: fx-feature\nowner: foundation\nrequires: desk'),
  '.claude/hooks/hotspots/foundation.json': '{ "hotspots": [] }\n',
  '.claude/hooks/hotspots/desk.json': '{ "hotspots": [] }\n',
  '.claude/hooks/hotspots/mobile.json': '{ "requires": "mobile", "hotspots": [] }\n',
});

test('with both feature folders absent, every requires: file and its index rows go', () => {
  const dir = repo(files());
  const actions = pruneRequires(dir);
  assert.ok(!exists(dir, '.claude/skills/fx-feature'));
  assert.ok(!exists(dir, '.claude/skills/fx-conventions/references/mobile.md'));
  assert.ok(!exists(dir, '.claude/hooks/hotspots/desk.json'));
  assert.ok(!exists(dir, '.claude/hooks/hotspots/mobile.json'));
  assert.ok(exists(dir, '.claude/hooks/hotspots/foundation.json'));
  assert.ok(exists(dir, '.claude/skills/fx-conventions/references/api.md'));
  const index = fs.readFileSync(path.join(dir, '.claude/skills/fx-conventions/SKILL.md'), 'utf8');
  assert.ok(index.includes('| The API |'));
  assert.ok(index.includes('| Plain row |'));
  assert.ok(!index.includes('The phone app'));
  assert.ok(!index.includes('The workflow engine'));
  assert.equal(actions.length, 6);
});

test('a file whose feature folder exists stays', () => {
  const dir = repo({ ...files(), [`${FEATURE_FOLDERS.mobile}/pubspec.yaml`]: 'name: x\n' });
  fs.mkdirSync(path.join(dir, FEATURE_FOLDERS.desk), { recursive: true });
  assert.deepEqual(pruneRequires(dir), []);
  assert.ok(exists(dir, '.claude/skills/fx-feature/SKILL.md'));
  assert.ok(exists(dir, '.claude/hooks/hotspots/desk.json'));
});

test('a row whose link a feature manifest already removed is dropped too', () => {
  const dir = repo(files());
  fs.mkdirSync(path.join(dir, FEATURE_FOLDERS.desk), { recursive: true });
  fs.mkdirSync(path.join(dir, FEATURE_FOLDERS.mobile), { recursive: true });
  fs.rmSync(path.join(dir, '.claude/skills/fx-feature'), { recursive: true });
  pruneRequires(dir);
  const index = fs.readFileSync(path.join(dir, '.claude/skills/fx-conventions/SKILL.md'), 'utf8');
  assert.ok(!index.includes('The workflow engine'));
  assert.ok(index.includes('The phone app'));
});

test('dry run reports and changes nothing', () => {
  const dir = repo(files());
  const actions = pruneRequires(dir, { dryRun: true });
  assert.equal(actions.length, 6);
  assert.ok(exists(dir, '.claude/skills/fx-feature/SKILL.md'));
  assert.ok(fs.readFileSync(path.join(dir, '.claude/skills/fx-conventions/SKILL.md'), 'utf8').includes('phone app'));
});

test('a repo with no .claude folder is a no-op', () => {
  assert.deepEqual(pruneRequires(repo({ 'README.md': '# x\n' })), []);
});

test('a dry run counts the features init-app is about to remove as absent, though their folders are still there', () => {
  const dir = repo({ ...files(), [`${FEATURE_FOLDERS.mobile}/pubspec.yaml`]: 'name: x\n' });
  fs.mkdirSync(path.join(dir, FEATURE_FOLDERS.desk), { recursive: true });
  const actions = pruneRequires(dir, { dryRun: true, absentFeatures: ['desk', 'mobile'] });
  assert.equal(actions.length, 6);
  assert.ok(exists(dir, '.claude/skills/fx-feature/SKILL.md'));
  assert.deepEqual(pruneRequires(dir, { dryRun: true, absentFeatures: ['desk'] }).length, 3);
});

test("the template's own conventions index loses its Desk row, and only that row, when Desk is removed", () => {
  // The real .claude and docs folders (the index links ADRs), as `--desk no` leaves them: apply-feature has deleted the Desk skill (a manifest path) and
  // the Desk folder is gone. The index row that linked the skill must go; every other row stays.
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-requires-real-'));
  for (const top of ['.claude', 'docs']) fs.cpSync(path.join(root, top), path.join(dir, top), { recursive: true });
  // Mobile stays in this scaffold, so its reference and row must stay too.
  fs.mkdirSync(path.join(dir, FEATURE_FOLDERS.mobile), { recursive: true });
  const indexRel = '.claude/skills/app-conventions/SKILL.md';
  const before = fs.readFileSync(path.join(dir, indexRel), 'utf8');
  const deskRows = before.split('\n').filter((l) => l.startsWith('|') && l.includes('(../desk-patterns/SKILL.md)'));
  assert.equal(deskRows.length, 1, 'the index has one Desk row, linked to the Desk skill');
  fs.rmSync(path.join(dir, '.claude/skills/desk-patterns'), { recursive: true });

  pruneRequires(dir);

  const after = fs.readFileSync(path.join(dir, indexRel), 'utf8');
  assert.ok(!after.includes('desk-patterns'));
  assert.equal(after.split('\n').length, before.split('\n').length - 1);
  assert.ok(!exists(dir, '.claude/hooks/hotspots/desk.json'));
});

test("the template's own conventions index loses its mobile row and the mobile reference, and only those, when mobile is removed", () => {
  // The real .claude and docs folders, as `--mobile no` leaves them: apps/mobile is gone, Desk stays.
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-requires-mobile-'));
  for (const top of ['.claude', 'docs']) fs.cpSync(path.join(root, top), path.join(dir, top), { recursive: true });
  fs.mkdirSync(path.join(dir, FEATURE_FOLDERS.desk), { recursive: true });
  const indexRel = '.claude/skills/app-conventions/SKILL.md';
  const mobileRel = '.claude/skills/app-conventions/references/mobile.md';
  assert.ok(exists(dir, mobileRel), 'the template ships a mobile reference');
  const before = fs.readFileSync(path.join(dir, indexRel), 'utf8');
  const mobileRows = before.split('\n').filter((l) => l.startsWith('|') && l.includes('(references/mobile.md)'));
  assert.equal(mobileRows.length, 1, 'the index has one mobile row, linked to the mobile reference');

  pruneRequires(dir);

  assert.ok(!exists(dir, mobileRel));
  const after = fs.readFileSync(path.join(dir, indexRel), 'utf8');
  assert.ok(!after.includes('references/mobile.md'));
  assert.equal(after.split('\n').length, before.split('\n').length - 1);
  assert.ok(exists(dir, '.claude/skills/desk-patterns/SKILL.md'));
});
