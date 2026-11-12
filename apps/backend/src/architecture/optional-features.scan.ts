import * as fs from 'fs';
import * as path from 'path';

/**
 * Reads the optional-feature manifests (`tools/init-app/features/<name>.json`) and the seam
 * (`apps/backend/src/platform-glue/features/index.ts`), and reports what is out of step. The rules mirror
 * `tools/init-app/apply-feature.mjs`, which strips a feature: a marker is a comment line holding only
 * `feature:<name>:start` or `feature:<name>:end`. Used by `optional-features.spec.ts`.
 */

export interface JsonEntry {
  file: string;
  path: string[];
  value?: unknown;
}

export interface FeatureManifest {
  name: string;
  paths: string[];
  markers: string[];
  jsonEntries: JsonEntry[];
  allowlistPrefixes: { prefix: string; files: string[] }[];
}

export const FEATURES_DIR_REL = 'tools/init-app/features';
export const SEAM_DIR_REL = 'apps/backend/src/platform-glue/features';
const MANIFEST_KEYS = ['paths', 'markers', 'jsonEntries', 'allowlistPrefixes'] as const;

export function listManifests(root: string): FeatureManifest[] {
  const dir = path.join(root, FEATURES_DIR_REL);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json') && !f.endsWith('.residue.json'))
    .sort()
    .map((f) => {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Record<string, unknown>;
      const unknown = Object.keys(raw).filter(
        (k) => !k.startsWith('$') && !(MANIFEST_KEYS as readonly string[]).includes(k),
      );
      if (unknown.length > 0) throw new Error(`${FEATURES_DIR_REL}/${f}: unknown key(s) ${unknown.join(', ')}`);
      return {
        name: f.slice(0, -'.json'.length),
        paths: (raw.paths as string[]) ?? [],
        markers: (raw.markers as string[]) ?? [],
        jsonEntries: (raw.jsonEntries as JsonEntry[]) ?? [],
        allowlistPrefixes: (raw.allowlistPrefixes as FeatureManifest['allowlistPrefixes']) ?? [],
      };
    });
}

/** The features the product kept: each `./<name>.feature` import in the seam's index. */
export function keptFeatures(root: string): string[] {
  const index = path.join(root, SEAM_DIR_REL, 'index.ts');
  const text = fs.readFileSync(index, 'utf8');
  return [...text.matchAll(/from\s+'\.\/([a-z0-9-]+)\.feature'/g)].map((m) => m[1]).sort();
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isMarkerLine(line: string, token: string): boolean {
  return new RegExp(`^\\s*(?://|#|<!--|/\\*|\\{/\\*)\\s*${escapeRegExp(token)}\\b`).test(line);
}

/** The marked blocks as [start, end] line pairs (0-based), or an error string for an unbalanced file. */
export function markerBlocks(text: string, name: string): [number, number][] | string {
  const start = `feature:${name}:start`;
  const end = `feature:${name}:end`;
  const blocks: [number, number][] = [];
  let open = -1;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (isMarkerLine(lines[i], start)) {
      if (open !== -1) return `line ${i + 1}: "${start}" inside an open block`;
      open = i;
    } else if (isMarkerLine(lines[i], end)) {
      if (open === -1) return `line ${i + 1}: "${end}" without a start`;
      blocks.push([open, i]);
      open = -1;
    }
  }
  return open === -1 ? blocks : `line ${open + 1}: "${start}" is never closed`;
}

function jsonEntryPresent(obj: unknown, entry: JsonEntry): boolean {
  let node: unknown = obj;
  for (const key of entry.path) {
    if (node === null || typeof node !== 'object' || !(key in node)) return false;
    node = (node as Record<string, unknown>)[key];
  }
  if (!('value' in entry)) return true;
  return Array.isArray(node) && node.includes(entry.value);
}

function keysWithPrefix(obj: unknown, prefix: string, out: string[] = []): string[] {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith(prefix)) out.push(k);
      else keysWithPrefix(v, prefix, out);
    }
  }
  return out;
}

const readJson = (file: string): unknown => JSON.parse(fs.readFileSync(file, 'utf8'));

/**
 * What is wrong with one feature's footprint. A kept feature has every path, a marked block in every marker file,
 * every JSON entry and every allowlist file. A dropped one has none of them, and no allowlist key under its prefix.
 */
