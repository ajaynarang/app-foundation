#!/usr/bin/env node
/**
 * apply-feature — remove an optional feature from this repo, or show what removing it covers.
 *
 *   node tools/init-app/apply-feature.mjs --remove desk            # strip Desk
 *   node tools/init-app/apply-feature.mjs --remove desk --dry-run  # print what it would strip
 *   node tools/init-app/apply-feature.mjs --list desk              # print everything the manifest covers
 *
 * A feature is described by its manifest, `tools/init-app/features/<name>.json`, with four keys:
 *   paths              files and folders to delete
 *   markers            files holding blocks between `feature:<name>:start` and `feature:<name>:end` comment lines;
 *                      each block is removed with both marker lines (any comment syntax: //, #, <!-- -->)
 *   jsonEntries        { file, path, value? }: delete the key at `path`, or, with `value`, remove that value from
 *                      the array at `path` (package.json included)
 *   allowlistPrefixes  { prefix, files }: delete every key, at any depth, that starts with `prefix`
 *
 * Safe to run twice: whatever is already gone is skipped. `pnpm init-app --<name> no` calls the same code before
 * its rename rules, so the manifest is always matched against template text. A product that pulls template updates
 * keeps this folder: running `--remove` again deletes a returning file and strips a new marked block.
 *
 * Zero dependencies. Node >= 20.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FEATURES_DIR = path.join(HERE, 'features');
const DEFAULT_ROOT = path.resolve(HERE, '..', '..');

const MANIFEST_KEYS = ['paths', 'markers', 'jsonEntries', 'allowlistPrefixes'];

/** The feature names that have a manifest. */
export function listFeatureNames(featuresDir = FEATURES_DIR) {
  return fs
    .readdirSync(featuresDir)
    .filter((f) => f.endsWith('.json') && !f.endsWith('.residue.json'))
    .map((f) => f.slice(0, -'.json'.length))
    .sort();
}

/** Reads and checks `features/<name>.json`. The feature name is the file name. */
export function loadManifest(name, featuresDir = FEATURES_DIR) {
  const file = path.join(featuresDir, `${name}.json`);
  if (!fs.existsSync(file)) {
    const known = listFeatureNames(featuresDir).join(', ') || 'none';
    throw new Error(`No manifest for feature "${name}" (looked for ${file}; known: ${known}).`);
  }
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const manifest = { name };
  for (const key of MANIFEST_KEYS) manifest[key] = raw[key] ?? [];
  for (const key of Object.keys(raw)) {
    if (!MANIFEST_KEYS.includes(key) && !key.startsWith('$')) {
      throw new Error(`${file}: unknown key "${key}" (expected ${MANIFEST_KEYS.join(', ')}).`);
    }
  }
  return manifest;
}

export function markerTokens(name) {
  return { start: `feature:${name}:start`, end: `feature:${name}:end` };
}

/**
 * A marker is a line that holds only a comment opening and the token: `// feature:desk:start`,
 * `# feature:desk:start`, `<!-- feature:desk:start -->`, `/* feature:desk:start *\/`. Prose that quotes the token
 * (in backticks, mid-sentence) is not a marker.
 */
