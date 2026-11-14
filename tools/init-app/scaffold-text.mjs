/**
 * The smaller init-app steps that are not a rename: the option table (the prompts and `--describe` read the same
 * list, so a caller that asks what `--describe` prints cannot drift from the tool), tenancy names, the plans choice
 * in `.gitignore` and `.claude/workflow.json`, and clearing the template's `verified:` lines.
 *
 * Zero dependencies. Node >= 20.
 */
import fs from 'node:fs';
import path from 'node:path';
import { WORKFLOW_FILE } from '../guards/workflow-config.mjs';
import { walkRepo } from './repo-walk.mjs';

/**
 * Every option init-app asks for, in the order it asks. `default` is the value used when the option is not given;
 * null means it is worked out from another answer, as `defaultRule` says. `choices` is null for free text.
 */
export const INIT_OPTIONS = [
  {
    name: 'name',
    question: 'App name (kebab-case slug, e.g. acme-crm)',
    choices: null,
    default: null,
    defaultRule: 'required',
  },
  {
    name: 'display-name',
    question: 'Display name',
    choices: null,
    default: null,
    defaultRule: 'the name, title-cased',
  },
  { name: 'scope', question: 'Package scope (keep @app unless you have a reason)', choices: null, default: '@app' },
  {
    name: 'db',
    question: 'Postgres database name',
    choices: null,
    default: null,
    defaultRule: 'the name with dashes as underscores',
  },
  {
    name: 'tenancy',
    question: 'Tenancy: multi (multi-tenant), single (single-tenant), or personal (a workspace per user)',
    choices: ['multi', 'single', 'personal'],
    default: 'multi',
    aliases: { mt: 'multi', st: 'single' },
  },
  { name: 'mobile', question: 'Include the Flutter mobile companion app?', choices: ['yes', 'no'], default: 'yes' },
  {
    name: 'desk',
    question:
      'Include Desk, the Inngest workflow engine for background AI agents? Timers and recurring jobs work without it.',
    choices: ['yes', 'no'],
    default: 'no',
  },
  {
    name: 'skill-prefix',
    question: 'Skill prefix: your skills and agents are named <prefix>-<name> (2 to 12 lowercase letters or digits)',
    choices: null,
    default: null,
    defaultRule:
      'the name when it is one word of at most 8 characters; the initials of its words when it has several; the first three letters of one longer word',
  },
  {
    name: 'plans',
    question: 'Plans, specs and test notes: tracked in git, or kept out of it?',
    choices: ['tracked', 'untracked'],
    default: 'tracked',
  },
  {
    name: 'repo-url',
    question: 'Repository URL, for alert runbook links (blank to set later)',
    choices: null,
    default: null,
    defaultRule: "the git remote origin, unless it is the template's own repository",
  },
];

/** `multi`, `single` or `personal`, from either spelling; null when it is neither. */
export function normalizeTenancy(value) {
  const opt = INIT_OPTIONS.find((o) => o.name === 'tenancy');
  if (opt.choices.includes(value)) return value;
  return opt.aliases[value] ?? null;
}

/**
 * `.gitignore` text without the line that ignores the plans folder (any spelling: with or without a leading or
 * trailing slash, or `/**`), and without the comment line right above it. Everything else stays as it was.
 */
export function stripPlansIgnore(text, folder) {
  const bare = folder.replace(/^\/+|\/+$/g, '');
  const isPlansLine = (line) => {
    const p = line
      .trim()
      .replace(/^\/+/, '')
      .replace(/\/\*\*$/, '')
      .replace(/\/+$/, '');
    return p === bare;
  };
  const lines = text.split('\n');
  const drop = new Set();
  lines.forEach((line, i) => {
    if (!isPlansLine(line)) return;
    drop.add(i);
    let first = i;
    if (i > 0 && lines[i - 1].trim().startsWith('#')) drop.add((first = i - 1));
    // The block sat between two blank lines: keep one of them.
    if (first > 0 && lines[first - 1].trim() === '' && lines[i + 1]?.trim() === '' && i + 1 < lines.length - 1)
      drop.add(i + 1);
  });
  return lines.filter((_, i) => !drop.has(i)).join('\n');
}

