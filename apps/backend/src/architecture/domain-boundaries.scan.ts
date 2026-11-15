import * as fs from 'fs';
import * as path from 'path';

/**
 * Import scanning for `domain-boundaries.spec.ts`. Not a spec itself.
 *
 * A domain is a folder under `apps/backend/src/domains/`. An edge `a -> b` exists when a file under `domains/a/`
 * (spec files included) imports a file under `domains/b/`, by a relative path or a `src/` path.
 */

export const DOMAINS_DIR_REL = 'apps/backend/src/domains';
export const ALLOWED_FILE_REL = 'apps/backend/src/architecture/domain-boundaries.allowed.json';

/** The allowed edges: each importing domain and the domains it may import. `$`-keys are comments. */
export type AllowedEdges = Record<string, string[]>;

/** Every import specifier in a TypeScript source text: static, dynamic, `require` and `jest.mock`. */
export function importsOf(text: string): string[] {
  const specs: string[] = [];
  for (const m of text.matchAll(
    /(?:from\s+|require\(\s*|jest\.mock\(\s*|import\(\s*|^\s*import\s+)['"]([^'"]+)['"]/gm,
  )) {
    specs.push(m[1]);
  }
  return specs;
}

function listTsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      out.push(...listTsFiles(full));
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** The domain folders under `root`. */
export function listDomains(root: string): string[] {
  const dir = path.join(root, DOMAINS_DIR_REL);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/** The domain a specifier imported from `file` resolves into, or null when it leaves the domains folder. */
export function targetDomain(root: string, file: string, spec: string): string | null {
  const domainsDir = path.join(root, DOMAINS_DIR_REL);
  let abs: string;
  if (spec.startsWith('.')) abs = path.resolve(path.dirname(file), spec);
  else if (spec.startsWith('src/')) abs = path.join(root, 'apps/backend', spec);
  else return null;
  const rel = path.relative(domainsDir, abs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel.split(path.sep)[0];
}

/** Every cross-domain edge under `root` as `from -> to`, with the files that make it. */
export function crossDomainEdges(root: string): Map<string, string[]> {
  const edges = new Map<string, string[]>();
  const domainsDir = path.join(root, DOMAINS_DIR_REL);
  for (const from of listDomains(root)) {
    for (const file of listTsFiles(path.join(domainsDir, from))) {
      for (const spec of importsOf(fs.readFileSync(file, 'utf8'))) {
        const to = targetDomain(root, file, spec);
        if (!to || to === from) continue;
        const key = `${from} -> ${to}`;
        const list = edges.get(key) ?? [];
        const rel = path.relative(root, file).split(path.sep).join('/');
        if (!list.includes(rel)) list.push(rel);
        edges.set(key, list);
      }
    }
  }
  return edges;
}

export function loadAllowed(root: string): AllowedEdges {
  const raw = JSON.parse(fs.readFileSync(path.join(root, ALLOWED_FILE_REL), 'utf8')) as Record<string, unknown>;
  const out: AllowedEdges = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith('$')) continue;
    if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
      throw new Error(`${ALLOWED_FILE_REL}: "${key}" must be a list of domain names`);
    }
    out[key] = value as string[];
  }
  return out;
}

/**
 * What is wrong between the edges on disk and the allowed file: an edge the file does not allow, an allowed edge
 * nothing uses any more (so the file stays the record of today's arrows), and a domain the file names that is gone.
 */
export function boundaryProblems(root: string, allowed: AllowedEdges): string[] {
  const problems: string[] = [];
  const edges = crossDomainEdges(root);
  const domains = new Set(listDomains(root));
  for (const [edge, files] of [...edges].sort(([a], [b]) => a.localeCompare(b))) {
    const [from, to] = edge.split(' -> ');
    if (!(allowed[from] ?? []).includes(to)) {
      problems.push(`${edge} is not an allowed arrow (${files.join(', ')})`);
    }
  }
  for (const [from, targets] of Object.entries(allowed)) {
    if (!domains.has(from)) problems.push(`"${from}" is not a domain under ${DOMAINS_DIR_REL}`);
    for (const to of targets) {
      if (!domains.has(to)) problems.push(`"${from}" allows "${to}", which is not a domain`);
      else if (!edges.has(`${from} -> ${to}`)) problems.push(`${from} -> ${to} is allowed but no file imports it`);
    }
  }
  return problems;
}
