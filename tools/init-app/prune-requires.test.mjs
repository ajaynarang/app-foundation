// Tests for prune-requires.mjs: after the feature manifests run, init-app deletes every skill, reference, agent and
// hotspot file that requires a feature whose folder is gone, and the index rows that linked to a deleted file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
