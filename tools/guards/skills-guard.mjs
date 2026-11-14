#!/usr/bin/env node
/**
 * The skills guard: fails when a skill, agent, doc or source comment cites a file, symbol, skill or guard that does
 * not exist, so the text that steers the work stays true to the code. Three targets:
 *
 *   skills  (.claude/**)  skill and agent names (folder, prefix, reserved names), relative links, backticked repo
 *                         paths and globs, `<prefix>-<name>` tokens, home paths, GitHub project node ids, the vault
 *                         word, versioned Claude model ids, the paths in hooks/hotspots/*.json and settings.json.
 *                         Files that carry the new frontmatter (owner, sources, guards, requires, status, examples)
 *                         also get: owner, sources and `path#Symbol` anchors, guards, the size budget, a guard tag or
 *                         review-only on every rule, requires: against the feature folders, inline code in a rules
 *                         section resolving to a source word or an examples entry, and the origin of a long example.
 *   docs                  CLAUDE.md, README.md, docs/** (not the plans folder), tools/**\/README.md, .github/*.md:
 *                         links, backticked repo paths, and sources: where a doc has them.
 *   source                apps, packages, infra, tests and tools (not tools/guards, tools/init-app): no comment cites
 *                         a path under .claude/, and no file names a skill, current or retired (`*-patterns`).
 *
 *   node tools/guards/skills-guard.mjs [--target skills|docs|source] [--root <dir>]
 *
 * Spelling of a guard (a `guards:` entry, or `[guard: a, b]` at the end of a rule): a repo path or glob; a file name
 * found anywhere in the tree (`error-envelope.spec.ts`); `lint:<rule>` (named in an ESLint config); `gate:<rule>` (a
 * rule id in tools/guards/convention-gate.mjs); `script:<name>` (a root package.json script). A rule with no machine
 * check ends `[review-only: <reason>]`.
 *
 * Node built-ins only; no git needed. Exit 1 on any finding.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { isEntryModule, loadWorkflowConfig, repoRootOf, WORKFLOW_FILE } from './workflow-config.mjs';

/** Optional features and the folder whose presence means the feature is in this product. */
export const FEATURE_FOLDERS = { mobile: 'apps/mobile', desk: 'apps/backend/src/domains/desk' };
/**
 * Until every skill carries the new frontmatter, the prefix, owner and budget checks apply only to the files that do.
 * The pull request that converts the last old skill sets this to true.
 */
export const FRONTMATTER_REQUIRED = false;
export const TARGETS = ['skills', 'docs', 'source'];

const ROOT_FOLDERS = ['apps/', 'packages/', 'infra/', 'tools/', 'tests/', 'docs/', '.github/', '.claude/'];
const NEW_KEYS = ['owner', 'sources', 'guards', 'requires', 'status', 'examples'];
const BUDGET = { skill: 200, reference: 450 };
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.turbo',
  '.next',
  'dist',
  'build',
  'coverage',
  '.dart_tool',
  'ephemeral',
  '.gradle',
  '.terraform',
  'playwright-report',
  'test-results',
]);
// Other checkouts of this repo, and this guard's own fixtures (deliberately broken copies).
const SKIP_REL = ['.worktrees', '.claude/worktrees', 'tools/guards/fixtures'];
const BINARY_EXT = new Set(
  '.png .jpg .jpeg .gif .ico .webp .svg .woff .woff2 .ttf .eot .pdf .zip .gz .tar .mp4 .mov .dump .jar .keystore .p12 .lock'.split(
    ' ',
  ),
);
const SOURCE_WORD_EXT = new Set(
  '.ts .tsx .js .jsx .mjs .cjs .prisma .json .yml .yaml .sh .dart .tf .sql .py .toml'.split(' '),
);
const MODEL_ID =
  /\bclaude-(?:(?:opus|sonnet|haiku|instant)-\d[\w.-]*|\d[\w.]*(?:-\d[\w.]*)?-(?:opus|sonnet|haiku)[\w.-]*)/i;
