// Holds this repository's foundation.json: it is valid, and in the template every glob still points at something.
// A glob that matches no tracked file is a renamed or deleted folder nobody removed from the list; a seam outside
// every owned glob does nothing. A product may have dropped an optional feature, so there only the shape is held.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { globToRegExp, loadManifest, matcher } from './manifest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifest = loadManifest(ROOT);
const isTemplate = manifest.base === null;
const tracked = () =>
  execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter(Boolean);

test('foundation.json is valid', () => {
  assert.ok(manifest.version);
});

test('every owned and seam glob matches a tracked file', { skip: !isTemplate }, () => {
  const files = tracked();
  const dead = [...manifest.owned, ...manifest.seams].filter((g) => !files.some((f) => globToRegExp(g).test(f)));
  assert.deepEqual(dead, [], 'globs that match no tracked file');
});

test('every seam sits inside an owned glob', { skip: !isTemplate }, () => {
  const owned = matcher(manifest.owned);
  const files = tracked();
  const outside = manifest.seams.filter((g) => !files.some((f) => globToRegExp(g).test(f) && owned(f)));
  assert.deepEqual(outside, [], 'seams that carve nothing out of an owned area');
});

test('the template ships one version: package.json and foundation.json agree', { skip: !isTemplate }, () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.version, manifest.version);
});
