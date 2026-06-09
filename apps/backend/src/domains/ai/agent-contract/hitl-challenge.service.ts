import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../infrastructure/events/domain-event.service';
import { DOMAIN_EVENTS } from '../../../infrastructure/events/domain-events.constants';
import { AgentPrincipal } from './agent-principal';
import { HitlTier } from './hitl-policy.service';

export interface IssueInput {
  principal: AgentPrincipal;
  toolName: string;
  scopeRequired: string;
  tier: HitlTier;
  argsDigest: string;
}

export interface IssueResult {
  token: string;
  ttlSeconds: number;
  stepUpRequired: boolean;
}

export interface ConsumeInput {
  tenantId: number;
  principalId: string;
  toolName: string;
  argsDigest: string;
}

const TTL_BY_TIER: Record<HitlTier, number> = {
  none: 0,
  standard: 600,
  sensitive: 300,
};

/**
 * HITL tokens are exposed as opaque strings over the wire so existing agent
 * callers don't see a wire-shape change after the Int PK migration. Internally
 * the PK is Int; we stringify on issue and parse on consume. Returns the Int
 * id or null when the token isn't a positive-integer round-trip — call-sites
 * map null to their own error path (404 / "expired" / etc).
 */
export function parseHitlTokenOrNull(token: string): number | null {
  const id = parseInt(token, 10);
  if (!Number.isFinite(id) || id <= 0 || String(id) !== token.trim()) return null;
  return id;
}

@Injectable()
export class HitlChallengeService {
  private readonly logger = new Logger(HitlChallengeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventService,
  ) {}

  async issue(input: IssueInput): Promise<IssueResult> {
    const ttlSeconds = TTL_BY_TIER[input.tier];
    const stepUpRequired = input.tier === 'sensitive';
    const stepUpUserId = this.resolveStepUpUserId(input.principal);

    const row = await this.prisma.hitlChallenge.create({
      data: {
        tenantId: input.principal.tenantId,
        principalKind: input.principal.kind,
        principalId: input.principal.auditId,
        toolName: input.toolName,
        argsDigest: input.argsDigest,
        scopeRequired: input.scopeRequired,
        tier: input.tier,
        stepUpRequired,
        stepUpUserId,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      },
      select: { id: true },
    });

    const token = String(row.id);

    await this.events.emit(DOMAIN_EVENTS.AGENT_HITL_CHALLENGE_ISSUED, String(input.principal.tenantId), {
      token,
      toolName: input.toolName,
      tier: input.tier,
      stepUpRequired,
    });

    return { token, ttlSeconds, stepUpRequired };
  }

  async consume(token: string, input: ConsumeInput) {
    const id = parseHitlTokenOrNull(token);
    if (id === null) return null;
    // tenantId is part of the where-clause for defense-in-depth: the
    // principalId equality check below already binds the row to the caller's
    // audit id, but per the platform tenant-scoping rule the DB query must scope
    // by tenant itself, not derive isolation from a downstream equality check.
    const row = await this.prisma.hitlChallenge.findFirst({
      where: {
        id,
        tenantId: input.tenantId,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!row) return null;
    if (row.principalId !== input.principalId) return null;
    if (row.toolName !== input.toolName) return null;
    if (row.argsDigest !== input.argsDigest) return null;
    if (row.stepUpRequired && !row.stepUpCompleted) return null;

    await this.prisma.hitlChallenge.update({
      where: { id },
      data: { consumedAt: new Date() },
    });

    await this.events.emit(DOMAIN_EVENTS.AGENT_HITL_CHALLENGE_COMPLETED, String(row.tenantId), {
      token,
      toolName: row.toolName,
    });

    return row;
  }

  async markStepUpCompleted(token: string, authenticatedUserId: number): Promise<void> {
    const id = parseHitlTokenOrNull(token);
    if (id === null) return;
    await this.prisma.hitlChallenge.update({
      where: {
        id,
        stepUpUserId: authenticatedUserId,
        stepUpCompleted: false,
      },
      data: { stepUpCompleted: true },
    });
  }

  private resolveStepUpUserId(p: AgentPrincipal): number | null {
    switch (p.kind) {
      case 'oauth_client':
        return p.onBehalfOfUserId;
      case 'api_key':
        return p.userId;
      case 'user':
        return p.userId;
      case 'desk_responsibility':
        return p.enabledByUserId;
    }
  }
}
