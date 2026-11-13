import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { ScopeRegistryService } from './scope-registry.service';
import { AgentPrincipal } from '@appshore/platform/auth/agent-principal';
import { toolFailure } from '../mcp/tools/tool-error';
import {
  claimOrSkip,
  type IdempotencyClaim,
  IdempotencyStore,
  requestFingerprint,
  withinStoreTimeout,
} from '@appshore/platform/infrastructure/idempotency/idempotency.store';
import { IDEMPOTENCY_KEY_ARG, declaresIdempotencyKey } from './tool-idempotency';
import {
  RLS_SOURCE,
  RlsContextError,
  isRlsStrict,
  isRlsTenantId,
  runAsPublic,
  runAsTenant,
} from '@appshore/kernel/infrastructure/rls/rls-context';

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
    private readonly idempotency: IdempotencyStore,
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

    // A tool that declares `idempotencyKey` is retry-safe. The key is the executor's, never the tool's: it is taken
    // out here and the tool runs on the rest. A tool that does not declare it gets no replay.
    if (!declaresIdempotencyKey(provider.parameters)) {
      return this.run(toolName, provider, args, principal, userDbId, context);
    }
    const { [IDEMPOTENCY_KEY_ARG]: idempotencyKey, ...toolArgs } = args;
    if (typeof idempotencyKey !== 'string') return this.run(toolName, provider, toolArgs, principal, userDbId, context);

    let claim: IdempotencyClaim | null;
    try {
      // Per workspace AND per the person the call acts for: a replay never answers someone else, and never crosses
      // workspaces. The fingerprint names the tool, so the same key on another tool is a reuse, not a replay.
      // Fail open: a store that fails or does not answer within 2 s runs the call without the key.
      claim = await claimOrSkip(
        this.idempotency,
        `tdb:${principal.tenantId}:u:${userDbId}`,
        idempotencyKey,
        requestFingerprint(`tool:${toolName}`, toolArgs),
        this.logger,
      );
    } catch (error: unknown) {
      // The key was used for a different call, or the first call is still running (409), or it is unusable (400).
      return {
        content: [{ type: 'text', text: JSON.stringify(toolFailure(error, this.logger, toolName)) }],
        isError: true,
      };
    }
    if (claim?.kind === 'replay') return claim.result.body as ToolResult;

    let result: ToolResult;
    try {
      result = await this.run(toolName, provider, toolArgs, principal, userDbId, context);
    } catch (error) {
      // Thrown before the tool answered (the user lookup): free the key so a retry is not IN_USE for 10 minutes.
      if (claim?.kind === 'run') await this.settle(claim, { content: [], isError: true });
      throw error;
    }
    if (claim?.kind === 'run') await this.settle(claim, result);
    return result;
  }

  /**
   * Only a success is remembered: a failed call frees the key. A store error, or a store that does not answer within
   * 2 s, never fails or stalls a call that ran.
   */
  private async settle(claim: Extract<IdempotencyClaim, { kind: 'run' }>, result: ToolResult): Promise<void> {
    try {
      await withinStoreTimeout(result.isError ? claim.release() : claim.complete({ status: 200, body: result }));
    } catch (error) {
      this.logger.warn(`Idempotency: could not settle a tool call: ${(error as Error).message}`);
    }
  }

  private async run(
    toolName: string,
    provider: { providerClass: unknown; methodName: string },
    args: Record<string, unknown>,
    principal: AgentPrincipal,
    userDbId: number,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
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
      // The chat conversation a call belongs to, from the principal: null outside chat, never the caller's copy.
      _conversationId: principal.kind === 'user' ? (principal.conversationId ?? null) : null,
    };

    try {
      const raw = await this.invokeAs(principal, toolName, provider, injectedArgs);

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
      // A scope already pinned to another tenant (or to public) means the caller mixed up identities: the tool never
      // ran. Strict mode (tests, CI) surfaces it; a deployed task answers the generic tool failure and logs it.
      if (error instanceof RlsContextError && isRlsStrict()) throw error;
      return {
        content: [{ type: 'text', text: JSON.stringify(toolFailure(error, this.logger, toolName)) }],
        isError: true,
      };
    }
  }

  /**
   * The tool call, and only it, runs as the principal's tenant (`tool:<name>`), or in the public scope for a principal
   * with no tenant. No transaction is opened: the tool keeps one pooled connection however long it runs. Tenant
   * isolation is still the tool's own `_tenantId` filter until row-level security is enforced.
   */
  private invokeAs(
    principal: AgentPrincipal,
    toolName: string,
    provider: { providerClass: unknown; methodName: string },
    injectedArgs: Record<string, unknown>,
  ): Promise<any> {
    const source = `${RLS_SOURCE.TOOL}:${toolName}`;
    const call = () => this.invoke(provider, injectedArgs);
    return isRlsTenantId(principal.tenantId)
      ? runAsTenant(principal.tenantId, source, call)
      : runAsPublic(source, call);
  }

  /** The one place a tool method is called. */
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
