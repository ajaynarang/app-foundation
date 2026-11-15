import * as fs from 'fs';
import * as path from 'path';
import { listSourceFiles, stripComments } from './source-text.scan';

/**
 * One way to get a model: `AiRouteResolver.resolve(tenantId, need)`. A provider client built anywhere else skips the
 * tenant's retention policy, the payer boundary and the ledger's route, which is how a zero-retention tenant's text
 * once reached a retaining provider.
 *
 * So provider packages are imported only under `domains/ai/routing/` (the route registry builds every client) and
 * `domains/ai/moderation/` (the external moderation client, a platform call on its own key):
 * - `@ai-sdk/<provider>` (`@ai-sdk/anthropic`, `@ai-sdk/cohere`, ...), `@openrouter/*` and `openai`, by `import`,
 *   `export ... from`, `require()` or dynamic `import()`;
 * - `createGateway` (the Vercel AI Gateway client, which ships inside the `ai` package itself), by name.
 *
 * The `ai` package (`generateText`, `embed`, ...) is free to import: it calls a model it is handed. Comments are
 * ignored; specs are not scanned.
 */

const SRC = path.resolve(__dirname, '..');
const ALLOWED_DIRS = [path.join(SRC, 'domains', 'ai', 'routing'), path.join(SRC, 'domains', 'ai', 'moderation')];

const PROVIDER_PACKAGE = String.raw`(?:@ai-sdk\/[\w.-]+|@openrouter\/[\w.-]+|openai)(?:\/[\w./-]*)?`;
const PROVIDER_IMPORT = new RegExp(
  String.raw`(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*\(\s*|\bimport\s+)['"]${PROVIDER_PACKAGE}['"]`,
);
const GATEWAY = /\bcreateGateway\b/;

export function namesAProviderClient(source: string): boolean {
  const code = stripComments(source);
  return PROVIDER_IMPORT.test(code) || GATEWAY.test(code);
}

describe('provider clients are built only by AI routing and moderation', () => {
  it('flags each way of reaching a provider package, and ignores comments and the ai package', () => {
    expect(namesAProviderClient(`import { createAnthropic } from '@ai-sdk/anthropic';`)).toBe(true);
    expect(namesAProviderClient(`import { createCohere } from "@ai-sdk/cohere";`)).toBe(true);
    expect(namesAProviderClient(`export { createOpenRouter } from '@openrouter/ai-sdk-provider';`)).toBe(true);
    expect(namesAProviderClient(`import OpenAI from 'openai';`)).toBe(true);
    expect(namesAProviderClient(`const m = require('openai/resources');`)).toBe(true);
    expect(namesAProviderClient(`const m = await import('@ai-sdk/amazon-bedrock');`)).toBe(true);
    expect(namesAProviderClient(`import 'openai/shims/node';`)).toBe(true);
    expect(namesAProviderClient(`import { createGateway } from 'ai';`)).toBe(true);

    expect(namesAProviderClient(`import { generateText, embed } from 'ai';`)).toBe(false);
    expect(namesAProviderClient(`import type { ModelAlias } from '@app/shared-types';`)).toBe(false);
    expect(namesAProviderClient(`// import { createAnthropic } from '@ai-sdk/anthropic';\nconst x = 1;`)).toBe(false);
    expect(namesAProviderClient(`const label = 'openai';`)).toBe(false);
  });

  it('no file under apps/backend/src outside domains/ai/routing and domains/ai/moderation names one', () => {
    const offenders = listSourceFiles(SRC)
      .filter((file) => !ALLOWED_DIRS.some((dir) => file.startsWith(dir + path.sep)))
      .filter((file) => namesAProviderClient(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(SRC, file));
    expect(offenders).toEqual([]);
  });
});
