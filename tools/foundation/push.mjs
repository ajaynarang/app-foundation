#!/usr/bin/env node
/**
 * pnpm foundation:push — offer changes this product made to foundation-owned files back to the template.
 *
 *   pnpm foundation:push --to ../app-foundation/.worktrees/from-acme            # every changed or added owned file
 *   pnpm foundation:push --to <template checkout> packages/appshore/kernel      # only these files or folders
 *   pnpm foundation:push --to <template checkout> --dry-run
 *
 * It writes into a checkout of the template that you made for this (a branch, a clean tree) and nowhere else: no
 * commit, no push, nothing in this repository. Each file is merged three ways: the template's file as it is now, the
 * base this product was scaffolded from, and the product's file. Lines the product did not change keep the template's
 * own text, so init-app's renames stay undone; a line the product changed that names the product is reported.
 * Exit 0 when clean, 2 when a conflict or a product name is left to settle, 1 when it cannot run.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { isEntryModule } from '../guards/workflow-config.mjs';
import { rebuildBase } from './base.mjs';
import { loadManifest, toTemplatePath } from './manifest.mjs';
import { mergeFile } from './pull.mjs';
import { compareTrees } from './status.mjs';

const read = (dir, rel) => {
  try {
    return fs.readFileSync(path.join(dir, rel));
  } catch {
    return null;
  }
};
const isBinary = (buffer) => buffer.includes(0);
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The files chosen by `only` (a file, or a folder and everything under it); every file when `only` is empty. */
export function choose(files, only) {
  if (!only.length) return files;
  const wanted = only.map((p) => p.replace(/\/+$/, ''));
  return files.filter((rel) => wanted.some((p) => rel === p || rel.startsWith(`${p}/`)));
}

/** The words that name this product and not the template: its package name and its display name. */
export function productWords(scaffold, templateManifest) {
  const template = new Set([templateManifest.name, 'app-foundation'].filter(Boolean));
  return [...new Set([scaffold.name, scaffold.displayName])].filter((w) => w && w.length > 2 && !template.has(w));
}

/** The product words the outgoing text has that the template's own file did not. */
function leaked(words, merged, before) {
  const count = (buffer, word) =>
    (buffer ? buffer.toString('utf8').match(new RegExp(escape(word), 'g')) : null)?.length ?? 0;
  return words.filter((word) => count(merged, word) > count(before, word));
}

/**
 * Decides, without writing, what goes into the template checkout. `result` is `compareTrees`' answer for the
 * product. Returns `actions` (template path and the bytes to write), `conflicts`, `named` (files whose new text names
 * the product) and `skipped` (what is never sent, with the reason).
 */
export function planPush({ baseDir, productDir, templateDir, manifest, result, only = [], words = [] }) {
  const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'foundation-merge-')));
  const plan = { actions: [], conflicts: [], named: [], skipped: [] };
  const labels = { ours: 'template', base: `base v${manifest.base.version}`, theirs: 'product' };
  try {
    for (const rel of choose([...result.changed, ...result.added].sort(), only)) {
      const to = toTemplatePath(rel, manifest.scaffold);
      const base = read(baseDir, rel);
      const mine = read(productDir, rel);
      const theirs = read(templateDir, to);
      if (theirs !== null && theirs.equals(mine)) continue;
      if (base !== null && theirs === null) {
        plan.conflicts.push({ rel: to, reason: 'the template no longer has this file: not written' });
        continue;
      }
      let content = mine;
      if (theirs !== null) {
        if (isBinary(mine) || isBinary(theirs)) {
          plan.conflicts.push({ rel: to, reason: 'binary file that differs in the template: not written' });
          continue;
        }
        const merged = mergeFile({ ours: theirs, base, theirs: mine, labels, scratch });
        content = merged.content;
        if (content.equals(theirs)) continue; // the template already has this change
        if (merged.conflicts)
          plan.conflicts.push({ rel: to, reason: `${merged.conflicts} conflict marker(s) in the file` });
      }
      plan.actions.push({ rel: to, from: rel, content });
      const names = isBinary(content) ? [] : leaked(words, content, theirs);
      if (names.length) plan.named.push({ rel: to, words: names });
    }
    for (const rel of choose(result.deleted, only))
      plan.skipped.push({
        rel: toTemplatePath(rel, manifest.scaffold),
        reason: 'deleted here: a delete is never sent',
      });
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  return plan;
}

export function applyPush({ plan, templateDir, productDir }) {
  for (const { rel, from, content } of plan.actions) {
    const to = path.join(templateDir, rel);
    const existed = fs.existsSync(to);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, content);
    if (!existed) fs.chmodSync(to, fs.statSync(path.join(productDir, from)).mode);
  }
}

