#!/usr/bin/env node
/**
 * Claude Code hook: convention gate (PostToolUse on Edit|MultiEdit|Write). Advisory: it never blocks the edit. It
 * runs the one gate implementation, tools/guards/convention-gate.mjs, on the edited file and, when the file now has
 * more hits of a rule than the baseline allows, tells Claude which rule and how to fix it. The same gate blocks in
 * the pre-commit hook, the pre-push hook and `pnpm verify`.
 *
 * Root: the git toplevel of the edited file (so a worktree reads its own baseline); without git,
 * $CLAUDE_PROJECT_DIR, then the hook's cwd. Node built-ins only. Tested by .claude/hooks/tests/hooks.test.mjs.
 */
import { checkOne, ruleMessage } from '../../tools/guards/convention-gate.mjs';
import { isEntryModule } from '../../tools/guards/workflow-config.mjs';
import { editedFile, emitContext, readInput, relativeTo, resolveRoot, runHook } from './lib.mjs';

function main() {
  const input = readInput();
  const file = editedFile(input);
  if (!file) return;
  const { root } = resolveRoot(file, input);
  const rel = relativeTo(root, file);
  if (!rel) return;
  const { over } = checkOne(root, rel);
  if (!over.length) return;
  emitContext('PostToolUse', [
    `convention-gate: ${rel}`,
    ...over.map((o) => `- [${o.rule}] ${ruleMessage(o.rule)} (${o.count} here, the baseline allows ${o.allowed}).`),
    'Fix it now: the pre-commit hook runs the same gate and blocks the commit.',
  ]);
}

if (isEntryModule(import.meta.url)) runHook(main);
