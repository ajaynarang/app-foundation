/**
 * foundation.json: which version of the template a repository is on, and which paths the foundation owns.
 *
 *   owned   globs the foundation keeps in step across products (a product change there is offered back)
 *   seams   files inside an owned area that every product fills in (never compared, never overwritten)
 *   base    the template version and commit a product was scaffolded from (null in the template)
 *   scaffold  the answers init-app was given, so the base can be rebuilt exactly as the product received it
 *
 * Everything that is neither owned nor a seam is starter content: shipped once, the product's from then on.
 * Zero dependencies. Node >= 20.
 */
import fs from 'node:fs';
import path from 'node:path';

export const MANIFEST_FILE = 'foundation.json';
export const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
export const CLASS = { OWNED: 'owned', SEAM: 'seam', STARTER: 'starter' };
const SCAFFOLD_KEYS = ['name', 'displayName', 'scope', 'db', 'tenancy', 'mobile', 'desk', 'skillPrefix', 'plans'];
const SKILL_DIRS = ['.claude/skills/', '.claude/agents/'];

/** `**` crosses folders, `*` stays inside one path segment. Paths are repo-relative with forward slashes. */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      i++;
      if (glob[i + 1] === '/') {
        i++;
        re += '(?:.*/)?';
      } else re += '.*';
    } else if (c === '*') re += '[^/]*';
    else re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

export function matcher(globs) {
  const res = globs.map(globToRegExp);
  return (rel) => res.some((re) => re.test(rel));
}

const isGlobList = (v) => Array.isArray(v) && v.length > 0 && v.every((g) => typeof g === 'string' && g.length > 0);

/** Every problem with the manifest's shape, as sentences; an empty list means it is valid. */
export function validateManifest(m) {
  const problems = [];
  if (!m || typeof m !== 'object' || Array.isArray(m)) return ['is not a JSON object'];
  if (typeof m.version !== 'string' || !VERSION_PATTERN.test(m.version)) problems.push('version must look like 1.2.3');
  if (typeof m.template !== 'string' || !m.template) problems.push('template must be the template repository URL');
  if (!isGlobList(m.owned)) problems.push('owned must be a non-empty list of globs');
  if (!isGlobList(m.seams)) problems.push('seams must be a non-empty list of globs');
  for (const g of [...(Array.isArray(m.owned) ? m.owned : []), ...(Array.isArray(m.seams) ? m.seams : [])])
    if (typeof g === 'string' && (g.startsWith('/') || g.includes('\\') || g.split('/').includes('..')))
      problems.push(`"${g}" must be a repo-relative path with forward slashes`);
  if (m.base !== null) {
    if (!m.base || typeof m.base !== 'object') problems.push('base must be null (the template) or an object');
    else {
      if (typeof m.base.version !== 'string' || !VERSION_PATTERN.test(m.base.version))
        problems.push('base.version must look like 1.2.3');
      if (m.base.commit !== null && !/^[0-9a-f]{40}$/.test(m.base.commit ?? ''))
        problems.push('base.commit must be a full commit sha or null');
    }
  }
  if (m.scaffold !== null) {
    if (!m.scaffold || typeof m.scaffold !== 'object') problems.push('scaffold must be null or an object');
    else
      for (const k of SCAFFOLD_KEYS)
        if (typeof m.scaffold[k] !== 'string' || !m.scaffold[k]) problems.push(`scaffold.${k} is missing`);
  }
  if ((m.base === null) !== (m.scaffold === null))
    problems.push('base and scaffold are both null (the template) or both set (a product)');
  return problems;
}

export function loadManifest(root) {
  const file = path.join(root, MANIFEST_FILE);
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    throw new Error(`${MANIFEST_FILE}: not found in ${root}`);
  }
  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch (e) {
    throw new Error(`${MANIFEST_FILE}: ${e.message}`);
  }
  const problems = validateManifest(manifest);
  if (problems.length) throw new Error(`${MANIFEST_FILE}: ${problems.join('; ')}`);
  return manifest;
}

/**
 * A product's path as the template names it. init-app renames skill folders and agent files to the product's prefix
 * (`.claude/skills/tl-plan` was `.claude/skills/app-plan`); the manifest's globs are written in template names.
 */
export function toTemplatePath(rel, scaffold, templatePrefix = 'app') {
  const prefix = scaffold?.skillPrefix;
  if (!prefix || prefix === templatePrefix) return rel;
  for (const dir of SKILL_DIRS)
    if (rel.startsWith(`${dir}${prefix}-`))
      return `${dir}${templatePrefix}-${rel.slice(dir.length + prefix.length + 1)}`;
  return rel;
}

/** A classifier over template paths: owned, seam or starter. A seam wins over the owned glob it sits inside. */
export function classifier(manifest) {
  const owned = matcher(manifest.owned);
  const seam = matcher(manifest.seams);
  return (templateRel) => (seam(templateRel) ? CLASS.SEAM : owned(templateRel) ? CLASS.OWNED : CLASS.STARTER);
}

/** The classifier for paths as they are in this repository (a product's renamed skills included). */
export function classifierFor(manifest) {
  const classify = classifier(manifest);
  return (rel) => classify(toTemplatePath(rel, manifest.scaffold));
}

/** JSON as Prettier writes it for this repo's width, so a written manifest passes the format check. */
export function formatManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/**
 * What init-app writes for a product: the template's manifest as it read it before any rename (so the template URL
 * and the globs keep their template names), plus the base it scaffolded from and the answers it was given.
 */
export function productManifest(templateManifest, { scaffold, commit }) {
  const answers = {};
  for (const k of [...SCAFFOLD_KEYS, 'repoUrl']) if (scaffold[k]) answers[k] = scaffold[k];
  return {
    ...templateManifest,
    base: { version: templateManifest.version, commit: commit ?? null },
    scaffold: answers,
  };
}

export function writeManifest(root, manifest) {
  const problems = validateManifest(manifest);
  if (problems.length) throw new Error(`${MANIFEST_FILE}: ${problems.join('; ')}`);
  fs.writeFileSync(path.join(root, MANIFEST_FILE), formatManifest(manifest));
}
