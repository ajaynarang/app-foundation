/**
 * The skill prefix step of init-app. Every skill and agent of the template is named `app-<name>`; a product gets its
 * own prefix (`--skill-prefix`), so its skills never collide with Claude Code's built-in commands or with another
 * product's. This module picks the default, checks a prefix, renames the skill folders and agent files, and replaces
 * exactly those names, as whole tokens, in the text files the rename walker visits. It runs after the feature
 * manifests and the prune step, so the names are read from the folders that are left.
 *
 * Zero dependencies. Node >= 20.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PREFIX_PATTERN } from '../guards/workflow-config.mjs';
import { walkRepo } from './repo-walk.mjs';

const TEMPLATE_NAME = ['app', 'foundation'].join('-'); // split so this file survives the rename it describes
const MAX_SHORT_WORD = 8;

/**
 * One word of at most 8 characters: the word. Several words: their initials (`acme-crm` gives `ac`). One longer
 * word: its first three letters (`northwind` gives `nor`).
 */
export function defaultSkillPrefix(name) {
  const words = name.split('-').filter(Boolean);
  if (words.length > 1)
    return words
      .map((w) => w[0])
      .join('')
      .slice(0, 12);
  const [word = ''] = words;
  return word.length <= MAX_SHORT_WORD ? word : word.slice(0, 3);
}

/**
 * The reserved names for a product, from the template's list: the template name becomes the app name and `app-<x>`
 * becomes `<name>-<x>`, which is what the rename rules do to the same tokens. The bare app name is left out when it
 * is the prefix, since every skill name would then start with it.
 */
export function reservedNamesFor(name, prefix, templateReserved) {
  return templateReserved
    .map((r) => (r === TEMPLATE_NAME ? name : r.replace(/^app-/, `${name}-`)))
    .filter((r) => r !== prefix);
}

/** What is wrong with a prefix; empty when it is usable. `templateNames` are the skill and agent names (`app-…`). */
export function skillPrefixProblems(prefix, reserved, templateNames) {
  if (typeof prefix !== 'string' || !PREFIX_PATTERN.test(prefix))
    return [`"${prefix}" must be 2 to 12 lowercase letters or digits, starting with a letter`];
  const problems = [];
  if (reserved.includes(prefix)) problems.push(`"${prefix}" is a reserved name`);
  for (const old of templateNames) {
    const renamed = `${prefix}-${old.slice(old.indexOf('-') + 1)}`;
    const hit = reserved.find((r) => renamed === r || renamed.startsWith(`${r}-`));
    if (hit) problems.push(`with "${prefix}", ${old} becomes ${renamed}, which starts with the reserved name ${hit}`);
  }
  return problems;
}

/** The skill folders and agent files under `root` whose name starts with `<prefix>-`, sorted. */
export function workflowSkillNames(root, prefix) {
  const names = [];
  const skills = path.join(root, '.claude/skills');
  if (fs.existsSync(skills))
    for (const e of fs.readdirSync(skills, { withFileTypes: true })) if (e.isDirectory()) names.push(e.name);
  const agents = path.join(root, '.claude/agents');
  if (fs.existsSync(agents))
    for (const f of fs.readdirSync(agents)) if (f.endsWith('.md')) names.push(f.slice(0, -'.md'.length));
  return names.filter((n) => n.startsWith(`${prefix}-`)).sort();
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A regex matching any of `names` as a whole token: no letter, digit, `_` or `-` on either side. */
function tokenPattern(names) {
  const alternatives = [...names].sort((a, b) => b.length - a.length).map(escape);
  return new RegExp(`(?<![A-Za-z0-9_-])(${alternatives.join('|')})(?![A-Za-z0-9_-])`, 'g');
}

export function replaceSkillNames(text, names, from, to) {
  if (names.length === 0) return text;
  return text.replace(tokenPattern(names), (m) => `${to}-${m.slice(from.length + 1)}`);
}

// Source code never cites a skill (the skills guard's source target fails on one in a comment), so a token there that
// looks like a skill name is an identifier: `app-desk` is the Desk Inngest client's app id. Docs inside those folders
// are still in scope.
const SOURCE_ROOTS = ['apps/', 'packages/', 'infra/', 'tests/'];
export function inSkillNameScope(rel) {
  return rel.endsWith('.md') || !SOURCE_ROOTS.some((r) => rel.startsWith(r));
}

/**
 * Renames `<from>-<x>` skills and agents to `<to>-<x>` under `root`, then rewrites every whole-token mention in the
 * files the rename walker visits (within `inSkillNameScope`). Returns one line per action; with dryRun, changes
 * nothing and returns the same lines.
 */
export function renameSkills(root, { from, to, dryRun = false }) {
  const names = workflowSkillNames(root, from);
  if (from === to || names.length === 0) return [];
  const actions = [];
  const rename = (fromRel, toRel) => {
    actions.push(`${dryRun ? 'would rename' : 'rename'} ${fromRel} → ${toRel}`);
    if (!dryRun) fs.renameSync(path.join(root, fromRel), path.join(root, toRel));
  };
  const newName = (n) => `${to}-${n.slice(from.length + 1)}`;
  for (const n of names) {
    if (fs.existsSync(path.join(root, '.claude/skills', n)))
      rename(`.claude/skills/${n}`, `.claude/skills/${newName(n)}`);
    if (fs.existsSync(path.join(root, '.claude/agents', `${n}.md`)))
      rename(`.claude/agents/${n}.md`, `.claude/agents/${newName(n)}.md`);
  }
  let files = 0;
  // The folders are renamed first, so the walk below reads the new paths (in a dry run, the old ones).
  for (const { abs, rel } of walkRepo(root)) {
    if (!inSkillNameScope(rel)) continue;
    let text;
    try {
      text = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    if (text.includes('\0')) continue;
    const next = replaceSkillNames(text, names, from, to);
    if (next !== text) {
      files++;
      if (!dryRun) fs.writeFileSync(abs, next);
    }
  }
  actions.push(`${dryRun ? 'would replace' : 'replaced'} the ${names.length} names in ${files} file(s)`);
  return actions;
}

/** Every `<file>:<line>: <name>` where one of the old `names` is still a whole token, within the rename's scope. */
export function oldSkillNameHits(root, names) {
  if (names.length === 0) return [];
  const re = tokenPattern(names);
  const hits = [];
  for (const { abs, rel } of walkRepo(root)) {
    if (!inSkillNameScope(rel)) continue;
    let text;
    try {
      text = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    if (text.includes('\0')) continue;
    text.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(re)) hits.push(`${rel}:${i + 1}: ${m[1]}`);
    });
  }
  return hits;
}
