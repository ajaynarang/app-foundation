import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { ScopeRegistryService } from './scope-registry.service';
import { AgentPrincipal } from '@appshore/platform/auth/agent-principal';
import { toolFailure } from '../mcp/tools/tool-error';

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
  _card?: unknown;
}

/** What the pipeline already knows about a call and the tool should receive. */
export interface ToolExecutionContext {
  /** The acting person's role in the principal's workspace (`WorkspaceMember`), or null (Desk, or no membership). */
  role?: string | null;
}

/**
 * Runs one tool for a principal. Called only by `InvocationPipelineService`, which has already checked scope,
 * arguments, role, plan and confirmation; the arguments it passes are the parsed ones, with no `_` key left.
 */
@Injectable()
export class ToolExecutorService {
  private readonly logger = new Logger(ToolExecutorService.name);

  constructor(
    private readonly registry: ScopeRegistryService,
    private readonly moduleRef: ModuleRef,
    private readonly prisma: PrismaService,
  ) {}

  async execute(
    toolName: string,
    args: Record<string, unknown>,
    principal: AgentPrincipal,
    context: ToolExecutionContext = {},
  ): Promise<ToolResult> {
    const provider = this.registry.resolveProvider(toolName);
    if (!provider) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
        isError: true,
      };
    }

    const userDbId = this.resolveUserDbId(principal);

    // Tools expect `_userId` to be the *wire-format* string user id (what the `User.userId` column stores, e.g.
    // "user_demo_owner"); `_userDbId` carries the numeric DB id for foreign keys.
    const userIdString = await this.resolveUserIdString(principal, userDbId);

    // The server's identity params are spread LAST, so a value under the same key in `args` can never win.
    const injectedArgs = {
      ...args,
      _tenantId: principal.tenantId,
      _userId: userIdString,
      _userDbId: userDbId,
      _role: context.role ?? null,
    };

    try {
      const raw = await this.invoke(provider, injectedArgs);

      if (raw && typeof raw === 'object' && Array.isArray(raw.content)) {
        return raw as ToolResult;
      }
      return {
        content: [
          {
            type: 'text',
            text: typeof raw === 'string' ? raw : JSON.stringify(raw),
          },
        ],
      };
    } catch (error: unknown) {
      return {
        content: [{ type: 'text', text: JSON.stringify(toolFailure(error, this.logger, toolName)) }],
        isError: true,
      };
    }
  }

  /**
   * The one place a tool method is called. Tenant isolation is the tool's own `_tenantId` filter;
   * no transaction or role switch is opened around the call. Tenant-context plumbing, when it
   * lands, wraps this call (and only this call).
   */
  private async invoke(
    provider: { providerClass: unknown; methodName: string },
    injectedArgs: Record<string, unknown>,
  ): Promise<any> {
    const instance = this.moduleRef.get(provider.providerClass as any, {
      strict: false,
    });
    return instance[provider.methodName](injectedArgs);
  }

  private resolveUserDbId(p: AgentPrincipal): number {
    switch (p.kind) {
      case 'user':
        return p.userId;
      case 'oauth_client':
        return p.onBehalfOfUserId;
      case 'api_key':
        return p.userId;
      case 'desk_responsibility':
        return p.enabledByUserId;
    }
  }

  /**
   * Resolve the wire-format `User.userId` string for a principal, which is what tools expect in `_userId`. Non-user
   * principals (oauth_client / api_key / desk) attribute to a human through `onBehalfOfUserId` / `userId` /
   * `enabledByUserId`, resolved through the same `User.id → User.userId` lookup.
   */
  private async resolveUserIdString(p: AgentPrincipal, userDbId: number): Promise<string | null> {
    // `desk_responsibility` calls may carry a synthetic enabledByUserId (0)
    // that doesn't resolve to a real user. Don't burn a DB roundtrip.
    if (userDbId <= 0) return null;
    const user = await this.prisma.user.findUnique({
      where: { id: userDbId },
      select: { userId: true },
    });
    return user?.userId ?? null;
  }
}
