/**
 * Shared by the Claude Code hooks in this folder. Node built-ins only.
 *
 * The hook contract: Claude Code writes one JSON object on stdin (`hook_event_name`, `tool_name`,
 * `tool_input.file_path`, `cwd`) and sets `$CLAUDE_PROJECT_DIR`. A PostToolUse hook reaches Claude through
 * `hookSpecificOutput.additionalContext` on stdout; a PreToolUse hook blocks the call by exiting 2 with the reason on
 * stderr. Every hook here exits 0 on input it does not understand, so a malformed call never blocks an edit.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/** Reads the hook input from stdin. Returns null when stdin is empty or is not a JSON object. */
export function readInput() {
  let raw = '';
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch {
    return null;
  }
  try {
    const input = JSON.parse(raw);
    return input && typeof input === 'object' && !Array.isArray(input) ? input : null;
  } catch {
    return null;
  }
}

/** The edited file's absolute path, or null. Relative paths resolve against the hook's `cwd`. */
export function editedFile(input) {
  const p = input?.tool_input?.file_path;
  if (typeof p !== 'string' || !p) return null;
  return path.resolve(typeof input.cwd === 'string' ? input.cwd : process.cwd(), p);
}

/**
 * The environment for a git call: git's own repository variables removed, so a hook started from inside a git
 * hook (GIT_DIR set) still asks about the edited file's checkout and nothing else.
 */
export function gitEnv() {
  const env = { ...process.env };
  for (const key of [
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_INDEX_FILE',
    'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES',
    'GIT_COMMON_DIR',
    'GIT_PREFIX',
    'GIT_NAMESPACE',
    'GIT_CONFIG',
    'GIT_CONFIG_PARAMETERS',
    'GIT_CONFIG_COUNT',
    'GIT_GRAFT_FILE',
    'GIT_IMPLICIT_WORK_TREE',
    'GIT_INTERNAL_SUPER_PREFIX',
    'GIT_NO_REPLACE_OBJECTS',
    'GIT_REPLACE_REF_BASE',
    'GIT_SHALLOW_FILE',
  ])
    delete env[key];
  return env;
}

/** Runs git read-only in `dir`. Returns { ok, out }; ok is false when git is missing or the command failed. */
export function git(dir, args) {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: gitEnv(), timeout: 5000 });
  return { ok: !r.error && r.status === 0, out: (r.stdout ?? '').trim() };
}

/** The real path of `p`, or of its nearest existing ancestor with the rest appended (a file Write is creating). */
export function realish(p) {
  let dir = p;
  const rest = [];
  while (!fs.existsSync(dir)) {
    const parent = path.dirname(dir);
    if (parent === dir) return p;
    rest.unshift(path.basename(dir));
    dir = parent;
  }
  return path.join(fs.realpathSync(dir), ...rest);
}

/**
 * The checkout the edited file belongs to: its git toplevel, so a worktree under .worktrees/ is its own root;
 * without git, `$CLAUDE_PROJECT_DIR`, then the hook's `cwd`.
 */
export function resolveRoot(file, input) {
  let dir = realish(file);
  while (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) dir = path.dirname(dir);
  const top = git(dir, ['rev-parse', '--show-toplevel']);
  if (top.ok && top.out) return { root: realish(top.out), git: true };
  const fallback = process.env.CLAUDE_PROJECT_DIR || input?.cwd || process.cwd();
  return { root: realish(path.resolve(fallback)), git: false };
}

/** The file's path relative to `root`, in posix form, or null when it is outside `root`. */
export function relativeTo(root, file) {
  const rel = path.relative(root, realish(file)).split(path.sep).join('/');
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : null;
}

/** Reads `<root>/.claude/workflow.json` loosely; the guards validate it, a hook only needs a default. */
export function workflowConfig(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, '.claude/workflow.json'), 'utf8'));
  } catch {
    return {};
  }
}

/** Prints the context line(s) Claude sees after the tool call. Nothing is printed for an empty list. */
export function emitContext(event, lines) {
  if (!lines.length) return;
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: lines.join('\n') } }) + '\n',
  );
}

/** Runs a hook body; an unexpected error is reported on stderr and never blocks the edit. */
export function runHook(body) {
  try {
    body();
  } catch (e) {
    process.stderr.write(`${path.basename(process.argv[1] ?? 'hook')}: ${e?.message ?? e}\n`);
    process.exit(0);
  }
}
