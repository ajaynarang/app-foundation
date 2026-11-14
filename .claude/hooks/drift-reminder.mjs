#!/usr/bin/env node
/**
 * Claude Code hook: drift reminder (PostToolUse on Edit|MultiEdit|Write). Advisory: it never blocks the edit. Two
 * jobs, each silent unless it has something to say:
 *
 *   1. Hotspots. .claude/hooks/hotspots/*.json (foundation.json, product.json, one file per optional feature) list
 *      paths whose change makes something else untrue: { "hotspots": [{ "paths": [globs], "say": "...",
 *      "docs": [repo paths] }] }. A hotspot's docs are named only while they exist; the skills guard fails on a
 *      path in these files that does not exist.
 *   2. Reverse lookup. When a skill, agent or doc lists the edited file in its `sources:` frontmatter, it names that
 *      file, so it is re-read and corrected in the same pull request.
 *
 * Root: the git toplevel of the edited file; without git, $CLAUDE_PROJECT_DIR, then the hook's cwd. Node built-ins
 * only. Tested by .claude/hooks/tests/hooks.test.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { globToRegExp, parseFrontmatter } from '../../tools/guards/skills-guard.mjs';
import { isEntryModule } from '../../tools/guards/workflow-config.mjs';
import { editedFile, emitContext, readInput, relativeTo, resolveRoot, runHook, workflowConfig } from './lib.mjs';

const HOTSPOTS_DIR = '.claude/hooks/hotspots';
const SOURCES_DIRS = ['.claude/skills', '.claude/agents', 'docs'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'worktrees']);

const matchesPath = (pattern, rel) => {
  const p = pattern.replace(/#.*$/, '').replace(/\/$/, '');
  return /[*?{]/.test(p) ? globToRegExp(p).test(rel) : rel === p || rel.startsWith(p + '/');
};

/** The hotspot lines for `rel`, from every file under .claude/hooks/hotspots. */
export function hotspotLines(root, rel) {
  const dir = path.join(root, HOTSPOTS_DIR);
  if (!fs.existsSync(dir)) return [];
  const lines = [];
  for (const name of fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()) {
    let json;
    try {
      json = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    } catch {
      continue; // the skills guard reports an unreadable hotspot file
    }
    for (const h of Array.isArray(json.hotspots) ? json.hotspots : []) {
      if (!Array.isArray(h.paths) || !h.paths.some((p) => typeof p === 'string' && matchesPath(p, rel))) continue;
      const docs = (Array.isArray(h.docs) ? h.docs : []).filter((d) => fs.existsSync(path.join(root, d)));
      lines.push(`- ${h.say}${docs.length ? ` Check: ${docs.join(', ')}.` : ''}`);
    }
  }
  return lines;
}

function* markdownFiles(root, rel) {
  let entries;
  try {
    entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const child = `${rel}/${e.name}`;
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) yield* markdownFiles(root, child);
    } else if (e.name.endsWith('.md')) yield child;
  }
}

/** The skills, agents and docs whose `sources:` name `rel` (a path, a folder, a glob or a `path#Symbol`). */
export function sourcesCiting(root, rel) {
  const plans = workflowConfig(root).plans?.folder;
  const out = [];
  for (const dir of SOURCES_DIRS)
    for (const doc of markdownFiles(root, dir)) {
      if (doc === rel || (plans && doc.startsWith(plans + '/'))) continue;
      const { fm } = parseFrontmatter(fs.readFileSync(path.join(root, doc), 'utf8'));
      const sources = Array.isArray(fm?.sources) ? fm.sources : fm?.sources ? [fm.sources] : [];
      if (sources.some((s) => matchesPath(s, rel))) out.push(doc);
    }
  return out;
}

function main() {
  const input = readInput();
  const file = editedFile(input);
  if (!file) return;
  const { root } = resolveRoot(file, input);
  const rel = relativeTo(root, file);
  if (!rel) return;
  const lines = hotspotLines(root, rel);
  const citing = sourcesCiting(root, rel);
  if (citing.length)
    lines.push(
      `- ${citing.join(', ')} ${citing.length === 1 ? 'describes' : 'describe'} this file (sources:). Re-read and correct ${citing.length === 1 ? 'it' : 'them'} in this pull request.`,
    );
  if (lines.length) emitContext('PostToolUse', [`drift-reminder: ${rel}`, ...lines]);
}

if (isEntryModule(import.meta.url)) runHook(main);
