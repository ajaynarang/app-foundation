import * as fs from 'fs';
import * as path from 'path';

/**
 * Foundation package-boundary guardrail.
 *
 * Enforces the AppShore layer map (docs/superpowers/specs/
 * 2026-07-03-appshore-foundation-packages-design.md):
 *
 *   @appshore/kernel   ← DB-free, Redis-free mechanics. May import ONLY
 *                        node/libs and @app/shared-types.
 *   @appshore/db       ← prisma schema + client. Imports nothing appshore.
 *   @appshore/platform ← may import kernel + db. NEVER app code.
 *   apps/backend       ← may import everything.
 *
 * A red test here means a dependency arrow points the wrong way.
 */

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const FOUNDATION = path.join(REPO_ROOT, 'packages', 'foundation');

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      out.push(...listTsFiles(full));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

function importsOf(file: string): string[] {
  const text = fs.readFileSync(file, 'utf8');
  const specs: string[] = [];
  for (const m of text.matchAll(/(?:from\s+|require\(|jest\.mock\(|import\()\s*'([^']+)'/g)) {
    specs.push(m[1]);
  }
  return specs;
}

function violations(pkgDir: string, banned: (spec: string) => boolean): string[] {
  const out: string[] = [];
  for (const file of listTsFiles(path.join(FOUNDATION, pkgDir, 'src'))) {
    for (const spec of importsOf(file)) {
      if (banned(spec)) out.push(`${path.relative(REPO_ROOT, file)} -> '${spec}'`);
    }
  }
  return out;
}

describe('Foundation package boundaries', () => {
  it('@appshore/kernel imports no db, no platform, no app code, no redis/prisma libs', () => {
    const banned = (s: string) =>
      s === '@appshore/db' ||
      s.startsWith('@appshore/db/') ||
      s.startsWith('@appshore/platform') ||
      s.startsWith('@appshore/web-core') ||
      s === 'ioredis' ||
      s === '@prisma/client' ||
      s.startsWith('@prisma/') ||
      /\.\.\/(\.\.\/)*apps\//.test(s);
    expect(violations('kernel', banned)).toEqual([]);
  });

  it('@appshore/platform never imports app code or web-core', () => {
    const banned = (s: string) => s.startsWith('@appshore/web-core') || /\.\.\/(\.\.\/)*apps\//.test(s);
    expect(violations('platform', banned)).toEqual([]);
  });

  it('@appshore/web-core never imports app features or backend packages', () => {
    const banned = (s: string) =>
      s.startsWith('@/') ||
      s.startsWith('@appshore/platform') ||
      s === '@appshore/db' ||
      /\.\.\/(\.\.\/)*apps\//.test(s);
    expect(violations('web-core', banned)).toEqual([]);
  });

  it('kernel package.json declares no prisma/ioredis dependencies', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(FOUNDATION, 'kernel', 'package.json'), 'utf8'));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies });
    expect(deps.filter((d) => d.includes('prisma') || d === 'ioredis' || d === '@appshore/db')).toEqual([]);
  });
});
