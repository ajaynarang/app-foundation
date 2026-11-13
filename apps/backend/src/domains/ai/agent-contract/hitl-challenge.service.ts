import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type HitlChallenge } from '@appshore/db';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { OutboxService } from '@appshore/platform/infrastructure/events/outbox.service';
import { DOMAIN_EVENTS } from '../../../platform-glue/events/domain-events.constants';
import { AgentPrincipal } from '@appshore/platform/auth/agent-principal';
import { HitlTier } from './hitl-policy.service';

export interface IssueInput {
  principal: AgentPrincipal;
  toolName: string;
  scopeRequired: string;
  tier: HitlTier;
  argsDigest: string;
  /** A standard write that waits for a person to approve or deny it in the app (the default for external agents). */
  approvalRequired?: boolean;
  /**
   * What an approver is shown: the exact arguments, internal keys stripped. Stored only when approval is required. It
   * may hold personal data: never log it.
   */
  argsPreview?: Record<string, unknown>;
  /** What the person entering their PIN is shown on a sensitive write: the redacted arguments. */
  argsRedacted?: Record<string, unknown>;
}

export interface IssueResult {
  token: string;
  ttlSeconds: number;
  stepUpRequired: boolean;
  approvalRequired: boolean;
}

/**
 * Why a confirm token cannot be spent (yet), without spending it. `pending`: a person has not approved it, or has not
 * entered their PIN, yet (the agent waits and retries). `denied`: a person turned it down (the agent starts over).
 * `invalid`: unknown, expired, used, or for another caller, tool or argument set.
 */
export type ConsumeRefusal = 'pending' | 'denied' | 'invalid';
export type ConsumeResult = { ok: true; row: HitlChallenge } | { ok: false; reason: ConsumeRefusal };

const INVALID: ConsumeResult = { ok: false, reason: 'invalid' };

/** A request that waits for a person is open this long: enough to see the link, open the app and decide. */
export const APPROVAL_TTL_SECONDS = 3600;

export interface ConsumeInput {
  tenantId: number;
  principalId: string;
  toolName: string;
  argsDigest: string;
}

/** Identifies one person's chat in one workspace. */
export interface ChatConversationKey {
  tenantId: number;
  /** Numeric `User.id` of the person chatting. */
  userId: number;
  conversationId: string;
}

/** Identifies one confirm card: the suspended `confirm-action` call. */
export interface ChatCardKey extends ChatConversationKey {
  toolCallId: string;
}

/** The exact write a card proposes, or a pipeline call is about to run. */
export interface ChatWriteKey extends ChatConversationKey {
  toolName: string;
  /** `intentDigest` of the write's arguments (the same function the challenge path uses). */
  argsDigest: string;
}

/** Long enough to read the card and press Confirm, and for the resumed turn to reach the write. */
export const CHAT_INTENT_TTL_SECONDS = 600;