const HOME_PATH = /(?:^|[\s`'"(=])(?:\/Users\/[A-Za-z0-9._-]+|\/home\/[a-z][a-z0-9._-]*|[A-Z]:\\Users\\)/;
const PROJECT_ID = /\bPVT[A-Z]*_[A-Za-z0-9_-]{4,}/;
const VAULT = /\bobsidian\b/i;

// ── helpers ─────────────────────────────────────────────────────────────────

const toPosix = (p) => p.split(path.sep).join('/');
const skipped = (rel) => SKIP_REL.some((p) => rel === p || rel.startsWith(p + '/'));

function* walk(root, dir = root) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    const rel = toPosix(path.relative(root, abs));
    if (skipped(rel)) continue;
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) yield* walk(root, abs);
    } else if (e.isFile() && !BINARY_EXT.has(path.extname(e.name).toLowerCase())) yield rel;
  }
}

function readText(root, rel) {
  try {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    return text.includes('\0') ? null : text;
  } catch {
    return null;
  }
}

function globSource(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      re += glob[i + 2] === '/' ? '(?:.*/)?' : '.*';
      i += glob[i + 2] === '/' ? 2 : 1;
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const end = glob.indexOf('}', i);
      re += `(?:${glob
        .slice(i + 1, end)
        .split(',')
        .map((s) => s.replace(/[.+^$()|[\]\\]/g, '\\$&'))
        .join('|')})`;
      i = end;
    } else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return re;
}
export const globToRegExp = (glob) => new RegExp(`^${globSource(glob)}/?$`);

const isGlob = (p) => /[*?{]/.test(p);

/** The root .gitignore as matchers (the common subset: globs, a leading or middle slash anchors, `!` negates). */
function gitignoreRules(text) {
  const rules = [];
  for (const raw of text.split('\n')) {
    let line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const negate = line.startsWith('!');
    if (negate) line = line.slice(1);
    line = line.replace(/\/$/, '');
    const anchored = line.startsWith('/') || line.includes('/');
    const body = globSource(line.replace(/^\//, ''));
    rules.push({ re: new RegExp(`${anchored ? '^' : '(^|/)'}${body}(/.*)?$`), negate });
  }
  return rules;
}

/** Splits a markdown file into frontmatter (a flat key → string | string[] map) and the body with its line offset. */
export function parseFrontmatter(text) {
  if (!text.startsWith('---\n')) return { fm: null, body: text, offset: 0 };
  const end = text.indexOf('\n---', 4);
  if (end === -1) return { fm: null, body: text, offset: 0 };
  const fm = {};
  let key = null;
  for (const line of text.slice(4, end).split('\n')) {
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && key) {
      if (!Array.isArray(fm[key])) fm[key] = [];
      fm[key].push(unquote(item[1]));
      continue;
    }
    const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    key = kv[1];
    const v = kv[2].trim();
    fm[key] = v.startsWith('[') && v.endsWith(']') ? splitList(v.slice(1, -1)) : unquote(v);
  }
  const offset = text.slice(0, end + 4).split('\n').length;
  return { fm, body: text.slice(end + 4).replace(/^[^\n]*\n/, ''), offset };
}
const unquote = (s) => s.trim().replace(/^(['"])(.*)\1$/, '$2');
const splitList = (s) => s.split(',').map(unquote).filter(Boolean);
const listOf = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const hasNewFrontmatter = (fm) => !!fm && NEW_KEYS.some((k) => k in fm);

/** Lines of a markdown body with fenced blocks marked, so link and code-span scans skip them. */
function scanLines(body) {
  const out = [];
  let fence = null;
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*(```+|~~~+)/);
    if (fence) {
      out.push({ line, fenced: true });
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null;
    } else if (m) {
      fence = m[1];
      out.push({ line, fenced: true, open: true });
    } else out.push({ line, fenced: false });
  }
  return out;
}
const codeSpans = (line) => [...line.matchAll(/(`+)([^`]+?)\1/g)].map((m) => m[2].trim());
const stripCode = (line) => line.replace(/(`+)[^`]+?\1/g, '');

