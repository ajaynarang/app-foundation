import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole, type HitlChallenge } from '@appshore/db';
import type { EventActor } from '@appshore/kernel/infrastructure/events/domain-event';
import { invalidState, stale } from '@appshore/kernel/shared/errors/api-errors';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { OutboxService } from '@appshore/platform/infrastructure/events/outbox.service';
import {
  AgentActionDecisionSchema,
  AgentActionStatusSchema,
  type AgentAction,
  type AgentActionDecision,
  type AgentActionStatus,
  type AgentPolicy,
} from '@app/shared-types';
import { DOMAIN_EVENTS } from '../../../platform-glue/events/domain-events.constants';
import { HitlChallengeService, parseHitlTokenOrNull } from './hitl-challenge.service';

/** The person looking at a request, resolved at the controller edge from the session. */
export interface AgentActionViewer {
  userDbId: number;
  tenantId: number;
  /** The viewer's role in this workspace. */
  role: string;
}

const STATUS = AgentActionStatusSchema.enum;

/** After a person approves, the agent has at least this long to retry. */
export const APPROVED_RETRY_SECONDS = 15 * 60;

/** Besides the person the agent acts for, these workspace roles may see a request and deny it (or approve it). */
const DECIDER_ROLES: readonly string[] = [UserRole.OWNER, UserRole.ADMIN];

const NOT_PENDING: Record<Exclude<AgentActionStatus, 'PENDING'>, string> = {
  APPROVED: 'This request was already approved',
  DENIED: 'This request was already denied',
  EXPIRED: 'This request expired. Ask the agent to try again',
  USED: 'The agent already ran this request',
};

const NOT_VISIBLE = 'This request was not found';

/**
 * In-app approval of an external agent's write. An OAuth client or API key calling a write tool gets a token and a
 * link to `/agent-actions/:token/approve`:
 *
 * - a standard write (`approvalRequired`): the person it acts for, or a workspace owner or admin, approves or denies
 *   it here; the agent's retry with the token then runs exactly the approved arguments once
 *   (`HitlChallengeService.consume`);
 * - a sensitive write (`stepUpRequired`): only the person it acts for can unlock it, with their PIN, at
 *   `POST /mcp/hitl/:token/step-up`. Approve refuses it. Deny works the same as for a standard write.
 *
 * Each decision commits with its event (`AGENT_ACTION_APPROVED`, `AGENT_ACTION_DENIED`).
 */
