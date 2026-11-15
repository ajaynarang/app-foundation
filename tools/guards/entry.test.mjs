// The guards run as scripts from wherever the checkout lives. Each case copies the guard modules into a temp checkout
// whose path has a space and a non-ASCII character, breaks .claude/workflow.json, runs the guard as a subprocess and
// asserts it fails loudly. A guard that compares a percent-encoded URL path with process.argv[1] never calls main()
// there and exits 0 having checked nothing. Nothing here touches git.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function brokenCheckout() {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'guards-entry-')), 'sp ace é');
  const guards = path.join(root, 'tools', 'guards');
  fs.mkdirSync(guards, { recursive: true });
  for (const f of fs.readdirSync(HERE).filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs')))
    fs.copyFileSync(path.join(HERE, f), path.join(guards, f));
  fs.mkdirSync(path.join(root, '.claude'));
  fs.writeFileSync(path.join(root, '.claude', 'workflow.json'), '{}');
  return { root, guards };
}

for (const guard of ['skills-guard.mjs', 'ci-triggers.mjs']) {
  test(`${guard} runs and fails on a broken workflow.json from a path with a space`, () => {
    const { root, guards } = brokenCheckout();
    const r = spawnSync(process.execPath, [path.join(guards, guard)], { cwd: root, encoding: 'utf8' });
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}; stdout: ${r.stdout}; stderr: ${r.stderr}`);
    assert.match(r.stdout, /FAIL/);
    assert.match(r.stderr, /\[config\]/);
  });
}
