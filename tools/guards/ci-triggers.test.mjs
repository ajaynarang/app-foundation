// Tests for tools/guards/ci-triggers.mjs. Each case writes a throwaway repo (a .claude/workflow.json and one or more
// workflow files) into a temp folder; nothing here touches git.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkWorkflows, ENABLE_NOTE } from './ci-triggers.mjs';

const BASE_CFG = {
  skillPrefix: 'fx',
  reservedNames: ['fx-backend'],
  defaultBranch: 'main',
  plans: { folder: 'docs/plans', tracked: true },
  ci: 'manual',
  manualAlways: ['deploy.yml'],
  githubProject: null,
};

const CHECK_OK = `# check.yml
# ${ENABLE_NOTE}
name: Check
on:
  # push:
  #   branches: [main]
  # pull_request:
  #   branches: [main]
  workflow_dispatch:
jobs:
  a:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
`;

const DEPLOY_OK = `name: Deploy
# Manual only: it changes a live environment.
on:
  workflow_dispatch:
    inputs:
      environment:
        type: choice
        options: [staging, production]
jobs:
  a:
    runs-on: ubuntu-latest
    steps:
      - run: echo deploy
`;

function repo(files, cfg = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-triggers-'));
  fs.mkdirSync(path.join(dir, '.claude'));
  fs.writeFileSync(path.join(dir, '.claude/workflow.json'), JSON.stringify({ ...BASE_CFG, ...cfg }));
  fs.mkdirSync(path.join(dir, '.github/workflows'), { recursive: true });
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, '.github/workflows', name), body);
  return dir;
}

const rules = (dir) => checkWorkflows(dir).map((f) => `${f.file}:${f.rule}`);

test('a manual check workflow with commented triggers and the note, and a manual deploy workflow, pass', () => {
  assert.deepEqual(rules(repo({ 'check.yml': CHECK_OK, 'deploy.yml': DEPLOY_OK })), []);
});

test('a live push trigger fails in manual mode', () => {
  const body = CHECK_OK.replace('  # push:\n  #   branches: [main]\n', '  push:\n    branches: [main]\n');
  assert.ok(rules(repo({ 'check.yml': body })).includes('check.yml:live-trigger'));
});

test('a live pull_request_target trigger fails in manual mode', () => {
  const body = CHECK_OK.replace('  workflow_dispatch:', '  pull_request_target:\n  workflow_dispatch:');
  assert.ok(rules(repo({ 'check.yml': body })).includes('check.yml:live-trigger'));
});

test('a live schedule fails in manual mode, since nothing may run on its own', () => {
  const body = CHECK_OK.replace('  workflow_dispatch:', "  schedule:\n    - cron: '0 3 * * *'\n  workflow_dispatch:");
  assert.ok(rules(repo({ 'check.yml': body })).includes('check.yml:live-trigger'));
});

test('a workflow without workflow_dispatch fails', () => {
  const body = CHECK_OK.replace('  workflow_dispatch:\n', '');
  assert.ok(rules(repo({ 'check.yml': body })).includes('check.yml:no-dispatch'));
});

test('the inline forms of on: are read', () => {
  const inline = 'name: X\non: [push, workflow_dispatch]\njobs: {}\n';
  assert.ok(rules(repo({ 'check.yml': inline })).includes('check.yml:live-trigger'));
  const single = 'name: X\non: workflow_dispatch\njobs: {}\n';
  assert.ok(rules(repo({ 'deploy.yml': single })).length === 0);
});

test('a check workflow without the commented push and pull_request triggers fails', () => {
  const body = CHECK_OK.replace('  # pull_request:\n  #   branches: [main]\n', '');
  assert.ok(rules(repo({ 'check.yml': body })).includes('check.yml:commented-triggers'));
});

test('a check workflow with the old one-step note (no on-push) fails', () => {
  const body = CHECK_OK.replace(`# ${ENABLE_NOTE}`, '# To run on every push, uncomment the two triggers below.');
  assert.ok(rules(repo({ 'check.yml': body })).includes('check.yml:enable-note'));
});

test('a manualAlways workflow with a commented push trigger fails', () => {
  const body = DEPLOY_OK.replace('on:\n', 'on:\n  # push:\n  #   branches: [main]\n');
  assert.ok(rules(repo({ 'deploy.yml': body })).includes('deploy.yml:manual-always'));
});

test('a manualAlways workflow with a live pull_request trigger fails in on-push mode too', () => {
  const body = DEPLOY_OK.replace('on:\n', 'on:\n  pull_request:\n');
  assert.ok(rules(repo({ 'deploy.yml': body }, { ci: 'on-push' })).includes('deploy.yml:manual-always'));
});

test('a manualAlways workflow with a live schedule or workflow_run fails in manual mode', () => {
  const schedule = DEPLOY_OK.replace('on:\n', "on:\n  schedule:\n    - cron: '0 3 * * *'\n");
  assert.ok(rules(repo({ 'deploy.yml': schedule })).includes('deploy.yml:live-trigger'));
  const run = DEPLOY_OK.replace('on:\n', 'on:\n  workflow_run:\n    workflows: [Check]\n    types: [completed]\n');
  assert.ok(rules(repo({ 'deploy.yml': run })).includes('deploy.yml:live-trigger'));
});

test('a manualAlways workflow with a commented push trigger outside the on: block fails', () => {
  const body = DEPLOY_OK.replace('on:\n', '# push:\n#   branches: [main]\non:\n');
  assert.ok(rules(repo({ 'deploy.yml': body })).includes('deploy.yml:manual-always'));
});

test('the sequence form of on: is read', () => {
  const pushList = 'name: X\non:\n  - push\n  - workflow_dispatch\njobs: {}\n';
  assert.ok(rules(repo({ 'deploy.yml': pushList })).includes('deploy.yml:manual-always'));
  assert.ok(rules(repo({ 'check.yml': pushList }, { manualAlways: [] })).includes('check.yml:live-trigger'));
  const manualList = 'name: X\non:\n  - workflow_dispatch\njobs: {}\n';
  assert.deepEqual(rules(repo({ 'deploy.yml': manualList })), []);
});

test('prose that mentions push without a colon is not a trigger', () => {
  const body = DEPLOY_OK.replace('# Manual only', '# No push or pull_request trigger, live or commented. Manual only');
  assert.deepEqual(rules(repo({ 'deploy.yml': body })), []);
});

test('in on-push mode a check workflow may carry live triggers but must keep workflow_dispatch', () => {
  const live = CHECK_OK.replace(
    '  # push:\n  #   branches: [main]\n  # pull_request:\n  #   branches: [main]\n',
    '  push:\n    branches: [main]\n  pull_request:\n    branches: [main]\n',
  );
  assert.deepEqual(rules(repo({ 'check.yml': live }, { ci: 'on-push', manualAlways: [] })), []);
  const noDispatch = live.replace('  workflow_dispatch:\n', '');
  assert.ok(
    rules(repo({ 'check.yml': noDispatch }, { ci: 'on-push', manualAlways: [] })).includes('check.yml:no-dispatch'),
  );
});

test('a manualAlways entry that names no workflow file fails', () => {
  assert.ok(rules(repo({ 'check.yml': CHECK_OK }, { manualAlways: ['gone.yml'] })).includes('gone.yml:stale-entry'));
});

test('an invalid workflow.json fails the guard', () => {
  assert.ok(rules(repo({ 'check.yml': CHECK_OK }, { ci: 'sometimes' })).some((r) => r.endsWith(':config')));
});

test('the repository itself passes', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  assert.deepEqual(checkWorkflows(root), []);
});
