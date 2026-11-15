#!/usr/bin/env node
/**
 * guard:ci — holds the CI trigger rule (ADR "CI is manual by default; enforcement is local") for every file under
 * .github/workflows/, from `ci` and `manualAlways` in .claude/workflow.json.
 *
 *   ci = manual (the default)  every workflow has workflow_dispatch and no live push, pull_request,
 *                              pull_request_target, schedule or workflow_run trigger: nothing runs on its own.
 *   ci = on-push               every workflow keeps workflow_dispatch; check workflows may carry live triggers.
 *   check workflows            (every file not on manualAlways), in manual mode: also carry the commented push and
 *                              pull_request triggers and the one-line note, which names `on-push` (ENABLE_NOTE).
 *   manualAlways               never carries push, pull_request or pull_request_target, live or commented, in any
 *                              mode; every entry names a file that exists.
 *
 * In manual mode the live-trigger rule covers manualAlways files too. A line scan of the `on:` block (mapping, inline
 * and sequence forms), Node built-ins only (no YAML library). Exit 1 on any finding.
 *
 *   node tools/guards/ci-triggers.mjs [--root <dir>]
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { isEntryModule, loadWorkflowConfig, repoRootOf, WORKFLOW_FILE } from './workflow-config.mjs';

export const WORKFLOWS_DIR = '.github/workflows';
export const ENABLE_NOTE =
  'To run on every push and pull request, uncomment the two triggers below and set `ci` to `on-push` in `.claude/workflow.json`.';
const PUSH_TRIGGERS = ['push', 'pull_request', 'pull_request_target'];
const SELF_STARTING = [...PUSH_TRIGGERS, 'schedule', 'workflow_run'];
// A commented trigger line near the top level, inside the on: block or not. Indented `push:` keys elsewhere are step
// inputs (docker/build-push-action's `push: true`), not triggers.
const COMMENTED_PUSH_LINE = /^ {0,2}#\s*(push|pull_request|pull_request_target)\s*:/;

/** The `on:` triggers of a workflow file: live names, and the names of commented trigger lines inside the block. */
export function readTriggers(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^(on|"on"|'on'|true)\s*:/.test(l));
  if (start === -1) return { live: [], commented: [] };
  const rest = lines[start].replace(/^[^:]+:\s*/, '').replace(/\s+#.*$/, '');
  if (rest) return { live: rest.match(/[A-Za-z_][\w-]*/g) ?? [], commented: [] };

  const live = [];
  const commented = [];
  let childIndent = null;
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '') continue;
    if (!/^\s/.test(line) && !line.startsWith('#')) break; // the next top-level key
    const comment = line.match(/^\s*#\s*([\w-]+)\s*:/);
    if (comment) {
      commented.push(comment[1]);
      continue;
    }
    if (line.trimStart().startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;
    childIndent ??= indent;
    // A mapping key (`push:`) or a sequence item (`- push`) at the block's own indent names a trigger.
    const key = line.match(/^\s*([\w-]+)\s*:/) ?? line.match(/^\s*-\s+([\w-]+)\s*(?:#.*)?$/);
    if (indent === childIndent && key) live.push(key[1]);
  }
  return { live, commented };
}

const isManualAlways = (file, list) => list.some((n) => n === file || n === file.replace(/\.ya?ml$/, ''));

/** Every finding as { file, line, rule, message }; empty when the workflows hold the rule. */
export function checkWorkflows(root) {
  let cfg;
  try {
    cfg = loadWorkflowConfig(root);
  } catch (e) {
    return [{ file: WORKFLOW_FILE, line: 1, rule: 'config', message: e.message }];
  }
  const dir = path.join(root, WORKFLOWS_DIR);
  const files = fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => /\.ya?ml$/.test(f))
        .sort()
    : [];
  const findings = [];
  const add = (file, rule, message, line = 1) => findings.push({ file, line, rule, message });

  for (const name of cfg.manualAlways)
    if (!files.some((f) => isManualAlways(f, [name])))
      add(name, 'stale-entry', `manualAlways in ${WORKFLOW_FILE} names a workflow that does not exist`);

  for (const file of files) {
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    const { live, commented } = readTriggers(text);
    if (!live.includes('workflow_dispatch')) add(file, 'no-dispatch', 'must keep workflow_dispatch as a live trigger');

    // In manual mode nothing may start on its own, manualAlways (deploy and apply) workflows included.
    if (cfg.ci === 'manual')
      for (const t of live.filter((t) => SELF_STARTING.includes(t)))
        add(file, 'live-trigger', `ci is "manual" in ${WORKFLOW_FILE}: the ${t} trigger must be commented out`);

    if (isManualAlways(file, cfg.manualAlways)) {
      const found = new Set([...live, ...commented].filter((t) => PUSH_TRIGGERS.includes(t)));
      for (const l of text.split('\n')) found.add(l.match(COMMENTED_PUSH_LINE)?.[1]);
      found.delete(undefined);
      for (const t of found)
        add(file, 'manual-always', `is on manualAlways: no ${t} trigger, live or commented, in any CI mode`);
      continue;
    }

    if (cfg.ci !== 'manual') continue;
    for (const t of ['push', 'pull_request'])
      if (!commented.includes(t) && !live.includes(t))
        add(file, 'commented-triggers', `a check workflow keeps its ${t} trigger in the on: block, commented out`);
    const hasNote = text
      .split('\n')
      .some((l) => l.trimStart().startsWith('#') && /uncomment/i.test(l) && l.includes('`on-push`'));
    if (!hasNote) add(file, 'enable-note', `needs the one-line note naming \`on-push\`: "# ${ENABLE_NOTE}"`);
  }
  return findings;
}

function main() {
  const i = process.argv.indexOf('--root');
  const root = i > -1 ? path.resolve(process.argv[i + 1]) : repoRootOf(import.meta.url);
  const findings = checkWorkflows(root);
  for (const f of findings)
    console.error(
      `${f.file === WORKFLOW_FILE ? f.file : `${WORKFLOWS_DIR}/${f.file}`}:${f.line}: [${f.rule}] ${f.message}`,
    );
  console.log(`guard:ci: ${findings.length ? `FAIL (${findings.length} finding(s))` : 'PASS'}`);
  process.exit(findings.length ? 1 : 0);
}

if (isEntryModule(import.meta.url)) main();