export function isMarkerLine(line, token) {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^\\s*(?://|#|<!--|/\\*|\\{/\\*)\\s*${escaped}\\b`).test(line);
}

/**
 * The marked blocks of `text` as [startLine, endLine] pairs (0-based, inclusive). Throws on a start without an end,
 * an end without a start, or a nested start.
 */
export function findMarkerBlocks(text, name, label = 'file') {
  const { start, end } = markerTokens(name);
  const lines = text.split('\n');
  const blocks = [];
  let open = -1;
  lines.forEach((line, i) => {
    if (isMarkerLine(line, start)) {
      if (open !== -1)
        throw new Error(`${label}:${i + 1}: "${start}" inside an open block (opened at line ${open + 1}).`);
      open = i;
    } else if (isMarkerLine(line, end)) {
      if (open === -1) throw new Error(`${label}:${i + 1}: "${end}" without a "${start}" above it.`);
      blocks.push([open, i]);
      open = -1;
    }
  });
  if (open !== -1) throw new Error(`${label}:${open + 1}: "${start}" is never closed.`);
  return blocks;
}

export function stripMarkerBlocks(text, name, label) {
  const blocks = findMarkerBlocks(text, name, label);
  if (blocks.length === 0) return { text, blocks };
  const lines = text.split('\n');
  const drop = new Set();
  for (const [a, b] of blocks) for (let i = a; i <= b; i++) drop.add(i);
  return { text: lines.filter((_, i) => !drop.has(i)).join('\n'), blocks };
}

function readJson(abs) {
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

function writeJson(abs, value) {
  fs.writeFileSync(abs, JSON.stringify(value, null, 2) + '\n');
}

function describeJsonEntry(entry) {
  const at = entry.path.map((k) => JSON.stringify(k)).join(' → ');
  return 'value' in entry ? `${entry.file}: ${JSON.stringify(entry.value)} in ${at}` : `${entry.file}: ${at}`;
}

/** The container at path[0..-1] and the last key, or null when any step is missing. */
function locate(obj, keys) {
  let node = obj;
  for (const k of keys.slice(0, -1)) {
    if (node === null || typeof node !== 'object' || !(k in node)) return null;
    node = node[k];
  }
  if (node === null || typeof node !== 'object') return null;
  return { parent: node, key: keys[keys.length - 1] };
}

/** True when the entry is present in the JSON value. */
export function jsonEntryPresent(obj, entry) {
  const at = locate(obj, entry.path);
  if (!at || !(at.key in at.parent)) return false;
  if (!('value' in entry)) return true;
  const arr = at.parent[at.key];
  return Array.isArray(arr) && arr.includes(entry.value);
}

function removeJsonEntry(obj, entry) {
  if (!jsonEntryPresent(obj, entry)) return false;
  const at = locate(obj, entry.path);
  if ('value' in entry) at.parent[at.key] = at.parent[at.key].filter((v) => v !== entry.value);
  else delete at.parent[at.key];
  return true;
}

/** Every key (at any depth) of `obj` that starts with `prefix`. */
export function keysWithPrefix(obj, prefix, out = []) {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith(prefix)) out.push(k);
      else keysWithPrefix(v, prefix, out);
    }
  }
  return out;
}

function deleteKeysWithPrefix(obj, prefix) {
  let n = 0;
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const k of Object.keys(obj)) {
      if (k.startsWith(prefix)) {
        delete obj[k];
        n++;
      } else n += deleteKeysWithPrefix(obj[k], prefix);
    }
  }
  return n;
}

/**
 * Removes everything the manifest names under `root`. Returns the actions, one line each. With `dryRun` it writes
 * nothing and returns what it would do. Throws, before writing anything, on an unbalanced marker block.
 */
export function removeFeature(root, manifest, { dryRun = false } = {}) {
  const actions = [];
  const abs = (rel) => path.join(root, rel);
  const verb = (word) => (dryRun ? `would ${word}` : word);

  // Read and check every marker file first, so a broken block stops the run before anything is deleted.
  const stripped = [];
  for (const rel of manifest.markers) {
    if (!fs.existsSync(abs(rel))) continue;
    const before = fs.readFileSync(abs(rel), 'utf8');
    const { text, blocks } = stripMarkerBlocks(before, manifest.name, rel);
    if (blocks.length > 0) stripped.push({ rel, text, count: blocks.length });
  }

  for (const rel of manifest.paths) {
    if (!fs.existsSync(abs(rel))) continue;
    if (!dryRun) fs.rmSync(abs(rel), { recursive: true, force: true });
    actions.push(`${verb('delete')} ${rel}`);
  }

  for (const { rel, text, count } of stripped) {
    if (!dryRun) fs.writeFileSync(abs(rel), text);
    actions.push(`${verb('strip')} ${count} block(s) in ${rel}`);
  }

  const jsonFiles = new Map();
  const loadJson = (rel) => {
    if (!jsonFiles.has(rel)) jsonFiles.set(rel, fs.existsSync(abs(rel)) ? readJson(abs(rel)) : null);
    return jsonFiles.get(rel);
  };
  const changed = new Set();

  for (const entry of manifest.jsonEntries) {
    const obj = loadJson(entry.file);
    if (obj && removeJsonEntry(obj, entry)) {
      changed.add(entry.file);
      actions.push(`${verb('remove')} ${describeJsonEntry(entry)}`);
    }
  }

  for (const { prefix, files } of manifest.allowlistPrefixes) {
    for (const rel of files) {
      const obj = loadJson(rel);
      if (!obj) continue;
      const n = deleteKeysWithPrefix(obj, prefix);
      if (n > 0) {
        changed.add(rel);
        actions.push(`${verb('drop')} ${n} entr${n === 1 ? 'y' : 'ies'} starting "${prefix}" from ${rel}`);
      }
    }
  }

  if (!dryRun) for (const rel of changed) writeJson(abs(rel), jsonFiles.get(rel));
  return actions;
}

/**
 * What of the manifest is still in the tree under `root`: paths that exist, marker files that hold a block, JSON
 * entries and allowlist keys that are present. Empty lists mean the feature is fully removed.
 */
