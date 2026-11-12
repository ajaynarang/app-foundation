import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { McpRegistryDiscoveryService } from '@rekog/mcp-nest';
import { scopeTier, SCOPE_TIERS, type AgentScope, type FeatureKey } from '@app/shared-types';
import type { UserRole } from '@appshore/db';
import { getRequiredScope } from './requires-scope.decorator';
import { getToolPlanFeature, getToolRoleRestriction } from './tool-policy.decorator';
import { toolInputSchema } from './tool-input-schema';
import { PERMANENTLY_EXCLUDED_TOOL_NAMES, SCOPE_IMPLICATIONS } from './scope-registry.constants';

type ToolRecord = {
  scope: AgentScope;
  providerClass: { new (...args: unknown[]): unknown; name: string };
  methodName: string;
  description: string;
  parameters: unknown;
  /** `@RestrictToRoles`: the workspace roles allowed to run it; undefined = any role the scope admits. */
  roles?: readonly UserRole[];
  /** `@RequiresPlanFeature`: the plan feature the workspace must have. */
  planFeature?: FeatureKey;
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
          roles: getToolRoleRestriction(providerClass.prototype as object, methodName),
          planFeature: getToolPlanFeature(providerClass.prototype as object, methodName),
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

  /** The tool's zod parameters, which the pipeline parses a caller's arguments against. */
  parametersForTool(toolName: string): unknown {
    return this.toolByName.get(toolName)?.parameters;
  }

  /** The workspace roles a tool is restricted to (`@RestrictToRoles`), or undefined when it has no restriction. */
  roleRestrictionForTool(toolName: string): readonly UserRole[] | undefined {
    return this.toolByName.get(toolName)?.roles;
  }

  /** The plan feature a tool requires (`@RequiresPlanFeature`), or undefined. */
  planFeatureForTool(toolName: string): FeatureKey | undefined {
    return this.toolByName.get(toolName)?.planFeature;
  }

  /**
   * A write is any tool whose `@RequiresScope` is not read tier. The one rule for "is this a write": the pipeline's
   * confirmation, the chat's confirm-action offer and the MCP annotations all follow it. There is no hand-kept list.
   */
  isWriteTool(toolName: string): boolean {
    const scope = this.scopeForTool(toolName);
    return scope !== undefined && scopeTier(scope) !== SCOPE_TIERS.READ;
  }

  resolveProvider(toolName: string): { providerClass: ToolRecord['providerClass']; methodName: string } | undefined {
    const rec = this.toolByName.get(toolName);
    return rec ? { providerClass: rec.providerClass, methodName: rec.methodName } : undefined;
  }

  /**
   * Walk the registered tool map and project each entry to an MCP-shaped descriptor (name, description, JSON-Schema
   * inputSchema from `toolInputSchema`: server-injected params stripped, the replay token documented).
   */
  getAllTools(): RegisteredToolDescriptor[] {
    const out: RegisteredToolDescriptor[] = [];
    for (const [name, rec] of this.toolByName) {
      out.push({
        name,
        description: rec.description,
        inputSchema: toolInputSchema(rec.parameters),
        scope: rec.scope,
      });
    }
    return out;
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
