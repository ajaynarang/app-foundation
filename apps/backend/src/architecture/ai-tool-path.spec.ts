import * as fs from 'fs';
import * as path from 'path';
import { listSourceFiles, stripComments } from './source-text.scan';

/**
 * No path around the tool pipeline. Every tool call, from chat, the external MCP server or a background duty, runs
 * through `InvocationPipelineService.run`, and only the pipeline hands a call to `ToolExecutorService`, the one place
 * that calls a tool method. So, as text rules (comments ignored, specs not scanned):
 *
 * 1. `ToolExecutorService` is named only by itself, the module that provides it, and the pipeline.
 * 2. A tool class (`domains/ai/mcp/tools/*.tool.ts`) is imported only by `mcp-tools.module.ts`, which registers it.
 *    Anything else that imports one could call its method with no scope, role, plan or confirmation check.
 */

const SRC = path.resolve(__dirname, '..');
const rel = (file: string) => path.relative(SRC, file);

const EXECUTOR_USERS = [
  'domains/ai/agent-contract/tool-executor.service.ts',
  'domains/ai/agent-contract/agent-contract.module.ts',
  'domains/ai/agent-contract/invocation-pipeline.service.ts',
];
const TOOL_REGISTRAR = 'domains/ai/mcp/mcp-tools.module.ts';
const TOOLS_DIR = 'domains/ai/mcp/tools';

export function namesExecutor(raw: string): boolean {
  return /\bToolExecutorService\b/.test(stripComments(raw));
}

/** The `*.tool` modules under the tools folder that `raw` (the file at `fromRel`) imports. */
export function importedToolModules(raw: string, fromRel: string): string[] {
  const out: string[] = [];
  for (const match of stripComments(raw).matchAll(/\bfrom\s*['"]([^'"]+\.tool)['"]/g)) {
    const target = path.normalize(path.join(path.dirname(fromRel), match[1]));
    if (path.dirname(target) === TOOLS_DIR) out.push(target);
  }
  return out;
}

describe('no path around the tool pipeline', () => {
  describe('the detectors', () => {
    it('sees the executor named in code, not in a comment', () => {
      expect(namesExecutor(`constructor(private readonly executor: ToolExecutorService) {}`)).toBe(true);
      expect(namesExecutor(`// only the pipeline calls ToolExecutorService`)).toBe(false);
    });

    it('resolves a tool import against the tools folder, and ignores a .tool module elsewhere', () => {
      expect(
        importedToolModules(
          `import { SupportTicketTool } from '../mcp/tools/support-ticket.tool';`,
          'domains/ai/x/a.ts',
        ),
      ).toEqual(['domains/ai/mcp/tools/support-ticket.tool']);
      expect(
        importedToolModules(
          `import { x } from '../assistant/mastra/tools/confirm-action.tool';`,
          'domains/ai/mcp/a.ts',
        ),
      ).toEqual([]);
    });
  });

  const files = listSourceFiles(SRC).map((file) => ({ file: rel(file), text: fs.readFileSync(file, 'utf8') }));

  it('scans real files (a scan that sees nothing would pass by vacuity)', () => {
    expect(files.filter((f) => namesExecutor(f.text)).length).toBeGreaterThan(0);
    expect(files.filter((f) => importedToolModules(f.text, f.file).length > 0).length).toBeGreaterThan(0);
  });

  it('only the pipeline and its module name ToolExecutorService', () => {
    expect(files.filter((f) => namesExecutor(f.text) && !EXECUTOR_USERS.includes(f.file)).map((f) => f.file)).toEqual(
      [],
    );
  });

  it('only mcp-tools.module.ts imports a tool class', () => {
    const offenders = files
      .filter((f) => f.file !== TOOL_REGISTRAR && !f.file.startsWith(`${TOOLS_DIR}/`))
      .filter((f) => importedToolModules(f.text, f.file).length > 0)
      .map((f) => f.file);
    expect(offenders).toEqual([]);
  });
});