export function featurePresence(root, manifest) {
  const abs = (rel) => path.join(root, rel);
  const present = { paths: [], markers: [], jsonEntries: [], allowlistKeys: [] };
  const missing = { paths: [], markers: [], jsonEntries: [] };
  for (const rel of manifest.paths) (fs.existsSync(abs(rel)) ? present : missing).paths.push(rel);
  for (const rel of manifest.markers) {
    const has =
      fs.existsSync(abs(rel)) && findMarkerBlocks(fs.readFileSync(abs(rel), 'utf8'), manifest.name, rel).length > 0;
    (has ? present : missing).markers.push(rel);
  }
  for (const entry of manifest.jsonEntries) {
    const has = fs.existsSync(abs(entry.file)) && jsonEntryPresent(readJson(abs(entry.file)), entry);
    (has ? present : missing).jsonEntries.push(describeJsonEntry(entry));
  }
  for (const { prefix, files } of manifest.allowlistPrefixes) {
    for (const rel of files) {
      if (!fs.existsSync(abs(rel))) continue;
      for (const key of keysWithPrefix(readJson(abs(rel)), prefix)) present.allowlistKeys.push(`${rel}: ${key}`);
    }
  }
  return { present, missing };
}

/** Everything the manifest covers, with the current text of each marked block and allowlist entry. */
export function listFeature(root, manifest) {
  const out = [];
  const abs = (rel) => path.join(root, rel);
  out.push(`Feature "${manifest.name}" (tools/init-app/features/${manifest.name}.json)`, '', 'Paths:');
  for (const rel of manifest.paths) out.push(`  ${rel}${fs.existsSync(abs(rel)) ? '' : '   (absent)'}`);
  out.push('', 'Marked blocks:');
  for (const rel of manifest.markers) {
    if (!fs.existsSync(abs(rel))) {
      out.push(`  ${rel}   (file absent)`);
      continue;
    }
    const text = fs.readFileSync(abs(rel), 'utf8');
    const lines = text.split('\n');
    const blocks = findMarkerBlocks(text, manifest.name, rel);
    if (blocks.length === 0) out.push(`  ${rel}   (no block)`);
    for (const [a, b] of blocks) {
      out.push(`  ${rel}:${a + 1}-${b + 1}`);
      for (let i = a; i <= b; i++) out.push(`    | ${lines[i]}`);
    }
  }
  out.push('', 'JSON entries:');
  for (const entry of manifest.jsonEntries) {
    let value = '(absent)';
    if (fs.existsSync(abs(entry.file))) {
      const obj = readJson(abs(entry.file));
      if (jsonEntryPresent(obj, entry)) {
        const at = locate(obj, entry.path);
        value = 'value' in entry ? '(present)' : `= ${JSON.stringify(at.parent[at.key])}`;
      }
    }
    out.push(`  ${describeJsonEntry(entry)}   ${value}`);
  }
  out.push('', 'Allowlist prefixes:');
  for (const { prefix, files } of manifest.allowlistPrefixes) {
    for (const rel of files) {
      out.push(`  "${prefix}" in ${rel}`);
      if (!fs.existsSync(abs(rel))) continue;
      const obj = readJson(abs(rel));
      const walk = (node, trail) => {
        if (!node || typeof node !== 'object' || Array.isArray(node)) return;
        for (const [k, v] of Object.entries(node)) {
          if (k.startsWith(prefix)) out.push(`    ${[...trail, k].join(' → ')}: ${JSON.stringify(v)}`);
          else walk(v, [...trail, k]);
        }
      };
      walk(obj, []);
    }
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main() {
  const { values } = parseArgs({
    options: {
      remove: { type: 'string' },
      list: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      root: { type: 'string' },
      help: { type: 'boolean', default: false },
    },
  });
  const usage = `Usage: node tools/init-app/apply-feature.mjs (--remove <name> [--dry-run] | --list <name>)

  --remove <name>  Delete the feature's paths, marked blocks, JSON entries and allowlist entries
  --list <name>    Print everything the manifest covers, with the current text of each block
  --dry-run        With --remove: print what would change; write nothing
  --root <dir>     Repo root (default: this repo)

Features: ${listFeatureNames().join(', ')}`;
  if (values.help || (!values.remove && !values.list) || (values.remove && values.list)) {
    console.log(usage);
    process.exit(values.help ? 0 : 1);
  }
  const root = path.resolve(values.root ?? DEFAULT_ROOT);
  try {
    if (values.list) {
      console.log(listFeature(root, loadManifest(values.list)));
      return;
    }
    const actions = removeFeature(root, loadManifest(values.remove), { dryRun: values['dry-run'] });
    if (actions.length === 0) console.log(`Nothing to remove: "${values.remove}" is already gone.`);
    for (const a of actions) console.log(`  ${a}`);
  } catch (e) {
    console.error(`\n  ✖ ${e.message}\n`);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
