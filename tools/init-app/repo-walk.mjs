/**
 * The one list of what the init-app tools read in a repo: the rename walker in init-app.mjs and the residue search
 * in check-variants.mjs skip the same folders and files, so a manifest or residue entry never matches itself.
 */
import fs from 'node:fs';
import path from 'node:path';

export const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.turbo',
  '.next',
  'dist',
  'build',
  'coverage',
  '.screenshots',
  '.dart_tool',
  'ephemeral',
  '.gradle',
  'generated',
]);
export const SKIP_REL = ['docs/superpowers', 'tools/init-app'];
export const SKIP_FILES = new Set(['pnpm-lock.yaml']);
export const BINARY_EXT = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.webp',
  '.svg',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.pdf',
  '.zip',
  '.gz',
  '.tar',
  '.mp4',
  '.mov',
  '.dump',
  '.jar',
]);

/** Yields { abs, rel } for every text-candidate file under `root`, rel with forward slashes. */
export function* walkRepo(root, dir = root) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(root, abs).split(path.sep).join('/');
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (SKIP_REL.some((p) => rel === p || rel.startsWith(p + '/'))) continue;
      yield* walkRepo(root, abs);
    } else if (entry.isFile()) {
      if (SKIP_FILES.has(entry.name)) continue;
      if (BINARY_EXT.has(path.extname(entry.name).toLowerCase())) continue;
      if (SKIP_REL.some((p) => rel.startsWith(p + '/'))) continue;
      yield { abs, rel };
    }
  }
}
