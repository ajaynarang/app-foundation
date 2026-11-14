// node --test tools/init-app/*.test.mjs   (root script: pnpm test:init-app, run by pnpm verify)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { walkRepo } from './repo-walk.mjs';

function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-walk-'));
  for (const rel of files) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), 'x\n');
  }
  return root;
}

test('the walker skips git worktrees: .worktrees/ at the root and .claude/worktrees/', () => {
  const root = tree([
    'a.ts',
    '.claude/skills/x/SKILL.md',
    '.claude/settings.json',
    '.worktrees/feature/apps/backend/src/x.ts',
    '.claude/worktrees/agent-1/README.md',
  ]);
  try {
    assert.deepEqual([...walkRepo(root)].map((f) => f.rel).sort(), [
      '.claude/settings.json',
      '.claude/skills/x/SKILL.md',
      'a.ts',
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a folder named worktrees elsewhere is still walked', () => {
  const root = tree(['docs/worktrees/guide.md', 'apps/web/.worktrees-notes.md']);
  try {
    assert.deepEqual([...walkRepo(root)].map((f) => f.rel).sort(), [
      'apps/web/.worktrees-notes.md',
      'docs/worktrees/guide.md',
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
