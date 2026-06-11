import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { McpRegistryDiscoveryService } from '@rekog/mcp-nest';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { AgentScope } from '@app/shared-types';
import { getRequiredScope } from './requires-scope.decorator';
import { PERMANENTLY_EXCLUDED_TOOL_NAMES, SCOPE_IMPLICATIONS } from './scope-registry.constants';

type ToolRecord = {
  scope: AgentScope;
  providerClass: { new (...args: unknown[]): unknown; name: string };
  methodName: string;
  description: string;
  parameters: unknown;
};

export interface RegisteredToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /**
   * The scope this tool requires. Exposed so MCP-shape callers can derive
   * client-facing annotations (read-only / destructive hints) without doing
   * a second registry lookup per tool.
   */
  scope: AgentScope;
}

@Injectable()
export class ScopeRegistryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ScopeRegistryService.name);
  private readonly toolByName = new Map<string, ToolRecord>();
  private readonly namesByScope = new Map<AgentScope, Set<string>>();

  constructor(private readonly mcpRegistry: McpRegistryDiscoveryService) {}

  /**
   * Use `onApplicationBootstrap` rather than `onModuleInit` so every MCP
   * tool module has finished its own `onModuleInit` (and registered its
   * `@Tool` methods into `McpRegistryService`) before we walk the registry.
   *
   * `onModuleInit` was racing `@rekog/mcp-nest`'s internal registration and
   * leaving the registry empty on cold boot — every subsequent MCP call then
   * returned `unknown_tool` from `InvocationPipelineService.scopeForTool`.
   * Nest guarantees `onApplicationBootstrap` fires only after the full module
   * graph's `onModuleInit` sequence has resolved, so the race goes away.
   */
  async onApplicationBootstrap(): Promise<void> {
    await this.discoverTools();
  }

  /**
   * Exposed for tests that want to invoke discovery directly without a full
   * application-bootstrap cycle. Production code must not call this.
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- keeps the Promise return shape stable for future async work
  async discoverTools(): Promise<void> {
    const moduleIds = this.mcpRegistry.getMcpModuleIds();
    if (moduleIds.length === 0) {
      this.logger.warn('No MCP modules registered; scope registry is empty');
      return;
    }

    for (const moduleId of moduleIds) {
      for (const tool of this.mcpRegistry.getTools(moduleId)) {
        const name = tool.metadata.name;
        if (PERMANENTLY_EXCLUDED_TOOL_NAMES.includes(name)) {
          throw new Error(`Tool "${name}" is permanently excluded from agent exposure; remove its @Tool registration`);
        }

        const providerClass = tool.providerClass as ToolRecord['providerClass'];
        const methodName = tool.methodName;
        const scope = getRequiredScope(providerClass.prototype, methodName);
        if (!scope) {
          throw new Error(`Tool "${name}" (${providerClass.name}.${methodName}) is missing @RequiresScope`);
        }

        // Duplicate tool-name collisions silently clobber the registry's
        // scope-to-tool mapping, routing a tool through the wrong scope. Fail
        // loud at boot so any two @Tool definitions with the same `name` are
        // caught before the service starts serving requests.
        const existing = this.toolByName.get(name);
        if (existing) {
          throw new Error(
            `Duplicate @Tool name "${name}": registered by both ` +
              `${existing.providerClass.name}.${existing.methodName} and ` +
              `${providerClass.name}.${methodName}. Rename one.`,
          );
        }

        this.toolByName.set(name, {
          scope,
          providerClass,
          methodName,
          description: tool.metadata.description ?? '',
          parameters: tool.metadata.parameters,
        });
        const set = this.namesByScope.get(scope) ?? new Set<string>();
        set.add(name);
        this.namesByScope.set(scope, set);
      }
    }

    this.logger.log(
      `Scope registry initialized: ${this.toolByName.size} tools across ${this.namesByScope.size} scopes`,
    );
  }

  scopeForTool(toolName: string): AgentScope | undefined {
    return this.toolByName.get(toolName)?.scope;
  }

  toolsForScope(scope: AgentScope): string[] {
    return Array.from(this.namesByScope.get(scope) ?? []);
  }

  toolsAllowedByScopes(granted: readonly AgentScope[]): Set<string> {
    const expanded = this.expandGrantedScopes(granted);
    const allowed = new Set<string>();
    for (const s of expanded) {
      for (const name of this.namesByScope.get(s) ?? []) {
        allowed.add(name);
      }
    }
    return allowed;
  }

  resolveProvider(toolName: string): { providerClass: ToolRecord['providerClass']; methodName: string } | undefined {
    const rec = this.toolByName.get(toolName);
    return rec ? { providerClass: rec.providerClass, methodName: rec.methodName } : undefined;
  }

  /**
   * Walk the registered tool map and project each entry to an MCP-shaped
   * descriptor (name, description, JSON-Schema inputSchema). Internal params
   * (`_tenantId`, `_userId`) are stripped so external agents never see them.
   */
  getAllTools(): RegisteredToolDescriptor[] {
    const out: RegisteredToolDescriptor[] = [];
    for (const [name, rec] of this.toolByName) {
      out.push({
        name,
        description: rec.description,
        inputSchema: this.toInputSchema(rec.parameters),
        scope: rec.scope,
      });
    }
    return out;
  }

  private toInputSchema(parameters: unknown): Record<string, unknown> {
    let schema: Record<string, unknown> = { type: 'object', properties: {} };
    if (parameters && typeof parameters === 'object' && 'shape' in (parameters as Record<string, unknown>)) {
      schema = zodToJsonSchema(parameters as never);
    }
    if (schema.properties && typeof schema.properties === 'object') {
      const props = schema.properties as Record<string, unknown>;
      // Strip server-injected identity params — agents must never see them.
      delete props._tenantId;
      delete props._userId;
      if (Array.isArray(schema.required)) {
        schema.required = (schema.required as string[]).filter((r) => r !== '_tenantId' && r !== '_userId');
      }
      // Surface the HITL replay token. The pipeline uses it on every
      // non-read tool; advertising it here lets external agents (Claude,
      // ChatGPT) complete the two-step confirm flow on their own without
      // hand-coded knowledge of the protocol.
      props._confirmToken = {
        type: 'string',
        description:
          'OPTIONAL. If the previous call to this tool returned `{"status":"hitl_required","token":"…"}`, replay the call with `_confirmToken` set to that token value to actually execute. Tokens are single-use, expire in minutes, and are scoped to this exact tool + arguments. For sensitive-tier tools the response will also carry `stepUpRequired:true` and an `approvalUrl` — direct the user to that URL to enter their PIN, then replay with the same token.',
      };
    }
    return schema;
  }

  private expandGrantedScopes(granted: readonly AgentScope[]): Set<AgentScope> {
    const out = new Set<AgentScope>(granted);
    let changed = true;
    while (changed) {
      changed = false;
      for (const [parent, implied] of SCOPE_IMPLICATIONS) {
        if (out.has(parent) && !out.has(implied)) {
          out.add(implied);
          changed = true;
        }
      }
    }
    return out;
  }
}
