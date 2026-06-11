import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

/**
 * Static coverage guard: every method decorated with @Tool in
 * apps/backend/src/domains/ai/mcp/tools/ must also carry @RequiresScope.
 *
 * Counts decorator occurrences per-file and asserts equality. A lightweight
 * alternative to booting AppModule (which is blocked by an unrelated
 * Mastra/@mastra/pg ESM issue in jest). The true runtime guard lives in
 * ScopeRegistryService.onModuleInit and runs on every server start.
 */
describe('scope coverage', () => {
  const TOOL_DIR = resolve(__dirname, '../../mcp/tools');

  function listToolFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...listToolFiles(path));
      else if (entry.isFile() && entry.name.endsWith('.tool.ts')) out.push(path);
    }
    return out;
  }

  it('every @Tool method has a paired @RequiresScope decorator', () => {
    const files = listToolFiles(TOOL_DIR);
    expect(files.length).toBeGreaterThan(0);

    const mismatches: Array<{ file: string; tools: number; scopes: number }> = [];
    let totalTools = 0;
    let totalScopes = 0;

    for (const path of files) {
      const src = readFileSync(path, 'utf8');
      const tools = (src.match(/@Tool\(/g) ?? []).length;
      const scopes = (src.match(/@RequiresScope\(/g) ?? []).length;
      totalTools += tools;
      totalScopes += scopes;
      if (tools !== scopes) {
        mismatches.push({ file: path.replace(TOOL_DIR, ''), tools, scopes });
      }
    }

    expect(mismatches).toEqual([]);
    expect(totalTools).toBe(totalScopes);
    // The starter ships 3 tools (health-check, search-kb, get-product-info).
    // Keep a floor of 1 so we still catch the toolset being wiped entirely,
    // without blocking template consumers who replace the samples.
    expect(totalTools).toBeGreaterThanOrEqual(1);
  });
});
