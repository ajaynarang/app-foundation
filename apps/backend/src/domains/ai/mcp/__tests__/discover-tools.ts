import 'reflect-metadata';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MCP_TOOL_METADATA_KEY } from '@rekog/mcp-nest';
import type { AgentScope } from '@app/shared-types';
import { getRequiredScope } from '../../agent-contract/requires-scope.decorator';

/**
 * Test-only discovery of every `@Tool` on disk — shared by the MCP guard specs (write parity, arg
 * validation) so none of them depends on a list a human keeps in sync.
 * We require the leaf tool files directly: importing `McpToolsModule` would drag in the whole Nest graph.
 */
export const TOOLS_DIR = join(__dirname, '..', 'tools');

export type ToolProviderClass = new (...args: never[]) => object;

export interface DiscoveredTool {
  toolName: string;
  methodName: string;
  provider: string;
  providerClass: ToolProviderClass;
  scope: AgentScope;
  parameters: unknown;
}

/** Every `*.tool.ts` under `mcp/tools/`, recursively. */
export function toolFiles(dir = TOOLS_DIR): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : toolFiles(full);
    return e.name.endsWith('.tool.ts') ? [full] : [];
  });
}

/** The tool provider classes exported from those files. */
export function toolProviders(): ToolProviderClass[] {
  const classes: ToolProviderClass[] = [];
  for (const file of toolFiles()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- leaf modules, no Nest graph
    const mod = require(file) as Record<string, unknown>;
    for (const exported of Object.values(mod)) {
      if (typeof exported === 'function' && /Tool$/.test(exported.name)) {
        classes.push(exported as ToolProviderClass);
      }
    }
  }
  return classes;
}

/** Walk each provider's prototype, pairing the `@Tool` metadata with its `@RequiresScope`. */
export function discoverTools(): DiscoveredTool[] {
  const found: DiscoveredTool[] = [];
  for (const providerClass of toolProviders()) {
    const prototype = providerClass.prototype as object;
    for (const methodName of Object.getOwnPropertyNames(prototype)) {
      if (methodName === 'constructor') continue;
      const scope = getRequiredScope(prototype, methodName);
      if (!scope) continue;
      // `@Tool()` uses Nest's `SetMetadata`, which writes to the method function itself — not the
      // (prototype, propertyKey) pair that `@RequiresScope` uses via `Reflect.defineMetadata`.
      const handler = (prototype as Record<string, object>)[methodName];
      const toolMeta = Reflect.getMetadata(MCP_TOOL_METADATA_KEY, handler) as
        | { name?: string; parameters?: unknown }
        | undefined;
      if (!toolMeta?.name) {
        throw new Error(
          `${providerClass.name}.${methodName} has @RequiresScope but no resolvable @Tool name — ` +
            `the decorator contract changed and the MCP guard specs can no longer see tool names.`,
        );
      }
      found.push({
        toolName: toolMeta.name,
        methodName,
        provider: providerClass.name,
        providerClass,
        scope,
        parameters: toolMeta.parameters,
      });
    }
  }
  return found;
}
