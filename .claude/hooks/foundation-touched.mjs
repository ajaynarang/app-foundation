#!/usr/bin/env node
/**
 * Claude Code hook: foundation touched (PostToolUse on Edit|MultiEdit|Write). Advisory: it never blocks the edit.
 *
 * In a product (foundation.json records a base), an edit to a file the template owns prints `FOUNDATION TOUCHED`
 * with the file, once per file per session, so the change can be offered back to the template when the work is
 * done. Silent in the template itself, for a seam, for the product's own files, and when there is no foundation.json.
 *
 * What was already said in a session is kept in a small file under the system temp folder, named by the session id.
 * Without a session id nothing is remembered and the line is printed each time.
 *
 * Root: the git toplevel of the edited file; without git, $CLAUDE_PROJECT_DIR, then the hook's cwd. Node built-ins
 * only. Tested by .claude/hooks/tests/hooks.test.mjs.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CLASS, MANIFEST_FILE, classifierFor, loadManifest } from '../../tools/foundation/manifest.mjs';
import { isEntryModule } from '../../tools/guards/workflow-config.mjs';
import { editedFile, emitContext, readInput, relativeTo, resolveRoot, runHook, workflowConfig } from './lib.mjs';

const SEEN_DIR = 'claude-foundation-touched';

/** True the first time `key` is seen in `session`; remembers it. Always true without a usable session id. */
export function firstTime(session, key, dir = path.join(os.tmpdir(), SEEN_DIR)) {
  if (typeof session !== 'string' || !/^[\w-]{1,128}$/.test(session)) return true;
  const file = path.join(dir, `${session}.json`);
  let seen = [];
  try {
    seen = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    // first edit of the session, or an unreadable file: start again
  }
  if (!Array.isArray(seen)) seen = [];
  if (seen.includes(key)) return false;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify([...seen, key]));
  } catch {
    // a temp folder that cannot be written only costs a repeated line
  }
  return true;
}

function main() {
  const input = readInput();
  const file = editedFile(input);
  if (!file) return;
  const { root } = resolveRoot(file, input);
  const rel = relativeTo(root, file);
  if (!rel || rel === MANIFEST_FILE) return;
  let manifest;
  try {
    manifest = loadManifest(root);
  } catch {
    return; // no record, or one the guards will report
  }
  if (manifest.base === null || classifierFor(manifest)(rel) !== CLASS.OWNED) return;
  if (!firstTime(input.session_id, `${root}:${rel}`)) return;
  const prefix = workflowConfig(root).skillPrefix ?? 'app';
  emitContext('PostToolUse', [
    `FOUNDATION TOUCHED: ${rel}`,
    `- The template owns this file (${MANIFEST_FILE}, base v${manifest.base.version}). The edit is fine here: a later foundation pull merges it.`,
    `- When this task is done, tell the user which foundation files changed and offer /${prefix}-push-foundation for a change every product should have. It is optional; never hold this work for it.`,
  ]);
}

if (isEntryModule(import.meta.url)) runHook(main);