export function report({ manifest, templateDir, plan, dryRun }) {
  const lines = [`foundation: ${manifest.scaffold.name} (base v${manifest.base.version}) → ${templateDir}`];
  const section = (title, rows) => {
    if (!rows.length) return;
    lines.push('', `${title} (${rows.length})`);
    for (const row of rows) lines.push(`  ${row}`);
  };
  section(
    dryRun ? 'Would write' : 'Written',
    plan.actions.map((a) => (a.rel === a.from ? a.rel : `${a.rel}  (here: ${a.from})`)),
  );
  section(
    'Conflicts: settle each one in the template checkout',
    plan.conflicts.map((c) => `${c.rel}\n      ${c.reason}`),
  );
  section(
    'Names this product: reword for every product',
    plan.named.map((n) => `${n.rel}\n      ${n.words.join(', ')}`),
  );
  section(
    'Not sent',
    plan.skipped.map((s) => `${s.rel}\n      ${s.reason}`),
  );
  const open = plan.conflicts.length + plan.named.length;
  lines.push(
    '',
    !plan.actions.length && !open
      ? 'foundation: nothing to send. The chosen foundation files match the template.'
      : dryRun
        ? `foundation: dry run, nothing written. ${plan.actions.length} file(s) would be written, ${open} to settle.`
        : `foundation: ${plan.actions.length} file(s) written, ${open} to settle. Nothing was committed: review the ` +
          'diff there, run its gates, and open the pull request.',
  );
  return lines.join('\n');
}

const gitOut = (cwd, args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

/** Why this folder cannot receive a push, or null: it must be a clean template checkout on a branch of its own. */
export function refusal(templateDir) {
  let manifest;
  try {
    manifest = loadManifest(templateDir);
  } catch (e) {
    return `--to is not a checkout of the template: ${e.message}`;
  }
  if (manifest.base !== null) return '--to is a product, not the template (its foundation.json records a base).';
  let branch;
  try {
    if (gitOut(templateDir, ['status', '--porcelain']) !== '')
      return '--to has uncommitted changes. Use a clean checkout, so what arrives is one diff.';
    branch = gitOut(templateDir, ['rev-parse', '--abbrev-ref', 'HEAD']);
  } catch {
    return '--to is not a git checkout.';
  }
  let fallback = 'main';
  try {
    fallback = JSON.parse(fs.readFileSync(path.join(templateDir, '.claude/workflow.json'), 'utf8')).defaultBranch;
  } catch {
    // no workflow file: main
  }
  if (branch === (fallback || 'main') || branch === 'HEAD')
    return `--to is on ${branch === 'HEAD' ? 'a detached commit' : `"${branch}"`}. Make a branch for this first (a worktree keeps the main checkout free).`;
  return null;
}

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      to: { type: 'string' },
      from: { type: 'string' },
      root: { type: 'string' },
      json: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  const root = path.resolve(values.root ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));
  const manifest = loadManifest(root);
  if (manifest.base === null)
    throw new Error(`this is the template (v${manifest.version}). A push runs in a product scaffolded from it.`);
  if (!values.to) throw new Error('say where the template is checked out: --to <path>');
  const templateDir = fs.realpathSync(path.resolve(values.to));
  const dryRun = values['dry-run'];
  const why = refusal(templateDir);
  if (why && !(dryRun && /uncommitted|is on /.test(why))) throw new Error(why);

  // The checkout being written to has the base commit in its history: no network needed.
  const { dir } = rebuildBase({ manifest, source: values.from ?? process.env.FOUNDATION_SOURCE ?? templateDir });
  try {
    const result = compareTrees({ baseDir: dir, productDir: root, manifest });
    const plan = planPush({
      baseDir: dir,
      productDir: root,
      templateDir,
      manifest,
      result,
      only: positionals,
      words: productWords(manifest.scaffold, loadManifest(templateDir)),
    });
    if (!dryRun) applyPush({ plan, templateDir, productDir: root });
    if (values.json) {
      const actions = plan.actions.map(({ rel, from }) => ({ rel, from }));
      console.log(JSON.stringify({ to: templateDir, dryRun, ...plan, actions }, null, 2));
    } else console.log(report({ manifest, templateDir, plan, dryRun }));
    return plan.conflicts.length + plan.named.length ? 2 : 0;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

if (isEntryModule(import.meta.url)) {
  try {
    process.exitCode = main();
  } catch (e) {
    console.error(`foundation: ${e.message}`);
    process.exit(1);
  }
}
