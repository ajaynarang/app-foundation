import { Injectable, Logger } from '@nestjs/common';
import { NEVER_EXTERNAL_SCOPES } from '@app/shared-types';
import { ScopeRegistryService } from './scope-registry.service';
import { HitlPolicyService } from './hitl-policy.service';
import { ToolExecutorService, ToolResult } from './tool-executor.service';
import { AgentInvocationLoggerService } from './agent-invocation-logger.service';
import { AgentPrincipal } from '@appshore/platform/auth/agent-principal';
import { intentDigest } from './intent-digest';
import { HitlChallengeService } from './hitl-challenge.service';
import { ToolAccessPolicyService } from './tool-access-policy.service';
import { validateToolArgs } from './tool-args';
import { scopesForRole } from './role-scopes';
import { CONFIRM_TOKEN_PARAM } from './tool-input-schema';
import { toolFailure } from '../mcp/tools/tool-error';

/**
 * The one way a tool runs, for every caller: the chat assistant (`McpToolService`), the external MCP server
 * (OAuth clients and API keys) and Desk (`execute.step.ts`). In this order:
 *
 * 1. The tool exists; its scope is not never-external for this principal; the principal holds the scope.
 * 2. The arguments parse against the tool's own zod schema; every `_`-prefixed key the caller sent is dropped.
 * 3. Role: the acting person must be a member of this workspace (Desk exempt); `@RestrictToRoles` against their
 *    current role; a chat principal's scopes are capped at that role's scopes.
 * 4. Plan: `@RequiresPlanFeature` judged by the same rule as the REST guard.
 * 5. Confirmation for any tier above read (third-party agents answer a challenge; Desk is gated inside Desk).
 * 6. Audit row, execute, audit result.
 * 7. Errors: an `HttpException` passes its message and code; anything else is logged and answered generically.
 *
 * Role and plan run before confirmation, so nobody confirms something they cannot do. Their refusals are plain
 * results the model relays, not errors to retry.
 */
@Injectable()
export class InvocationPipelineService {
  private readonly logger = new Logger(InvocationPipelineService.name);

  constructor(
    private readonly registry: ScopeRegistryService,
    private readonly hitl: HitlPolicyService,
    private readonly executor: ToolExecutorService,
    private readonly auditLogger: AgentInvocationLoggerService,
    private readonly challenges: HitlChallengeService,
    private readonly policy: ToolAccessPolicyService,
  ) {}

  async run(principal: AgentPrincipal, toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    // ── 1. Tool and scope ───────────────────────────────────────────────────
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
      return this.scopeDenied(scope, principal.scopes);
    }

    const allowed = this.registry.toolsAllowedByScopes(principal.scopes);
    if (!allowed.has(toolName)) {
      this.logger.warn(`scope_denied: ${principal.auditId} lacks ${scope} for ${toolName}`);
      return this.scopeDenied(scope, principal.scopes);
    }

    // ── 2. Arguments ────────────────────────────────────────────────────────
    // The replay token is the one `_` key a caller may send; it is read here and never reaches the tool.
    const sentToken = (args ?? {})[CONFIRM_TOKEN_PARAM];
    const validated = validateToolArgs(this.registry.parametersForTool(toolName), args);
    if ('failure' in validated) {
      return { content: [{ type: 'text', text: JSON.stringify(validated.failure) }], isError: true };
    }
    const toolArgs = validated.data;

    // ── 3. Role, 4. Plan ────────────────────────────────────────────────────
    const role = await this.policy.actingRole(principal);
    const roleDenial = this.policy.checkRole(principal, toolName, role);
    if (roleDenial) return roleDenial;
    // A chat principal's scopes come from the conversation's persona, which the client picked when it opened the
    // conversation (and which outlives a demotion). Cap them at the scopes of the person's CURRENT role here, so a
    // MEMBER in an "owner" or "super_admin" conversation is judged as a MEMBER. `role` is non-null past checkRole.
    if (principal.kind === 'user' && role && !scopesForRole(role).includes(scope)) {
      this.logger.warn(`scope_denied (acting role): ${principal.auditId} is ${role}, lacks ${scope} for ${toolName}`);
      return this.scopeDenied(scope, scopesForRole(role));
    }
    const planDenial = await this.policy.checkPlan(principal, toolName, role);
    if (planDenial) return planDenial;

    // ── 5. Confirmation ─────────────────────────────────────────────────────
    const tier = this.hitl.resolveTier(scope, principal);
    // Deny by default: every principal kind except a signed-in user and a Desk duty is challenged. A Desk duty is
    // never challenged here (nobody is present to answer): Desk's own gate step runs before every execute. A
    // signed-in user's chat write is confirmed through `confirm-action`.
    const challenged = tier !== 'none' && principal.kind !== 'user' && principal.kind !== 'desk_responsibility';
    const confirmToken = challenged && typeof sentToken === 'string' ? sentToken : undefined;

    if (challenged) {
      // The digest binds the token to this exact call: parsed through the tool's schema, keys sorted at every
      // depth, unredacted. A change inside a nested object or a redacted field is a different call.
      const argsDigest = intentDigest(this.registry.parametersForTool(toolName), args);

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
    }

    // ── 6. Audit, execute, audit ────────────────────────────────────────────
    const startedAt = Date.now();
    const rowId = await this.auditLogger.writePending({
      principal,
      toolName,
      scopeRequired: scope,
      hitlTier: tier,
      args: toolArgs,
      confirmationTokenId: confirmToken ?? null,
    });

    try {
      const result = await this.executor.execute(toolName, toolArgs, principal, { role });
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
    } catch (error: unknown) {
      // ── 7. Errors ─────────────────────────────────────────────────────────
      const durationMs = Date.now() - startedAt;
      const failure = toolFailure(error, this.logger, toolName);
      await this.auditLogger.completeError({
        rowId,
        tenantId: principal.tenantId,
        durationMs,
        error: error instanceof Error ? error.message : (JSON.stringify(error) ?? 'unknown error'),
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(failure) }],
        isError: true,
      };
    }
  }

  private scopeDenied(required: string, granted: readonly string[]): ToolResult {
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