export function footprintProblems(root: string, manifest: FeatureManifest, kept: boolean): string[] {
  const problems: string[] = [];
  const abs = (rel: string) => path.join(root, rel);
  const state = kept ? 'kept' : 'dropped';

  for (const rel of manifest.paths) {
    if (fs.existsSync(abs(rel)) !== kept)
      problems.push(`${state} "${manifest.name}": path ${rel} ${kept ? 'is missing' : 'still exists'}`);
  }
  for (const rel of manifest.markers) {
    if (!fs.existsSync(abs(rel))) {
      if (kept) problems.push(`kept "${manifest.name}": marker file ${rel} is missing`);
      continue;
    }
    const blocks = markerBlocks(fs.readFileSync(abs(rel), 'utf8'), manifest.name);
    if (typeof blocks === 'string') problems.push(`${rel}: ${blocks}`);
    else if (kept && blocks.length === 0)
      problems.push(`kept "${manifest.name}": ${rel} holds no feature:${manifest.name} block`);
    else if (!kept && blocks.length > 0)
      problems.push(`dropped "${manifest.name}": ${rel} still holds ${blocks.length} block(s)`);
  }
  for (const entry of manifest.jsonEntries) {
    const has = fs.existsSync(abs(entry.file)) && jsonEntryPresent(readJson(abs(entry.file)), entry);
    if (has !== kept) {
      const what = `${entry.file} ${entry.path.join(' → ')}${'value' in entry ? ` ∋ ${JSON.stringify(entry.value)}` : ''}`;
      problems.push(`${state} "${manifest.name}": JSON entry ${what} ${kept ? 'is missing' : 'is still there'}`);
    }
  }
  for (const { prefix, files } of manifest.allowlistPrefixes) {
    for (const rel of files) {
      if (!fs.existsSync(abs(rel))) {
        problems.push(`"${manifest.name}": allowlist file ${rel} is missing`);
        continue;
      }
      if (!kept) {
        for (const key of keysWithPrefix(readJson(abs(rel)), prefix)) {
          problems.push(`dropped "${manifest.name}": ${rel} still holds "${key}"`);
        }
      }
    }
  }
  return problems;
}

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.turbo',
  '.next',
  'dist',
  'build',
  'coverage',
  '.dart_tool',
  '.gradle',
  'generated',
  '.worktrees',
  '.screenshots',
]);
// The rename walker in tools/init-app/init-app.mjs skips the same two: the tool itself and the design history.
const SKIP_REL = ['tools/init-app', 'docs/superpowers'];
const TEXT_FILE = /\.(ts|tsx|js|mjs|cjs|json|md|ya?ml|sh|prisma|tf|toml|dart|css|example)$|^\.env/;

/** Repo-relative paths of the text files the guards read. */
export function textFiles(root: string, dir = root, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full).split(path.sep).join('/');
    if (SKIP_REL.some((p) => rel === p || rel.startsWith(p + '/'))) continue;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) textFiles(root, full, out);
    } else if (entry.isFile() && TEXT_FILE.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

/** Files holding a `feature:<name>` marker that the manifest does not list in `markers`. */
export function unregisteredMarkerFiles(root: string, manifest: FeatureManifest, files: string[]): string[] {
  const listed = new Set(manifest.markers);
  const start = `feature:${manifest.name}:start`;
  const end = `feature:${manifest.name}:end`;
  return files.filter((rel) => {
    if (listed.has(rel)) return false;
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    if (!text.includes(start) && !text.includes(end)) return false;
    return text.split('\n').some((l) => isMarkerLine(l, start) || isMarkerLine(l, end));
  });
}

/**
 * Imports of a feature's backend code from outside it. The feature's backend roots are its manifest paths under
 * `apps/backend/`; the seam file `<name>.feature.ts` may import them, and so may a line inside a marked block of a
 * file the manifest lists (it goes with the feature).
 */
export function importsOutsideSeam(root: string, manifest: FeatureManifest, files: string[]): string[] {
  const roots = manifest.paths.filter((p) => p.startsWith('apps/backend/')).map((p) => path.join(root, p));
  if (roots.length === 0) return [];
  const seam = `${SEAM_DIR_REL}/${manifest.name}.feature.ts`;
  const listed = new Set(manifest.markers);
  const inside = (abs: string) => roots.some((r) => abs === r || abs.startsWith(r + path.sep));
  const out: string[] = [];
  for (const rel of files) {
    if (!/\.(ts|tsx|js|mjs)$/.test(rel) || !rel.startsWith('apps/backend/')) continue;
    if (rel === seam || inside(path.join(root, rel))) continue;
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    const lines = text.split('\n');
    const blocks = listed.has(rel) ? markerBlocks(text, manifest.name) : [];
    const covered = (i: number) => Array.isArray(blocks) && blocks.some(([a, b]) => i > a && i < b);
    lines.forEach((line, i) => {
      for (const m of line.matchAll(/(?:from\s+|require\(|jest\.mock\(|import\()\s*['"]([^'"]+)['"]/g)) {
        const spec = m[1];
        const target = spec.startsWith('.') ? path.resolve(path.join(root, path.dirname(rel)), spec) : null;
        if (target && inside(target) && !covered(i)) out.push(`${rel}:${i + 1} -> '${spec}'`);
      }
    });
  }
  return out;
}
