#!/usr/bin/env node
/**
 * pnpm foundation:pull — bring this repository's foundation-owned files to a newer template version, keeping what
 * was changed here.
 *
 *   pnpm foundation:pull                 # the template's default branch
 *   pnpm foundation:pull 0.3.0           # the tag v0.3.0
 *   pnpm foundation:pull --ref <ref>     # any branch, tag or commit of the template
 *   pnpm foundation:pull --from ../app-foundation --dry-run
 *   pnpm foundation:pull --keep          # leave the rebuilt base and target on disk, to compare seams by hand
 *
 * Both sides are rebuilt with this repository's recorded answers (see base.mjs): the base it is on and the target.
 * Each owned file is then merged three ways. Seams and starter content are never rewritten; what the template
 * changed there is listed to look at by hand. Everything is planned before anything is written.
 * Exit 0 when clean, 2 when conflicts are left to resolve, 1 when it cannot run.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { isEntryModule } from '../guards/workflow-config.mjs';
import { rebuildBase, rebuildTemplate } from './base.mjs';
import { CLASS, MANIFEST_FILE, VERSION_PATTERN, classifierFor, loadManifest, writeManifest } from './manifest.mjs';
import { sameContent, walkFiles } from './status.mjs';

const NOTES_DIR = 'docs/upgrade-notes/';
const LIST_LIMIT = 20;

export const ACTION = {
  TAKE: 'take',
  ADD: 'add',
  REMOVE: 'remove',
  MERGE: 'merge',
  CONFLICT: 'conflict',
};

const read = (dir, rel) => {
  try {
    return fs.readFileSync(path.join(dir, rel));
  } catch {
    return null;
  }
};
const isBinary = (buffer) => buffer.includes(0);
/** Both absent, or both present with the same content (Markdown as `foundation:status` compares it). */
const same = (rel, a, b) => (a === null || b === null ? a === b : sameContent(rel, a, b));

/**
 * `git merge-file` on three versions of one file. Returns the merged bytes and how many conflicts it left in them.
 * `base` null means the file is new on both sides: the common ancestor is an empty file.
 */
function mergeFile({ ours, base, theirs, labels, scratch }) {
  const file = (name, content) => {
    const at = path.join(scratch, name);
    fs.writeFileSync(at, content ?? '');
    return at;
  };
  const args = ['merge-file', '-p', '-L', labels.ours, '-L', labels.base, '-L', labels.theirs];
  const r = spawnSync('git', [...args, file('ours', ours), file('base', base), file('theirs', theirs)], {
    maxBuffer: 256 * 1024 * 1024,
  });
  if (r.error || r.status === null || r.status > 127)
    throw new Error(`git merge-file failed: ${r.error?.message ?? String(r.stderr).trim()}`);
  return { content: r.stdout, conflicts: r.status };
}

/** The `## ` entries of an upgrade note that the base's copy does not have. */
function newEntries(theirs, base) {
  const headings = (buffer) =>
    buffer
      ? buffer
          .toString('utf8')
          .split('\n')
          .filter((line) => line.startsWith('## '))
          .map((line) => line.slice(3).trim())
      : [];
  const had = new Set(headings(base));
  return headings(theirs).filter((h) => !had.has(h));
}

/**
 * Decides, without writing, what a pull does to every file. Paths are classified by the target's lists with the
 * product's answers (`pulledManifest`), so an area the newer version started to own is pulled too.
 *
 * Returns `actions` (what to write: take, add, remove, merge, conflict — the last two carry the merged bytes),
 * `conflicts` (every path a person must settle, with the reason), `seams` and `starter` (what the template changed
 * outside what a pull writes) and `notes` (upgrade notes that are new or gained entries).
 */
