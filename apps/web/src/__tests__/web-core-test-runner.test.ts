/* global describe, it, expect */
import { readdirSync, statSync } from 'fs';
import { join, resolve, sep } from 'path';

/**
 * `@appshore/web-core` has no test runner of its own: it is source-consumed by this app (tsconfig paths and the
 * jest moduleNameMapper). Its tests run in this app's jest, so every test file under its `src/` must sit under one
 * of this config's roots. Without that, `turbo run test` passes while web-core's tests never run.
 */
const WEB_ROOT = resolve(__dirname, '../..');
const WEB_CORE_SRC = resolve(WEB_ROOT, '../../packages/appshore/web-core/src');
const TEST_FILE = /\.(spec|test)\.(js|jsx|ts|tsx)$/;

// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.config.js is CommonJS
const config = require(join(WEB_ROOT, 'jest.config.js')) as { roots: string[] };

function testFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === 'node_modules' ? [] : testFiles(full);
    return TEST_FILE.test(name) ? [full] : [];
  });
}

describe('web-core tests run in the web jest', () => {
  const roots = config.roots.map((root) => resolve(root.replace('<rootDir>', WEB_ROOT)));

  it('web-core has at least one test file', () => {
    expect(testFiles(WEB_CORE_SRC).length).toBeGreaterThan(0);
  });

  it('every web-core test file is under a jest root', () => {
    const outside = testFiles(WEB_CORE_SRC).filter(
      (file) => !roots.some((root) => file === root || file.startsWith(root + sep)),
    );
    expect(outside).toEqual([]);
  });
});
