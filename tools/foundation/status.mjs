#!/usr/bin/env node
/**
 * pnpm foundation:status — which foundation-owned files in this repository differ from the template version it was
 * scaffolded from.
 *
 *   pnpm foundation:status                       # fetch the base from the template repository
 *   pnpm foundation:status --from ../app-foundation   # read the template from a local clone
 *   pnpm foundation:status --json
 *   pnpm foundation:status --owned <path>...     # which of these paths the template owns; no fetch, no rebuild
 *
 * Read-only: nothing in the working tree changes. Exit 0 whatever it finds; 1 only when it cannot run.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { isEntryModule } from '../guards/workflow-config.mjs';
import { rebuildBase } from './base.mjs';
import { CLASS, MANIFEST_FILE, classifierFor, loadManifest } from './manifest.mjs';

const SKIP_DIRS = new Set(['node_modules', '.git', '.turbo', '.next', 'dist', 'build', 'coverage', '.worktrees']);

/** Every file under `root`, repo-relative with forward slashes. */
export function walkFiles(root, dir = root, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walkFiles(root, abs, out);
    } else if (entry.isFile()) out.push(path.relative(root, abs).split(path.sep).join('/'));
  }
  return out;
}

/** The files git tracks or would track (not ignored); every file on disk when the folder is not a repository. */
export function repoFiles(root) {
  try {
    return execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\0')
      .filter((rel) => rel && fs.existsSync(path.join(root, rel)));
  } catch {
    return walkFiles(root);
  }
}

/**
 * A Markdown table row with its padding removed. init-app's skill rename changes the width of a table cell, and the
 * product's Prettier then realigns the whole table: every row changes, the content does not.
 */
const tableRow = (line) =>
  line
    .split('|')
    .map((cell) => cell.trim().replace(/^(:?)-+(:?)$/, '$1-$2'))
    .join('|');

/**
 * Markdown as Prettier would settle it, for comparing only: table rows unpadded and runs of blank lines collapsed
 * (init-app leaves two blank lines where it strips an optional feature's block; Prettier makes them one).
 */
export function settleMarkdown(markdown) {
  return markdown
    .split('\n')
    .map((line) => (line.trimStart().startsWith('|') ? tableRow(line.trim()) : line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

/** Same bytes, or (for Markdown) the same text once Prettier's table alignment and blank lines are set aside. */
export function sameContent(rel, a, b) {
  if (a.equals(b)) return true;
  return rel.endsWith('.md') && settleMarkdown(a.toString('utf8')) === settleMarkdown(b.toString('utf8'));
}

/**
 * Compares the owned files of the rebuilt base with the product: `changed` (both have it, content differs), `deleted`
 * (the base has it, the product does not) and `added` (the product has a file in an owned area the base lacks).
 * Seams and starter content are never listed.
 */
export function compareTrees({ baseDir, productDir, manifest, productFiles = repoFiles(productDir) }) {
  const classify = classifierFor(manifest);
  const isOwned = (rel) => rel !== MANIFEST_FILE && classify(rel) === CLASS.OWNED;
  const baseOwned = walkFiles(baseDir).filter(isOwned);
  const inBase = new Set(baseOwned);
  const changed = [];
  const deleted = [];
  for (const rel of baseOwned) {
    const mine = path.join(productDir, rel);
    if (!fs.existsSync(mine)) deleted.push(rel);
    else if (!sameContent(rel, fs.readFileSync(path.join(baseDir, rel)), fs.readFileSync(mine))) changed.push(rel);
  }
  const added = productFiles.filter((rel) => isOwned(rel) && !inBase.has(rel));
  return { owned: baseOwned.length, changed: changed.sort(), deleted: deleted.sort(), added: added.sort() };
}

export function report({ manifest, ref, result }) {
  const { base } = manifest;
  const lines = [
    `foundation: base v${base.version}${base.commit ? ` @ ${base.commit.slice(0, 7)}` : ''} (read ${ref})`,
  ];
  const section = (title, files) => {
    if (!files.length) return;
    lines.push('', `${title} (${files.length})`);
    for (const f of files) lines.push(`  ${f}`);
  };
  section('Changed here', result.changed);
  section('Deleted here', result.deleted);
  section('Added here, inside a foundation folder', result.added);
  const total = result.changed.length + result.deleted.length + result.added.length;
  lines.push(
    '',
    total === 0
      ? `foundation: in step. All ${result.owned} foundation files match the base.`
      : `foundation: ${total} of ${result.owned} foundation files differ from the base ` +
          `(${result.changed.length} changed, ${result.deleted.length} deleted, ${result.added.length} added).`,
  );
  return lines.join('\n');
}

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      from: { type: 'string' },
      json: { type: 'boolean', default: false },
      root: { type: 'string' },
      owned: { type: 'boolean', default: false },
    },
  });
  const root = path.resolve(values.root ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));
  const manifest = loadManifest(root);
  if (values.owned) {
    const classify = classifierFor(manifest);
    const owned = positionals.filter((rel) => rel !== MANIFEST_FILE && classify(rel) === CLASS.OWNED);
    console.log(values.json ? JSON.stringify(owned) : owned.join('\n'));
    return;
  }
  if (manifest.base === null) {
    const message = `foundation: this is the template (v${manifest.version}). A product records its base in ${MANIFEST_FILE}; there is nothing to compare here.`;
    console.log(values.json ? JSON.stringify({ template: true, version: manifest.version }) : message);
    return;
  }
  const { dir, ref } = rebuildBase({ manifest, source: values.from ?? process.env.FOUNDATION_SOURCE });
  try {
    const result = compareTrees({ baseDir: dir, productDir: root, manifest });
    console.log(
      values.json
        ? JSON.stringify({ base: manifest.base, ref, ...result }, null, 2)
        : report({ manifest, ref, result }),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

if (isEntryModule(import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.error(`foundation: ${e.message}`);
    process.exit(1);
  }
}