export function planPull({ baseDir, targetDir, productDir, targetManifest, labels }) {
  const classify = classifierFor(targetManifest);
  const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'foundation-merge-')));
  const names = { ours: 'here', base: 'base', theirs: 'foundation', ...labels };
  const plan = { actions: [], conflicts: [], seams: [], starter: [], notes: [] };
  const paths = [...new Set([...walkFiles(baseDir), ...walkFiles(targetDir)])].sort();
  try {
    for (const rel of paths) {
      if (rel === MANIFEST_FILE) continue;
      const base = read(baseDir, rel);
      const theirs = read(targetDir, rel);
      if (same(rel, base, theirs)) continue;
      const kind = classify(rel);
      const ours = read(productDir, rel);

      if (kind === CLASS.STARTER) {
        plan.starter.push(rel);
        continue;
      }
      if (kind === CLASS.SEAM) {
        // A seam the product never had is new wiring the newer foundation imports: it must exist.
        if (base === null && ours === null) plan.actions.push({ rel, kind: ACTION.ADD });
        else if (!same(rel, ours, theirs)) plan.seams.push(rel);
        continue;
      }

      if (rel.startsWith(NOTES_DIR) && theirs !== null)
        plan.notes.push({ rel, entries: newEntries(theirs, base), isNew: base === null });

      if (same(rel, ours, theirs)) continue;
      if (theirs === null) {
        if (ours === null) continue;
        if (same(rel, ours, base)) plan.actions.push({ rel, kind: ACTION.REMOVE });
        else plan.conflicts.push({ rel, reason: 'removed in the foundation, changed here: kept' });
        continue;
      }
      if (ours === null) {
        if (base === null) plan.actions.push({ rel, kind: ACTION.ADD });
        else plan.conflicts.push({ rel, reason: 'changed in the foundation, deleted here: left deleted' });
        continue;
      }
      if (base !== null && same(rel, ours, base)) {
        plan.actions.push({ rel, kind: ACTION.TAKE });
        continue;
      }
      if (isBinary(ours) || isBinary(theirs)) {
        plan.conflicts.push({ rel, reason: 'binary file changed on both sides: kept as it is here' });
        continue;
      }
      const merged = mergeFile({ ours, base, theirs, labels: names, scratch });
      if (merged.conflicts === 0) plan.actions.push({ rel, kind: ACTION.MERGE, content: merged.content });
      else {
        plan.actions.push({ rel, kind: ACTION.CONFLICT, content: merged.content });
        const side = base === null ? 'added on both sides' : 'changed on both sides';
        plan.conflicts.push({ rel, reason: `${side}: ${merged.conflicts} conflict marker(s) in the file` });
      }
    }
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  return plan;
}

/** Writes a plan into the product. Emptied folders are removed, as git would leave them. */
export function applyPull({ plan, targetDir, productDir }) {
  for (const { rel, kind, content } of plan.actions) {
    const to = path.join(productDir, rel);
    if (kind === ACTION.REMOVE) {
      fs.rmSync(to, { force: true });
      for (let dir = path.dirname(to); dir !== productDir && !fs.readdirSync(dir).length; dir = path.dirname(dir))
        fs.rmdirSync(dir);
      continue;
    }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    if (kind === ACTION.TAKE || kind === ACTION.ADD) {
      const from = path.join(targetDir, rel);
      fs.copyFileSync(from, to);
      fs.chmodSync(to, fs.statSync(from).mode);
    } else fs.writeFileSync(to, content);
  }
}

/**
 * The product's record after the pull: the target's version and lists, the target as the new base, and the product's
 * own answers untouched.
 */
export function pulledManifest({ productManifest, targetManifest, commit }) {
  return {
    ...targetManifest,
    base: { version: targetManifest.version, commit },
    scaffold: productManifest.scaffold,
  };
}