// ── the repo context, built once per run ─────────────────────────────────────

function context(root, cfg) {
  const ctx = { root, cfg, _files: null, _words: null, _basenames: null };
  ctx.files = () => (ctx._files ??= [...walk(root)]);
  ctx.exists = (rel) => fs.existsSync(path.join(root, rel));
  ctx.globMatches = (glob) => {
    const re = globToRegExp(glob);
    const base = glob.slice(0, glob.search(/[*?{]/)).replace(/[^/]*$/, '');
    if (base && !ctx.exists(base)) return false;
    for (const rel of walk(root, path.join(root, base))) {
      if (re.test(rel)) return true;
      // a glob may name a directory (apps/*/src)
      for (let d = path.posix.dirname(rel); d !== '.' && d.length >= base.length; d = path.posix.dirname(d))
        if (re.test(d)) return true;
    }
    return false;
  };
  ctx.pathExists = (p) => (isGlob(p) ? ctx.globMatches(p.replace(/\/$/, '')) : ctx.exists(p.replace(/\/$/, '')));
  ctx.words = () => {
    if (ctx._words) return ctx._words;
    ctx._words = new Set();
    for (const rel of ctx.files()) {
      if (!/^(apps|packages|tools|tests|infra|scripts)\//.test(rel) || rel.startsWith('tools/guards/')) continue;
      if (!SOURCE_WORD_EXT.has(path.extname(rel))) continue;
      const text = readText(root, rel);
      if (text) for (const w of text.match(/[A-Za-z_$][\w$]*/g) ?? []) ctx._words.add(w);
    }
    return ctx._words;
  };
  ctx.basenames = () => {
    if (ctx._basenames) return ctx._basenames;
    ctx._basenames = new Set(ctx.files().map((rel) => path.posix.basename(rel)));
    return ctx._basenames;
  };
  ctx.skillNames = () =>
    ctx.exists('.claude/skills')
      ? fs
          .readdirSync(path.join(root, '.claude/skills'), { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
      : [];
  ctx.agentNames = () =>
    ctx.exists('.claude/agents')
      ? fs
          .readdirSync(path.join(root, '.claude/agents'))
          .filter((f) => f.endsWith('.md'))
          .map((f) => f.slice(0, -3))
      : [];
  // A path the root .gitignore ignores is local-only by design (`.env`, dumps, worktrees): named, never committed.
  const ignoreRules = gitignoreRules(readText(root, '.gitignore') ?? '');
  ctx.ignored = (p) => {
    const rel = p.replace(/\/$/, '');
    let hit = false;
    for (const { re, negate } of ignoreRules) if (re.test(rel)) hit = !negate;
    return hit;
  };
  // A product that opted out of a feature keeps the prose that names its folder (how to add it back, the decision
  // record), so a path inside an absent feature's folder is not checked. Leftover feature files are still caught by
  // the requires: check.
  ctx.inAbsentFeature = (p) =>
    Object.values(FEATURE_FOLDERS).some(
      (folder) => (p === folder || p.startsWith(folder + '/')) && !ctx.exists(folder),
    );
  ctx.plansSkipped = (p) => !cfg.plans.tracked && (p === cfg.plans.folder || p.startsWith(cfg.plans.folder + '/'));
  return ctx;
}

/** Whether a guard name resolves: see the header for the spellings. */
function resolveGuard(ctx, raw) {
  const name = raw.replace(/`/g, '').trim();
  if (!name) return false;
  const [kind, rest] = name.includes(':') ? [name.slice(0, name.indexOf(':')), name.slice(name.indexOf(':') + 1)] : [];
  if (kind === 'lint')
    return ctx
      .files()
      .filter((f) => /(^|\/)(eslint\.config\.[cm]?[jt]s|\.eslintrc(\.[a-z]+)?)$/.test(f))
      .some((f) => new RegExp(`['"]${rest.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}['"]`).test(readText(ctx.root, f)));
  if (kind === 'gate') {
    const text = readText(ctx.root, 'tools/guards/convention-gate.mjs');
    return !!text && new RegExp(`['"]${rest.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`).test(text);
  }
  if (kind === 'script') {
    try {
      return rest in (JSON.parse(readText(ctx.root, 'package.json')).scripts ?? {});
    } catch {
      return false;
    }
  }
  if (name.includes('/')) return ctx.pathExists(name);
  return ctx.basenames().has(name);
}

// Code spans that start like a repo path but name something else: the MCP JSON-RPC methods.
const NOT_PATHS = new Set(['tools/list', 'tools/call']);

/** A backticked code span read as a repo path, or null when it is not one (or is a placeholder). */
function spanAsPath(span) {
  if (!ROOT_FOLDERS.some((r) => span.startsWith(r))) return null;
  let p = span.split(/\s/)[0];
  if (NOT_PATHS.has(p) || /[<>…$]|\.\.\.|\{\{|\{[^,}]*\}/.test(p)) return null;
  p = p
    .replace(/[#][^/]*$/, '')
    .replace(/:\d+(?:-\d+)?$/, '')
    .replace(/[.,;:)]+$/, '');
  return p || null;
}

// ── checks shared by the skills and docs targets ─────────────────────────────

function checkMarkdownRefs(ctx, rel, body, offset, add) {
  const dir = path.posix.dirname(rel);
  scanLines(body).forEach(({ line, fenced }, i) => {
    if (fenced) return;
    const n = offset + i + 1;
    for (const m of stripCode(line).matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const target = m[1];
      if (/^(?:[a-z][a-z0-9+.-]*:|#|<)/i.test(target)) continue;
      const file = decodeURI(target.replace(/#.*$/, ''));
      if (!file) continue;
      const resolved = file.startsWith('/') ? file.slice(1) : path.posix.normalize(path.posix.join(dir, file));
      if (!ctx.exists(resolved)) add(rel, n, 'link', `link target does not exist: ${target}`);
    }
    for (const span of codeSpans(line)) {
      const p = spanAsPath(span);
      if (!p || ctx.plansSkipped(p) || ctx.ignored(p) || ctx.inAbsentFeature(p)) continue;
      // ~~`path`~~ names a file that is gone on purpose (an upgrade note's "Removed:" line).
      if (line.includes(`~~\`${span}\`~~`)) continue;
      if (!ctx.pathExists(p))
        add(rel, n, 'path', `${isGlob(p) ? 'glob matches no file' : 'path does not exist'}: ${p}`);
    }
  });
}

function checkSources(ctx, rel, fm, add) {
  for (const entry of listOf(fm.sources)) {
    const [p, symbol] = entry.split('#');
    if (!ctx.pathExists(p)) {
      add(rel, 1, 'source', `sources: entry does not exist: ${p}`);
      continue;
    }
    if (symbol && !isGlob(p)) {
      const text = readText(ctx.root, p) ?? '';
      if (!new RegExp(`(^|[^\\w$])${symbol.replace(/[$.]/g, '\\$&')}([^\\w$]|$)`).test(text))
        add(rel, 1, 'anchor', `sources: ${p} does not contain the symbol ${symbol}`);
    }
  }
}

// ── skills target ────────────────────────────────────────────────────────────

function checkSkills(ctx, add) {
  const { root, cfg } = ctx;
  const prefix = `${cfg.skillPrefix}-`;
  const skills = ctx.skillNames();
  const agents = ctx.agentNames();
  const known = new Set([...skills, ...agents, ...cfg.reservedNames]);

  const checkName = (rel, name, expected, fm) => {
    if (name !== expected) add(rel, 1, 'name-folder', `name "${name ?? ''}" must equal "${expected}"`);
    if (!(FRONTMATTER_REQUIRED || hasNewFrontmatter(fm))) return;
    if (!expected.startsWith(prefix)) add(rel, 1, 'name-prefix', `"${expected}" must start with "${prefix}"`);
    const reserved = cfg.reservedNames.find((r) => expected === r || expected.startsWith(`${r}-`));
    if (reserved) add(rel, 1, 'name-reserved', `"${expected}" starts with the reserved name "${reserved}"`);
  };

  for (const name of skills) {
    const rel = `.claude/skills/${name}/SKILL.md`;
    const text = readText(root, rel);
    if (text === null) {
      add(`.claude/skills/${name}`, 1, 'name-folder', 'a skill folder needs a SKILL.md');
      continue;
    }
    checkName(rel, parseFrontmatter(text).fm?.name, name, parseFrontmatter(text).fm);
  }
  for (const name of agents) {
    const rel = `.claude/agents/${name}.md`;
    const { fm } = parseFrontmatter(readText(root, rel) ?? '');
    checkName(rel, fm?.name, name, fm);
  }

  for (const rel of ctx.files().filter((f) => f.startsWith('.claude/'))) {
    if (rel.endsWith('.json')) {
      checkConfigPaths(ctx, rel, add);
      continue;
    }
    if (!rel.endsWith('.md')) continue;
    const text = readText(root, rel);
    if (text === null) continue;
    const { fm, body, offset } = parseFrontmatter(text);
    checkMarkdownRefs(ctx, rel, body, offset, add);

    text.split('\n').forEach((line, i) => {
      const n = i + 1;
      if (HOME_PATH.test(line)) add(rel, n, 'home-path', 'an absolute home path; name a repo path instead');
      if (PROJECT_ID.test(line)) add(rel, n, 'project-id', 'a GitHub project node id; it belongs in workflow.json');
      if (VAULT.test(line)) add(rel, n, 'vault', 'the workflow keeps no note vault; cite a doc under docs/');
      const model = line.match(MODEL_ID);
      if (model)
        add(rel, n, 'model-id', `a versioned model id (${model[0]}); name an alias and cite the model catalog`);
    });
    scanLines(body).forEach(({ line, fenced }, i) => {
      if (fenced) return;
      for (const span of codeSpans(line)) {
        const m = span.match(new RegExp(`^/?(${cfg.skillPrefix}-[a-z0-9][a-z0-9-]*)$`));
        if (m && !known.has(m[1]))
          add(rel, offset + i + 1, 'skill-token', `\`${span}\` is not a skill, an agent or a reserved name`);
      }
    });

    const isSkillDoc = rel.startsWith('.claude/skills/') || rel.startsWith('.claude/agents/');
    if (isSkillDoc && (FRONTMATTER_REQUIRED || hasNewFrontmatter(fm)))
      checkNewFrontmatter(ctx, rel, fm ?? {}, body, offset, add);
  }
}

function checkConfigPaths(ctx, rel, add) {
  const text = readText(ctx.root, rel);
  if (text === null) return;
  if (rel.startsWith('.claude/hooks/hotspots/')) {
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      add(rel, 1, 'config-path', `not valid JSON: ${e.message}`);
      return;
    }
    const feature = json.requires ?? path.posix.basename(rel, '.json');
    if (feature in FEATURE_FOLDERS && !ctx.exists(FEATURE_FOLDERS[feature]))
      add(rel, 1, 'requires', `a ${feature} hotspot file while ${FEATURE_FOLDERS[feature]} is absent`);
    const leaves = [];
    const visit = (v) =>
      typeof v === 'string' ? leaves.push(v) : v && typeof v === 'object' && Object.values(v).forEach(visit);
    visit(json);
    for (const s of leaves)
      if (!/\s/.test(s) && ROOT_FOLDERS.some((r) => s.startsWith(r)) && !ctx.pathExists(s))
        add(rel, 1, 'config-path', `names a path that does not exist: ${s}`);
  } else if (rel === '.claude/settings.json') {
    for (const m of text.matchAll(/\$\{?CLAUDE_PROJECT_DIR\}?\\?"?\/([^\s"'\\]+)/g))
      if (!ctx.exists(m[1])) add(rel, 1, 'config-path', `names a path that does not exist: ${m[1]}`);
  }
}

function checkNewFrontmatter(ctx, rel, fm, body, offset, add) {
  if (!['foundation', 'product'].includes(fm.owner))
    add(rel, 1, 'owner', 'frontmatter needs owner: foundation or owner: product');
  checkSources(ctx, rel, fm, add);
  for (const g of listOf(fm.guards))
    if (!resolveGuard(ctx, g))
      add(rel, 1, 'guard', `guards: entry names no spec, lint rule, gate rule or script: ${g}`);
  for (const feature of listOf(fm.requires)) {
    if (!(feature in FEATURE_FOLDERS)) add(rel, 1, 'requires', `requires: names an unknown feature: ${feature}`);
    else if (!ctx.exists(FEATURE_FOLDERS[feature]))
      add(rel, 1, 'requires', `requires: ${feature}, but ${FEATURE_FOLDERS[feature]} is absent`);
  }

  const lines = body.split('\n').length + offset;
  const budget = /\/references\//.test(rel) ? BUDGET.reference : BUDGET.skill;
  if (lines > budget) add(rel, 1, 'size', `${lines} lines; the budget is ${budget}`);

  const examples = new Set(listOf(fm.examples));
  const scanned = scanLines(body);
  let inRules = false;
  let item = null;
  const closeItem = () => {
    if (item) checkRuleTag(ctx, rel, item, add);
    item = null;
  };
  scanned.forEach(({ line, fenced, open }, i) => {
    const n = offset + i + 1;
    if (!fenced && /^#{1,2}\s/.test(line)) {
      closeItem();
      inRules = /^##\s/.test(line) && /\b(rules|non-negotiables?)\b/i.test(line);
      return;
    }
    if (open) checkExampleOrigin(scanned, i, rel, n, add);
    if (!inRules || fenced) return;
    if (/^[-*]\s|^\d+\.\s/.test(line)) {
      closeItem();
      item = { text: line, line: n };
    } else if (item && /^\s+\S/.test(line)) item.text += ` ${line.trim()}`;
    else if (line.trim() === '') closeItem();
    for (const span of codeSpans(line)) {
      if (spanAsPath(span) || examples.has(span)) continue;
      const m = span.match(/^@?([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)(?:\(\))?$/);
      if (!m) continue;
      const missing = m[1].split('.').filter((w) => !ctx.words().has(w));
      if (missing.length)
        add(rel, n, 'symbol', `\`${span}\` names nothing in the source tree; fix it or list it under examples:`);
    }
  });
  closeItem();
}

function checkRuleTag(ctx, rel, item, add) {
  const tag = item.text.match(/\[(guard|review-only)(?::\s*([^\]]*))?\]\s*$/);
  if (!tag) {
    add(rel, item.line, 'rule-tag', 'a rule ends with [guard: <name>] or [review-only: <reason>]');
    return;
  }
  const value = (tag[2] ?? '').trim();
  if (tag[1] === 'review-only') {
    if (!value)
      add(rel, item.line, 'rule-tag', 'review-only needs a reason: [review-only: <why no machine checks it>]');
    return;
  }
  const names = value.split(/[,;]/).map((s) => s.trim());
  for (const g of names)
    if (!resolveGuard(ctx, g)) add(rel, item.line, 'guard', `the rule's guard names nothing that exists: ${g}`);
}

function checkExampleOrigin(scanned, i, rel, n, add) {
  let end = i + 1;
  while (end < scanned.length && !(scanned[end].fenced && /^\s*(```|~~~)/.test(scanned[end].line))) end++;
  const content = scanned.slice(i + 1, end).map((s) => s.line);
  if (content.length < 10) return;
  const before = scanned
    .slice(Math.max(0, i - 3), i)
    .map((s) => s.line)
    .filter((l) => l.trim());
  const namesFile = (l) => ROOT_FOLDERS.some((r) => l.includes(r));
  if (!namesFile(content[0] ?? '') && !before.some(namesFile))
    add(rel, n, 'example-origin', 'an example of ten lines or more names the file it was copied from');
}

// ── docs target ─────────────────────────────────────────────────────────────

function docFiles(ctx) {
  return ctx
    .files()
    .filter(
      (rel) =>
        rel === 'CLAUDE.md' ||
        rel === 'README.md' ||
        (rel.startsWith('docs/') &&
          rel.endsWith('.md') &&
          !ctx.plansSkipped(rel) &&
          !rel.startsWith(ctx.cfg.plans.folder + '/')) ||
        (rel.startsWith('tools/') && rel.endsWith('/README.md')) ||
        /^\.github\/[^/]+\.md$/.test(rel),
    );
}

function checkDocs(ctx, add) {
  for (const rel of docFiles(ctx)) {
    const text = readText(ctx.root, rel);
    if (text === null) continue;
    const { fm, body, offset } = parseFrontmatter(text);
    checkMarkdownRefs(ctx, rel, body, offset, add);
    if (fm?.sources) checkSources(ctx, rel, fm, add);
  }
}

// ── source target ───────────────────────────────────────────────────────────

function checkSource(ctx, add) {
  const current = [...ctx.skillNames(), ...ctx.agentNames()].filter((n) => n.includes('-'));
  const tokens = new RegExp(
    `(?<![\\w/.-])(?:[a-z][a-z0-9]*-)*[a-z0-9]+-patterns(?![\\w-])${current.map((n) => `|(?<![\\w/.-])${n.replace(/[.-]/g, '\\$&')}(?![\\w-])`).join('')}`,
  );
  for (const rel of ctx.files()) {
    if (!/^(apps|packages|infra|tests|tools)\//.test(rel)) continue;
    if (rel.startsWith('tools/guards/') || rel.startsWith('tools/init-app/') || rel.endsWith('.md')) continue;
    const text = readText(ctx.root, rel);
    if (text === null) continue;
    text.split('\n').forEach((line, i) => {
      const at = line.indexOf('.claude/');
      if (at > -1 && (/(^|\s)(\/\/|#|\/\*|<!--|--)/.test(line.slice(0, at)) || /^\s*\*/.test(line)))
        add(rel, i + 1, 'cites-claude', 'a comment cites a path under .claude/; cite the guard or a file under docs/');
      const m = line.match(tokens);
      if (m) add(rel, i + 1, 'cites-skill', `names the skill "${m[0]}"; cite the guard or a file under docs/`);
    });
  }
}

// ── entry points ────────────────────────────────────────────────────────────

/** Every finding as { file, line, rule, message }, sorted; empty when the repo holds. */
export function checkRepo(root, { targets = TARGETS } = {}) {
  let cfg;
  try {
    cfg = loadWorkflowConfig(root);
  } catch (e) {
    return [{ file: WORKFLOW_FILE, line: 1, rule: 'config', message: e.message }];
  }
  const ctx = context(root, cfg);
  const findings = [];
  const add = (file, line, rule, message) => findings.push({ file, line, rule, message });
  if (targets.includes('skills')) checkSkills(ctx, add);
  if (targets.includes('docs')) checkDocs(ctx, add);
  if (targets.includes('source')) checkSource(ctx, add);
  return findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

function main() {
  const arg = (name) => {
    const i = process.argv.indexOf(name);
    return i > -1 ? process.argv[i + 1] : undefined;
  };
  const target = arg('--target');
  if (target && !TARGETS.includes(target)) {
    console.error(`--target must be one of: ${TARGETS.join(', ')}`);
    process.exit(2);
  }
  const root = arg('--root') ? path.resolve(arg('--root')) : repoRootOf(import.meta.url);
  const findings = checkRepo(root, { targets: target ? [target] : TARGETS });
  for (const f of findings) console.error(`${f.file}:${f.line}: [${f.rule}] ${f.message}`);
  const label = `guard:${target ?? 'skills+docs+source'}`;
  console.log(`${label}: ${findings.length ? `FAIL (${findings.length} finding(s))` : 'PASS'}`);
  process.exit(findings.length ? 1 : 0);
}

if (isEntryModule(import.meta.url)) main();
