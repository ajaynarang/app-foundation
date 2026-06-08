import { Injectable, Logger } from '@nestjs/common';
import { Prisma, AgentInvocationLog } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../infrastructure/events/domain-event.service';
import { DOMAIN_EVENTS } from '../../../infrastructure/events/sally-events.constants';
import { generateUuidV7 } from '../../../shared/utils/uuidv7';
import { AgentPrincipal, principalAuditLabel } from './agent-principal';
import { HitlTier } from './hitl-policy.service';
import { redactArgs, digestArgs } from './arg-redactor';
import type { AgentScope } from '@app/shared-types';

export interface WritePendingInput {
  principal: AgentPrincipal;
  toolName: string;
  scopeRequired: AgentScope;
  hitlTier: HitlTier;
  args: Record<string, unknown>;
  confirmationTokenId?: string | null;
  langfuseTraceId?: string | null;
  requestId?: string | null;
}

export interface CompleteSuccessInput {
  rowId: string | null;
  tenantId: number;
  durationMs: number;
  outputSummary: string | null;
  piiReadFlag?: boolean;
}

export interface CompleteErrorInput {
  rowId: string | null;
  tenantId: number;
  durationMs: number;
  error: string;
}

@Injectable()
export class AgentInvocationLoggerService {
  private readonly logger = new Logger(AgentInvocationLoggerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventService,
  ) {}

  async writePending(input: WritePendingInput): Promise<string | null> {
    const redacted = redactArgs(input.args) as Record<string, unknown>;
    const digest = digestArgs(redacted);

    const row = await this.prisma.agentInvocationLog.create({
      data: {
        id: generateUuidV7(),
        tenantId: input.principal.tenantId,
        principalKind: input.principal.kind,
        principalId: input.principal.auditId,
        principalLabel: principalAuditLabel(input.principal),
        toolName: input.toolName,
        scopeRequired: input.scopeRequired,
        hitlTier: input.hitlTier,
        argsDigest: digest,
        argsRedacted: redacted as Prisma.InputJsonValue,
        argsRaw: null as Prisma.NullableJsonNullValueInput | null,
        success: false,
        confirmationTokenId: input.confirmationTokenId ?? null,
        langfuseTraceId: input.langfuseTraceId ?? null,
        requestId: input.requestId ?? null,
      },
      select: { id: true },
    });
    return row.id;
  }

  async completeSuccess(input: CompleteSuccessInput): Promise<void> {
    if (!input.rowId) return;
    const row = await this.prisma.agentInvocationLog.update({
      where: { id: input.rowId },
      data: {
        success: true,
        durationMs: input.durationMs,
        outputSummary: input.outputSummary,
        piiReadFlag: input.piiReadFlag ?? false,
      },
    });
    await this.events.emit(DOMAIN_EVENTS.AGENT_INVOCATION_COMPLETED, String(input.tenantId), this.toWebhookPayload(row));
  }

  async completeError(input: CompleteErrorInput): Promise<void> {
    if (!input.rowId) return;
    const row = await this.prisma.agentInvocationLog.update({
      where: { id: input.rowId },
      data: {
        success: false,
        durationMs: input.durationMs,
        error: input.error,
      },
    });
    await this.events.emit(DOMAIN_EVENTS.AGENT_INVOCATION_COMPLETED, String(input.tenantId), this.toWebhookPayload(row));
  }

  /**
   * Project an AgentInvocationLog row to the outbound-webhook payload shape.
   * argsRaw + piiReadFlag intentionally never leave the backend — explicit
   * projection (NOT `...row`) guarantees that a future schema change cannot
   * accidentally leak raw args or internal flags to webhook subscribers.
   */
  private toWebhookPayload(row: AgentInvocationLog): Record<string, unknown> {
    // tenantId intentionally omitted — receivers already know their tenant
    // from the subscription. Don't leak our internal numeric DB id, and
    // don't emit a slug they could misinterpret as routable. Every other
    // field uses wire-format identifiers (CUIDs, our scoped strings).
    return {
      rowId: row.id,
      principalKind: row.principalKind,
      principalId: row.principalId,
      principalLabel: row.principalLabel,
      toolName: row.toolName,
      scopeRequired: row.scopeRequired,
      hitlTier: row.hitlTier,
      argsDigest: row.argsDigest,
      argsRedacted: row.argsRedacted,
      success: row.success,
      durationMs: row.durationMs,
      error: row.error,
      outputSummary: row.outputSummary,
      confirmationTokenId: row.confirmationTokenId,
      langfuseTraceId: row.langfuseTraceId,
      requestId: row.requestId,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