/** -1, 0 or 1 for two `1.2.3` versions. */
export function compareVersions(a, b) {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

/** The refs to try for what the developer asked for: a version is its tag, nothing is the default branch. */
export function targetRefs({ version, ref }) {
  if (ref) return [ref];
  if (!version) return ['HEAD'];
  const bare = version.replace(/^v/, '');
  if (!VERSION_PATTERN.test(bare)) throw new Error(`"${version}" is not a version like 1.2.3 (use --ref for a branch)`);
  return [`v${bare}`];
}

const short = (commit) => (commit ? ` @ ${commit.slice(0, 7)}` : '');

export function report({ from, to, plan, dryRun }) {
  const lines = [`foundation: v${from.version}${short(from.commit)} → v${to.version}${short(to.commit)}`];
  const section = (title, rows, limit = Infinity) => {
    if (!rows.length) return;
    lines.push('', `${title} (${rows.length})`);
    for (const row of rows.slice(0, limit)) lines.push(`  ${row}`);
    if (rows.length > limit) lines.push(`  … and ${rows.length - limit} more`);
  };
  const of = (kind) => plan.actions.filter((a) => a.kind === kind).map((a) => a.rel);
  section(dryRun ? 'Would update' : 'Updated', of(ACTION.TAKE), LIST_LIMIT);
  section(dryRun ? 'Would add' : 'Added', of(ACTION.ADD), LIST_LIMIT);
  section(dryRun ? 'Would remove' : 'Removed', of(ACTION.REMOVE), LIST_LIMIT);
  section(dryRun ? 'Would merge with the changes here' : 'Merged with the changes here', of(ACTION.MERGE));
  section(
    'Conflicts: settle each one',
    plan.conflicts.map((c) => `${c.rel}\n      ${c.reason}`),
  );
  section('Seams the template changed: compare by hand, a pull never writes them', plan.seams);
  section('Changed in the template outside the foundation: take what you need by hand', plan.starter);
  if (plan.notes.length) {
    lines.push('', 'Upgrade notes to read');
    for (const note of plan.notes) {
      lines.push(`  ${note.rel}${note.isNew ? ' (new)' : ''}`);
      for (const entry of note.entries) lines.push(`    - ${entry}`);
    }
  }
  const written = plan.actions.length;
  const conflicts = plan.conflicts.length;
  lines.push(
    '',
    dryRun
      ? `foundation: dry run, nothing written. ${written} file(s) would change, ${conflicts} conflict(s).`
      : `foundation: now on v${to.version}. ${written} file(s) written, ${conflicts} conflict(s) to settle.` +
          (written ? ' Next: pnpm install, then pnpm verify.' : ''),
  );
  return lines.join('\n');
}

/** True when git reports uncommitted or untracked files. A folder that is not a repository counts as clean. */
function isDirty(root) {
  try {
    return (
      execFileSync('git', ['status', '--porcelain'], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() !== ''
    );
  } catch {
    return false;
  }
}

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      from: { type: 'string' },
      ref: { type: 'string' },
      root: { type: 'string' },
      json: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      'allow-dirty': { type: 'boolean', default: false },
      keep: { type: 'boolean', default: false },
    },
  });
  const root = path.resolve(values.root ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));
  const dryRun = values['dry-run'];
  const manifest = loadManifest(root);
  if (manifest.base === null)
    throw new Error(`this is the template (v${manifest.version}). A pull runs in a product scaffolded from it.`);
  if (!dryRun && !values['allow-dirty'] && isDirty(root))
    throw new Error(
      'the working tree has uncommitted changes. Commit or stash them first, so the pull is one diff you can ' +
        'review and undo. --dry-run shows what a pull would do without writing.',
    );

  const source = values.from ?? process.env.FOUNDATION_SOURCE ?? manifest.template;
  const temps = [];
  try {
    const target = rebuildTemplate({
      source,
      refs: targetRefs({ version: positionals[0], ref: values.ref }),
      scaffold: manifest.scaffold,
      what: 'target',
    });
    temps.push(target.dir);
    let targetManifest;
    try {
      targetManifest = loadManifest(target.dir);
    } catch (e) {
      throw new Error(`the target (${target.ref}) cannot be pulled: ${e.message}`);
    }
    const from = manifest.base;
    const to = { version: targetManifest.version, commit: target.commit };
    if (to.commit === from.commit) {
      console.log(
        values.json
          ? JSON.stringify({ upToDate: true, base: from })
          : `foundation: already on v${from.version}${short(from.commit)}. Nothing to pull.`,
      );
      return 0;
    }
    if (compareVersions(to.version, from.version) < 0)
      throw new Error(`the target is v${to.version}, older than the base v${from.version}. A pull only goes forward.`);

    const base = rebuildBase({ manifest, source });
    temps.push(base.dir);
    const next = pulledManifest({ productManifest: manifest, targetManifest, commit: to.commit });
    const plan = planPull({
      baseDir: base.dir,
      targetDir: target.dir,
      productDir: root,
      targetManifest: next,
      labels: { base: `base v${from.version}`, theirs: `foundation v${to.version}` },
    });
    if (!dryRun) {
      applyPull({ plan, targetDir: target.dir, productDir: root });
      writeManifest(root, next);
    }
    const kept = values.keep ? { base: base.dir, target: target.dir } : null;
    if (values.json) {
      const actions = plan.actions.map(({ rel, kind }) => ({ rel, kind }));
      console.log(JSON.stringify({ from, to, dryRun, ...plan, actions, kept }, null, 2));
    } else {
      console.log(report({ from, to, plan, dryRun }));
      if (kept)
        console.log(`\nKept for comparing (remove when done):\n  base    ${kept.base}\n  target  ${kept.target}`);
    }
    if (kept) temps.length = 0;
    return plan.conflicts.length ? 2 : 0;
  } finally {
    for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
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