const VERIFIED_LINE = /^verified:.*$/;

/** The frontmatter of a Markdown text as [first, last] line indexes (the `---` lines), or null. */
function frontmatterRange(lines) {
  if (lines[0] !== '---') return null;
  const end = lines.indexOf('---', 1);
  return end > 0 ? [0, end] : null;
}

function withoutVerified(text) {
  const lines = text.split('\n');
  const range = frontmatterRange(lines);
  if (!range) return text;
  const kept = lines.filter((line, i) => !(i > range[0] && i < range[1] && VERIFIED_LINE.test(line)));
  return kept.length === lines.length ? text : kept.join('\n');
}

function* markdownFiles(root) {
  for (const f of walkRepo(root)) if (f.rel.endsWith('.md')) yield f;
}

/** The Markdown files whose frontmatter carries a `verified:` line, in the files the rename walker visits. */
export function verifiedLineFiles(root) {
  const out = [];
  for (const { abs, rel } of markdownFiles(root)) {
    const text = fs.readFileSync(abs, 'utf8');
    if (withoutVerified(text) !== text) out.push(rel);
  }
  return out.sort();
}

/**
 * Removes every frontmatter `verified:` line: the template's shas name commits a product's history does not have, and
 * a doc with no `verified:` line counts as never verified, which is the truth in a new repository.
 */
export function clearVerifiedLines(root, { dryRun = false } = {}) {
  const actions = [];
  for (const rel of verifiedLineFiles(root)) {
    const abs = path.join(root, rel);
    if (!dryRun) fs.writeFileSync(abs, withoutVerified(fs.readFileSync(abs, 'utf8')));
    actions.push(`${dryRun ? 'would clear' : 'clear'} verified: in ${rel}`);
  }
  return actions;
}

/** Rewrites `.claude/workflow.json` for the product, keeping every other key. Returns the new object. */
export function writeWorkflowConfig(root, { skillPrefix, reservedNames, plansTracked }, { dryRun = false } = {}) {
  const file = path.join(root, WORKFLOW_FILE);
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  cfg.skillPrefix = skillPrefix;
  cfg.reservedNames = reservedNames;
  cfg.plans = { ...cfg.plans, tracked: plansTracked };
  if (!dryRun) fs.writeFileSync(file, formatJson(cfg));
  return cfg;
}

const PRINT_WIDTH = 120; // .prettierrc

/**
 * JSON laid out the way Prettier lays out this repo's config files, so `pnpm format:check` passes on a rewritten file:
 * the top-level object one key per line, and a nested array or object on one line when it fits the print width,
 * otherwise one entry per line.
 */
export function formatJson(value) {
  const render = (v, indent, lead) => {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    const isArray = Array.isArray(v);
    const entries = isArray ? v.map((x) => [null, x]) : Object.entries(v);
    if (entries.length === 0) return isArray ? '[]' : '{}';
    const item = (k, x, ind, ld) =>
      (k === null ? '' : `${JSON.stringify(k)}: `) +
      render(x, ind, ld + (k === null ? 0 : JSON.stringify(k).length + 2));
    if (indent > 0) {
      const inline = entries.map(([k, x]) => item(k, x, indent, 0)).join(', ');
      const one = isArray ? `[${inline}]` : `{ ${inline} }`;
      if (!one.includes('\n') && lead + one.length + 1 <= PRINT_WIDTH) return one;
    }
    const pad = ' '.repeat(indent + 2);
    const body = entries.map(([k, x]) => pad + item(k, x, indent + 2, indent + 2)).join(',\n');
    return `${isArray ? '[' : '{'}\n${body}\n${' '.repeat(indent)}${isArray ? ']' : '}'}`;
  };
  return render(value, 0, 0) + '\n';
}
