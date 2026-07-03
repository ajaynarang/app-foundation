import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { ScopeRegistryService } from './scope-registry.service';
import { AiPrismaService } from '../rls/ai-prisma.service';
import { AgentPrincipal } from '@appshore/platform/auth/agent-principal';

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
  _card?: unknown;
}

@Injectable()
export class ToolExecutorService {
  private readonly logger = new Logger(ToolExecutorService.name);

  constructor(
    private readonly registry: ScopeRegistryService,
    private readonly aiPrisma: AiPrismaService,
    private readonly moduleRef: ModuleRef,
    private readonly prisma: PrismaService,
  ) {}

  async execute(toolName: string, args: Record<string, unknown>, principal: AgentPrincipal): Promise<ToolResult> {
    const provider = this.registry.resolveProvider(toolName);
    if (!provider) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
        isError: true,
      };
    }

    const userDbId = this.resolveUserDbId(principal);
    const role = this.resolveRole(principal);

    // Tools expect `_userId` to be the *wire-format* string user id (what
    // `User.userId` column stores — e.g. "user_demo_owner"), because they
    // write it into VARCHAR audit columns (Alert.acknowledgedBy,
    // Invoice.voidedBy, etc.) or use it to look up by `firebaseUid`.
    // Inject the string form here; RLS session uses the numeric DB id
    // (that's the numeric id `executeWithRlsContext` binds to app.current_user_id).
    const userIdString = await this.resolveUserIdString(principal, userDbId);

    const injectedArgs = {
      ...args,
      _tenantId: principal.tenantId,
      _userId: userIdString,
      _userDbId: userDbId,
    };

    try {
      const raw = await this.aiPrisma.executeWithRlsContext(principal.tenantId, userDbId, role, async () => {
        const instance = this.moduleRef.get(provider.providerClass as any, {
          strict: false,
        });
        return instance[provider.methodName](injectedArgs);
      });

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
    } catch (error: any) {
      this.logger.error(`Tool "${toolName}" failed: ${error.message}`);
      return {
        content: [{ type: 'text', text: `Error executing tool: ${error.message}` }],
        isError: true,
      };
    }
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
   * Resolve the wire-format `User.userId` string for a principal, which is
   * what tools expect in `_userId`. User principals already carry
   * enough for a single cheap lookup via DB id. Non-user principals
   * (oauth_client / api_key / desk) attribute to a human user id via the
   * `onBehalfOfUserId` / `userId` / `enabledByUserId` field — we resolve
   * through the same `User.id → User.userId` lookup.
   *
   * Cached within one request by Prisma's query engine; could add a
   * per-request memo if this becomes hot.
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

  private resolveRole(p: AgentPrincipal): string {
    return p.kind === 'user' ? p.role : 'AGENT';
  }
}