@Injectable()
export class AgentActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly challenges: HitlChallengeService,
  ) {}

  /** A request waiting for (or past) a person. 404 when unknown or in another workspace; 403 for anyone else. */
  async get(token: string, viewer: AgentActionViewer): Promise<AgentAction> {
    const row = await this.findVisible(token, viewer);
    return this.toPublic(row, viewer);
  }

  /** Approve or deny a pending request, once. 409 when it is no longer pending, or when approving needs the PIN. */
  async decide(token: string, viewer: AgentActionViewer, decision: AgentActionDecision): Promise<AgentAction> {
    const row = await this.findVisible(token, viewer);
    const status = statusOf(row);
    if (status !== STATUS.PENDING) throw invalidState(NOT_PENDING[status]);

    const approve = decision === AgentActionDecisionSchema.enum.APPROVE;
    // The Approve button never unlocks a sensitive write: only the PIN of the person the agent acts for does.
    if (approve && !row.approvalRequired) {
      throw invalidState('This request is approved with the PIN of the person the agent acts for, not with Approve');
    }

    const event = approve ? DOMAIN_EVENTS.AGENT_ACTION_APPROVED : DOMAIN_EVENTS.AGENT_ACTION_DENIED;
    const caller = await this.challenges.callerOf(row);
    const now = new Date();

    await this.outbox.transaction(async (tx, emit) => {
      // Conditional on still pending, so two people deciding at once cannot both win, and a PIN entered at the same
      // moment as a Deny cannot both land.
      const { count } = await tx.hitlChallenge.updateMany({
        where: {
          id: row.id,
          tenantId: viewer.tenantId,
          conversationId: null,
          approvedAt: null,
          deniedAt: null,
          stepUpCompleted: false,
          consumedAt: null,
          expiresAt: { gt: now },
        },
        data: approve
          ? {
              approvedAt: now,
              decidedById: viewer.userDbId,
              // An approval near the end of the window still leaves the agent time to retry.
              expiresAt: new Date(Math.max(row.expiresAt.getTime(), now.getTime() + APPROVED_RETRY_SECONDS * 1000)),
            }
          : // A denied request can never run, so the approver's copy of its arguments is not kept.
            { deniedAt: now, decidedById: viewer.userDbId, argsPreview: Prisma.DbNull },
      });
      if (count === 0) throw stale('This request was just decided or has expired. Refresh');
      await emit(
        event,
        String(viewer.tenantId),
        { token: String(row.id), tool: row.toolName, caller: caller.label },
        userActor(viewer.userDbId),
      );
    });

    return this.get(token, viewer);
  }

  async getPolicy(tenantId: number): Promise<AgentPolicy> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { agentSelfConfirm: true } });
    if (!tenant) throw new NotFoundException('This workspace was not found');
    return { selfConfirm: tenant.agentSelfConfirm };
  }

  /** The owner lets agents confirm their own standard writes, or puts human approval back. Next agent call on. */
  async setPolicy(tenantId: number, selfConfirm: boolean, actor: EventActor): Promise<AgentPolicy> {
    const updated = await this.outbox.transaction(async (tx, emit) => {
      const tenant = await tx.tenant.update({
        where: { id: tenantId },
        data: { agentSelfConfirm: selfConfirm },
        select: { agentSelfConfirm: true },
      });
      await emit(DOMAIN_EVENTS.WORKSPACE_AGENT_POLICY_CHANGED, String(tenantId), { selfConfirm }, actor);
      return tenant;
    });
    return { selfConfirm: updated.agentSelfConfirm };
  }

  /**
   * The request, if this viewer may see it: this workspace (else 404, so existence never leaks), an external agent's
   * waiting write at all, never a chat grant or a self-confirm token (else 404), and the viewer is the person the
   * agent acts for or an owner or admin of this workspace (else 403).
   */
  private async findVisible(token: string, viewer: AgentActionViewer): Promise<HitlChallenge> {
    const id = parseHitlTokenOrNull(token);
    const row =
      id === null
        ? null
        : await this.prisma.hitlChallenge.findFirst({
            where: {
              id,
              tenantId: viewer.tenantId,
              conversationId: null,
              OR: [{ approvalRequired: true }, { stepUpRequired: true }],
            },
          });
    if (!row) throw new NotFoundException(NOT_VISIBLE);
    if (!mayDecide(row, viewer)) {
      throw new ForbiddenException(
        'Only the person this agent acts for, or a workspace owner or admin, can see this request',
      );
    }
    return row;
  }

  private async toPublic(row: HitlChallenge, viewer: AgentActionViewer): Promise<AgentAction> {
    const ids = [row.stepUpUserId, row.decidedById].filter((v): v is number => typeof v === 'number');
    const [users, me] = await Promise.all([
      ids.length
        ? this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } })
        : Promise.resolve([]),
      this.prisma.user.findUnique({ where: { id: viewer.userDbId }, select: { pinHash: true } }),
    ]);
    const emailOf = (id: number | null) => users.find((u) => u.id === id)?.email ?? null;
    const status = statusOf(row);
    const pending = status === STATUS.PENDING;
    // An approval row shows the exact arguments; a PIN row shows only the redacted copy, never `argsPreview`.
    const args = row.stepUpRequired ? row.argsRedacted : row.argsPreview;
    return {
      token: String(row.id),
      tool: row.toolName,
      tier: row.stepUpRequired ? 'sensitive' : 'standard',
      scopeRequired: row.scopeRequired,
      status,
      stepUpRequired: row.stepUpRequired,
      approvalRequired: row.approvalRequired,
      caller: await this.challenges.callerOf(row),
      onBehalfOf: emailOf(row.stepUpUserId),
      args: (args as Record<string, unknown> | null) ?? {},
      argsRedacted: row.stepUpRequired,
      expiresAt: row.expiresAt.toISOString(),
      decidedAt: (row.approvedAt ?? row.deniedAt)?.toISOString() ?? null,
      decidedBy: emailOf(row.decidedById),
      canDecide: pending && mayDecide(row, viewer),
      canStepUp: pending && row.stepUpRequired && row.stepUpUserId === viewer.userDbId,
      hasPinSet: !!me?.pinHash,
    };
  }
}

/** Derived, never stored: a request is pending until a person decides, the agent spends it, or it expires. */
export function statusOf(
  row: Pick<
    HitlChallenge,
    'approvedAt' | 'deniedAt' | 'consumedAt' | 'expiresAt' | 'stepUpRequired' | 'stepUpCompleted'
  >,
): AgentActionStatus {
  if (row.consumedAt) return STATUS.USED;
  if (row.deniedAt) return STATUS.DENIED;
  // An approval the agent never used lapses with the window: the token can no longer be spent.
  if (row.expiresAt.getTime() <= Date.now()) return STATUS.EXPIRED;
  if (row.approvedAt || (row.stepUpRequired && row.stepUpCompleted)) return STATUS.APPROVED;
  return STATUS.PENDING;
}

/** The person the agent acts for decides; so may a workspace owner or admin. */
function mayDecide(row: Pick<HitlChallenge, 'stepUpUserId'>, viewer: AgentActionViewer): boolean {
  return row.stepUpUserId === viewer.userDbId || DECIDER_ROLES.includes(viewer.role);
}

function userActor(userDbId: number): EventActor {
  return { id: String(userDbId), type: 'user' };
}
