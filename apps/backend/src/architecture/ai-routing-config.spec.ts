import * as fs from 'fs';
import * as path from 'path';
import { listSourceFiles, stripComments } from './source-text.scan';

/**
 * Code under `domains/ai/routing/` reads its keys through `ConfigService` (the zod schema in `config/configuration.ts`),
 * never `process.env`. A provider key read straight from the environment skips the schema, so it is not validated at
 * boot, not documented with the rest, and cannot be set per test module. The check is textual, comments ignored.
 */

const ROUTING_DIR = path.resolve(__dirname, '..', 'domains', 'ai', 'routing');

function readsProcessEnv(source: string): boolean {
  return /\bprocess\s*\.\s*env\b/.test(stripComments(source));
}

describe('AI routing reads config, never process.env', () => {
  it('flags a process.env read and ignores one named in a comment', () => {
    expect(readsProcessEnv('const key = process.env.OPENROUTER_API_KEY;')).toBe(true);
    expect(readsProcessEnv('const key = process\n  .env["X"];')).toBe(true);
    expect(readsProcessEnv('// never process.env here\nconst key = config.get("openRouterApiKey");')).toBe(false);
  });

  it('no source file under domains/ai/routing reads process.env', () => {
    const offenders = listSourceFiles(ROUTING_DIR)
      .filter((file) => readsProcessEnv(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(ROUTING_DIR, file));
    expect(offenders).toEqual([]);
  });
});
