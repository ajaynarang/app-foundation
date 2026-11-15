import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CONSTANTS_FILE,
  isValidRepoUrl,
  repoUrlFromRemote,
  setObservabilityConstants,
} from './observability-constants.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const shipped = fs.readFileSync(path.join(ROOT, CONSTANTS_FILE), 'utf8');

test('the rule sets PROJECT and REPO_URL in the shipped constants file, and nothing else', () => {
  const out = setObservabilityConstants(shipped, { project: 'acme-crm', repoUrl: 'https://github.com/acme/crm' });
  assert.match(out, /^export const PROJECT = 'acme-crm';$/m);
  assert.match(out, /^export const REPO_URL = 'https:\/\/github\.com\/acme\/crm';$/m);
  // The placeholder constant stays, so grafana-apply can still tell a set URL from an unset one.
  assert.match(out, /^export const REPO_URL_PLACEHOLDER = 'https:\/\/github\.com\/your-org\/your-repo';$/m);
  const changed = out.split('\n').filter((line, i) => line !== shipped.split('\n')[i]);
  assert.equal(changed.length, 2);
});

test('without a repo URL the placeholder stays', () => {
  const out = setObservabilityConstants(shipped, { project: 'acme-crm' });
  assert.match(out, /^export const PROJECT = 'acme-crm';$/m);
  assert.match(out, /^export const REPO_URL = 'https:\/\/github\.com\/your-org\/your-repo';$/m);
});

test('a constants file without the lines to set is refused', () => {
  assert.throws(() => setObservabilityConstants('export const X = 1;\n', { project: 'a' }), /no "export const PROJECT/);
});

test('a git remote becomes a web URL; anything else is refused', () => {
  assert.equal(repoUrlFromRemote('git@github.com:acme/crm.git'), 'https://github.com/acme/crm');
  assert.equal(repoUrlFromRemote('https://github.com/acme/crm.git'), 'https://github.com/acme/crm');
  assert.equal(repoUrlFromRemote('https://user@github.com/acme/crm'), 'https://github.com/acme/crm');
  assert.equal(repoUrlFromRemote(''), null);
  assert.equal(repoUrlFromRemote('/local/path'), null);
  assert.ok(isValidRepoUrl('https://github.com/acme/crm'));
  assert.ok(!isValidRepoUrl("https://github.com/acme/crm'; evil"));
});
