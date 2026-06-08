import { Injectable, Logger } from '@nestjs/common';
import { NEVER_EXTERNAL_SCOPES } from '@app/shared-types';
import { ScopeRegistryService } from './scope-registry.service';
import { HitlPolicyService } from './hitl-policy.service';
import { ToolExecutorService, ToolResult } from './tool-executor.service';
import { AgentInvocationLoggerService } from './agent-invocation-logger.service';
import { AgentPrincipal } from './agent-principal';
import { redactArgs, digestArgs } from './arg-redactor';
import { HitlChallengeService } from './hitl-challenge.service';

/**
 * Retained for backwards-compatibility of the external error surface (callers
 * that used to distinguish legacy-path fall-through from genuine pipeline
 * failures). The pipeline is now always on; this is thrown for unrecoverable
 * internal errors only.
 */
export class PipelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PipelineError';
  }
}

@Injectable()
export class InvocationPipelineService {
  private readonly logger = new Logger(InvocationPipelineService.name);

  constructor(
    private readonly registry: ScopeRegistryService,
    private readonly hitl: HitlPolicyService,
    private readonly executor: ToolExecutorService,
    private readonly auditLogger: AgentInvocationLoggerService,
    private readonly challenges: HitlChallengeService,
  ) {}

  async run(principal: AgentPrincipal, toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    const scope = this.registry.scopeForTool(toolName);
    if (!scope) {
      this.logger.warn(`unknown_tool: "${toolName}" requested by ${principal.auditId}`);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: 'unknown_tool', tool: toolName }),
          },
        ],
        isError: true,
      };
    }

    if (principal.kind !== 'user' && (NEVER_EXTERNAL_SCOPES as readonly string[]).includes(scope)) {
      this.logger.warn(`scope_denied (never-external): ${principal.auditId} attempted ${scope} via ${toolName}`);
      return this.scopeDenied(scope, principal.scopes as string[]);
    }

    const allowed = this.registry.toolsAllowedByScopes(principal.scopes);
    if (!allowed.has(toolName)) {
      this.logger.warn(`scope_denied: ${principal.auditId} lacks ${scope} for ${toolName}`);
      return this.scopeDenied(scope, principal.scopes as string[]);
    }

    const tier = this.hitl.resolveTier(scope, principal);

    const confirmToken =
      tier !== 'none' && principal.kind !== 'user' && principal.kind !== 'desk_responsibility'
        ? (args._confirmToken as string | undefined)
        : undefined;

    if (tier !== 'none' && principal.kind !== 'user' && principal.kind !== 'desk_responsibility') {
      const redacted = redactArgs(args) as Record<string, unknown>;
      const argsDigest = digestArgs(redacted);

      if (!confirmToken) {
        const issued = await this.challenges.issue({
          principal,
          toolName,
          scopeRequired: scope,
          tier,
          argsDigest,
        });
        const appUrl = (process.env.APP_URL ?? '').replace(/\/$/, '');
        const approvalUrl =
          issued.stepUpRequired && appUrl ? `${appUrl}/agent-actions/${issued.token}/approve` : undefined;
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                status: 'hitl_required',
                tier,
                token: issued.token,
                ttlSeconds: issued.ttlSeconds,
                stepUpRequired: issued.stepUpRequired,
                tool: toolName,
                ...(approvalUrl && { approvalUrl }),
              }),
            },
          ],
        };
      }

      const consumed = await this.challenges.consume(confirmToken, {
        tenantId: principal.tenantId,
        principalId: principal.auditId,
        toolName,
        argsDigest,
      });
      if (!consumed) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'hitl_invalid_or_expired',
                tool: toolName,
              }),
            },
          ],
          isError: true,
        };
      }
      // Fall through to execute; confirmationTokenId captured below.
    }

    const startedAt = Date.now();
    const rowId = await this.auditLogger.writePending({
      principal,
      toolName,
      scopeRequired: scope,
      hitlTier: tier,
      args,
      confirmationTokenId: confirmToken ?? null,
    });

    try {
      const result = await this.executor.execute(toolName, args, principal);
      const durationMs = Date.now() - startedAt;

      if (result.isError) {
        await this.auditLogger.completeError({
          rowId,
          tenantId: principal.tenantId,
          durationMs,
          error: result.content[0]?.text ?? 'unknown error',
        });
      } else {
        await this.auditLogger.completeSuccess({
          rowId,
          tenantId: principal.tenantId,
          durationMs,
          outputSummary: (result.content[0]?.text ?? '').slice(0, 500),
        });
      }
      return result;
    } catch (error: any) {
      const durationMs = Date.now() - startedAt;
      await this.auditLogger.completeError({
        rowId,
        tenantId: principal.tenantId,
        durationMs,
        error: error.message ?? String(error),
      });
      return {
        content: [{ type: 'text', text: `Error: ${error.message ?? error}` }],
        isError: true,
      };
    }
  }

  private scopeDenied(required: string, granted: string[]): ToolResult {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'scope_denied',
            required_scope: required,
            granted_scopes: granted,
          }),
        },
      ],
      isError: true,
    };
  }
}