const chatPrincipalId = (userId: number) => `user:${userId}`;

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
    // Each challenge write and its event commit together (ADR "Outbox and deadlines").
    private readonly outbox: OutboxService,
  ) {}

  async issue(input: IssueInput): Promise<IssueResult> {
    const stepUpRequired = input.tier === 'sensitive';
    // A sensitive write is approved by the PIN step, never by the Approve button: it is not an approval row.
    const approvalRequired = input.approvalRequired === true && !stepUpRequired;
    const ttlSeconds = approvalRequired ? APPROVAL_TTL_SECONDS : TTL_BY_TIER[input.tier];
    const stepUpUserId = this.resolveStepUpUserId(input.principal);

    const token = await this.outbox.transaction(async (tx, emit) => {
      const row = await tx.hitlChallenge.create({
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
          approvalRequired,
          ...(approvalRequired && input.argsPreview
            ? { argsPreview: input.argsPreview as Prisma.InputJsonObject }
            : {}),
          ...(stepUpRequired && input.argsRedacted
            ? { argsRedacted: input.argsRedacted as Prisma.InputJsonObject }
            : {}),
          expiresAt: new Date(Date.now() + ttlSeconds * 1000),
        },
        select: { id: true },
      });
      const issued = String(row.id);
      await emit(DOMAIN_EVENTS.AGENT_HITL_CHALLENGE_ISSUED, String(input.principal.tenantId), {
        token: issued,
        toolName: input.toolName,
        tier: input.tier,
        stepUpRequired,
      });
      return issued;
    });

    return { token, ttlSeconds, stepUpRequired, approvalRequired };
  }

  /** Whether the workspace owner let external agents confirm their own standard writes (default false). */
  async tenantAllowsSelfConfirm(tenantId: number): Promise<boolean> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { agentSelfConfirm: true } });
    return tenant?.agentSelfConfirm === true;
  }

  /**
   * Spend a confirm token on exactly the call it was issued for, once. Refuses, without spending it, a token that is
   * unknown, expired, used or for another caller, tool or argument set (`invalid`), one a person denied (`denied`),
   * and one still waiting for its person's approval or PIN (`pending`).
   */
  async consume(token: string, input: ConsumeInput): Promise<ConsumeResult> {
    const id = parseHitlTokenOrNull(token);
    if (id === null) return INVALID;
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
        // A chat grant is spent only through consumeChatGrant, never as a challenge token.
        conversationId: null,
      },
    });
    if (!row) return INVALID;
    if (row.principalId !== input.principalId) return INVALID;
    if (row.toolName !== input.toolName) return INVALID;
    if (row.argsDigest !== input.argsDigest) return INVALID;
    if (row.deniedAt) return { ok: false, reason: 'denied' };
    if (row.stepUpRequired && !row.stepUpCompleted) return { ok: false, reason: 'pending' };
    if (row.approvalRequired && !row.approvedAt) return { ok: false, reason: 'pending' };

    // Spend it with a conditional update (`consumed_at IS NULL`), so two racing retries of one token cannot both
    // pass the read above and both run the write: the second update matches no row and is refused.
    const spent = await this.outbox.transaction(async (tx, emit) => {
      const { count } = await tx.hitlChallenge.updateMany({
        where: { id, consumedAt: null, deniedAt: null },
        // The approver's copy of the arguments is not kept once the request is spent.
        data: { consumedAt: new Date(), argsPreview: Prisma.DbNull },
      });
      if (count === 0) return false;
      await emit(DOMAIN_EVENTS.AGENT_HITL_CHALLENGE_COMPLETED, String(row.tenantId), {
        token,
        toolName: row.toolName,
      });
      return true;
    });
    if (!spent) return INVALID;

    return { ok: true, row };
  }

  /**
   * Mark a challenge's PIN step-up done, for the person it names. Only an open challenge: never one already used,
   * expired, denied or already stepped up. Returns whether a challenge was marked.
   */
  async markStepUpCompleted(token: string, authenticatedUserId: number): Promise<boolean> {
    const id = parseHitlTokenOrNull(token);
    if (id === null) return false;
    const { count } = await this.prisma.hitlChallenge.updateMany({
      where: {
        id,
        stepUpRequired: true,
        stepUpUserId: authenticatedUserId,
        stepUpCompleted: false,
        consumedAt: null,
        deniedAt: null,
        expiresAt: { gt: new Date() },
        // A chat grant is confirmed by the card's Confirm (confirmChatIntent), never by a PIN step-up.
        conversationId: null,
      },
      data: { stepUpCompleted: true },
    });
    return count === 1;
  }

  /**
   * In-app chat confirmation, bound to the exact write (item 8b).
   *
   * 1. `confirm-action` names a write tool and its exact arguments. `recordChatIntent` stores an unconfirmed row
   *    for that card (`toolCallId`), bound to the conversation, the tool and the intent digest of the arguments.
   * 2. The person presses Confirm: the resume route calls `confirmChatIntent` for that card, which succeeds once.
   * 3. The pipeline, about to run a write for a chat principal, recomputes the digest from the arguments it was
   *    actually given and spends a matching confirmed row (`consumeChatGrant`). A Confirm for one change cannot run
   *    another, and a model that skips the card finds nothing to spend.
   *
   * Cancel voids the card; a new user message voids every open card; the end of a resumed turn voids unspent grants.
   */
  async recordChatIntent(input: ChatCardKey & ChatWriteKey & { scopeRequired: string }): Promise<void> {
    await this.prisma.hitlChallenge.create({
      data: {
        tenantId: input.tenantId,
        principalKind: 'user',
        principalId: chatPrincipalId(input.userId),
        toolName: input.toolName,
        argsDigest: input.argsDigest,
        scopeRequired: input.scopeRequired,
        tier: 'standard',
        stepUpRequired: false,
        conversationId: input.conversationId,
        toolCallId: input.toolCallId,
        expiresAt: new Date(Date.now() + CHAT_INTENT_TTL_SECONDS * 1000),
      },
      select: { id: true },
    });
  }

  /** The person pressed Confirm on this card. True once; false when unknown, expired, declined or already confirmed. */
  async confirmChatIntent(input: ChatCardKey): Promise<boolean> {
    const { count } = await this.prisma.hitlChallenge.updateMany({
      where: {
        tenantId: input.tenantId,
        principalId: chatPrincipalId(input.userId),
        conversationId: input.conversationId,
        toolCallId: input.toolCallId,
        confirmedAt: null,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { confirmedAt: new Date() },
    });
    return count === 1;
  }

  /** The person pressed Cancel on this card: it can no longer be confirmed or spent. */
  async declineChatIntent(input: ChatCardKey): Promise<void> {
    await this.prisma.hitlChallenge.updateMany({
      where: {
        tenantId: input.tenantId,
        principalId: chatPrincipalId(input.userId),
        conversationId: input.conversationId,
        toolCallId: input.toolCallId,
        consumedAt: null,
      },
      data: { consumedAt: new Date() },
    });
  }

  /** Spend a confirmed grant for exactly this write, once. Returns the grant's id, or null. */
  async consumeChatGrant(input: ChatWriteKey): Promise<string | null> {
    const row = await this.prisma.hitlChallenge.findFirst({
      where: {
        tenantId: input.tenantId,
        principalId: chatPrincipalId(input.userId),
        conversationId: input.conversationId,
        toolName: input.toolName,
        argsDigest: input.argsDigest,
        confirmedAt: { not: null },
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { id: 'desc' },
      select: { id: true },
    });
    if (!row) return null;

    // Conditional update (`consumed_at IS NULL`): two tool calls racing on one grant cannot both win.
    const { count } = await this.prisma.hitlChallenge.updateMany({
      where: { id: row.id, tenantId: input.tenantId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    return count === 1 ? String(row.id) : null;
  }

  /**
   * Void this conversation's confirmed but unspent grants (the end of a resumed turn) and, with `includePending`,
   * the cards still waiting for a decision too (a new user message abandons them).
   */
  async revokeChatGrants(input: ChatConversationKey & { includePending?: boolean }): Promise<void> {
    await this.prisma.hitlChallenge.updateMany({
      where: {
        tenantId: input.tenantId,
        principalId: chatPrincipalId(input.userId),
        conversationId: input.conversationId,
        consumedAt: null,
        ...(input.includePending ? {} : { confirmedAt: { not: null } }),
      },
      data: { consumedAt: new Date() },
    });
  }

  /**
   * The agent asking, for the approval page: the API key's or the OAuth client's name, never a secret. A tenant-owned
   * OAuth client is read only from this workspace (or a tenant-less, dynamically registered one).
   */
  async callerOf(challenge: Pick<HitlChallenge, 'principalKind' | 'principalId' | 'tenantId'>): Promise<{
    kind: 'oauth_client' | 'api_key';
    label: string;
  }> {
    if (challenge.principalKind === 'api_key') {
      const apiKeyId = parseHitlTokenOrNull(challenge.principalId.replace(/^apikey:/, ''));
      const apiKey =
        apiKeyId === null
          ? null
          : await this.prisma.apiKey.findUnique({ where: { id: apiKeyId }, select: { name: true } });
      return { kind: 'api_key', label: apiKey?.name ?? 'An API key' };
    }
    const client = await this.prisma.oAuthClient.findFirst({
      where: {
        clientId: challenge.principalId.replace(/^oauth:/, ''),
        OR: [{ tenantId: challenge.tenantId }, { tenantId: null }],
      },
      select: { name: true },
    });
    return { kind: 'oauth_client', label: client?.name ?? 'A connected app' };
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
