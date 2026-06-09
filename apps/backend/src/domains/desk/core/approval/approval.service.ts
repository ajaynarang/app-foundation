import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalDecision, DeskEpisodeStatus, DeskEpisodeStepKind, Prisma, UserRole } from '@prisma/client';
import { HANDLED_EPISODE_STATUSES, type ApprovalScope, type HandoffCounts } from '../types';
import { DateTime } from 'luxon';

import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { generateUuidV7 } from '../../../../shared/utils/uuidv7';
import { InngestClientService } from '../inngest/inngest.client';

import { ApprovalEnrichmentService, type EnrichedApprovalPayload } from './approval-enrichment.service';

const SUPERVISOR_DEFAULT_SCOPE_ROLES: readonly UserRole[] = [UserRole.MEMBER];

const EPISODE_STATUS = DeskEpisodeStatus;

/**
 * Desk statuses that contribute to the Handled-tab count badge. "ESCALATED"
 * is deliberately excluded — escalated episodes belong to the Needs You side
 * (they carry a `.escalated` aggregate on the same counts endpoint), and
 * counting them here would inflate the Handled badge whenever there's an open
 * escalation. `FAILED` + `CANCELLED` are included because a dispatcher
 * scanning "how much was resolved today" cares that the episode terminated at
 * all, not just happily.
 *
 * Sourced from the shared `HANDLED_EPISODE_STATUSES` view set so the count
 * badge, the Handled LIST (desk-episode.service.ts), and the frontend agree
 * on one definition of "ended and needs no human." Both the badge and the
 * list now exclude ESCALATED — the escalated-lifecycle fix made them
 * consistent (previously the list added ESCALATED back in, which is the bug
 * that surfaced escalations on both tabs).
 */
const HANDLED_COUNT_STATUSES: readonly DeskEpisodeStatus[] = [...HANDLED_EPISODE_STATUSES] as DeskEpisodeStatus[];

/**
 * Resolve the scope query param to a concrete predicate.
 * - 'mine' + currentUserId → filter by agent supervisor.
 * - 'all' → unrestricted tenant-wide.
 * - undefined → default per role: MEMBER → 'mine', rest → 'all'.
 */
export function resolveApprovalScope(scope: ApprovalScope | undefined, role: UserRole): ApprovalScope {
  if (scope) return scope;
  return SUPERVISOR_DEFAULT_SCOPE_ROLES.includes(role) ? 'mine' : 'all';
}

/**
 * ApprovalService — owner of DeskApproval lifecycle.
 *
 * Responsibilities:
 *   • create(...)  — called by gate.step when a step gates for human input
 *   • claim(...)   — optimistic first-write-wins claim to prevent double-handling
 *   • decide(...)  — record APPROVED/EDITED/REJECTED; publish inngest event
 *                    to wake the waiting workflow
 *   • expire(...)  — nightly cron closes approvals past expiresAt
 *
 * Publishing 'app/desk.approval.decided' is how we wake the workflow —
 * arFollowupFunction (P1.7) awaits this event via step.waitForEvent,
 * matching on data.approvalId.
 */
@Injectable()
export class ApprovalService {
  private static readonly DEFAULT_EXPIRY_DAYS = 7;
  private readonly logger = new Logger(ApprovalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inngest: InngestClientService,
    private readonly enrichment: ApprovalEnrichmentService,
  ) {}

  /**
   * Create an approval row. Called by gate.step when the gate decides a
   * human is required. The episode status transition to 'WAITING_APPROVAL'
   * is the caller's responsibility so it happens in the same transaction
   * as the step row write.
   */
  async create(input: {
    episodeId: string;
    stepId: string;
    proposedAction: Record<string, unknown>;
    expiresInDays?: number;
  }) {
    const expiresAt = new Date(
      Date.now() + (input.expiresInDays ?? ApprovalService.DEFAULT_EXPIRY_DAYS) * 24 * 60 * 60 * 1000,
    );
    return this.prisma.deskApproval.create({
      data: {
        id: generateUuidV7(),
        episodeId: input.episodeId,
        stepId: input.stepId,
        proposedAction: input.proposedAction as Prisma.InputJsonValue,
        expiresAt,
      },
    });
  }

  /**
   * Claim an approval for a dispatcher. First-write-wins via DB update
   * with a where-clause on `claimedByUserId IS NULL`. If another dispatcher
   * claimed first, throws ConflictException.
   */
  async claim(approvalId: string, userId: number) {
    const result = await this.prisma.deskApproval.updateMany({
      where: { id: approvalId, claimedByUserId: null, decision: null },
      data: { claimedByUserId: userId, claimedAt: new Date() },
    });
    if (result.count === 0) {
      const existing = await this.prisma.deskApproval.findUnique({
        where: { id: approvalId },
      });
      if (!existing) throw new NotFoundException('Approval not found');
      if (existing.decision !== null) {
        throw new ConflictException('Approval already decided');
      }
      throw new ConflictException(`Approval already claimed by user ${existing.claimedByUserId}`);
    }
    return this.prisma.deskApproval.findUniqueOrThrow({
      where: { id: approvalId },
    });
  }

  /**
   * Decide an approval. Writes the decision + publishes the inngest event
   * that wakes the workflow. Enforces:
   *   • Approval must not already be decided
   *   • If claimed by a different user, only the claimant can decide
   *   • EDITED requires editedAction
   *   • REJECTED requires rejectionReason
   *   • terminate=true requires REJECTED
   */
  async decide(input: {
    approvalId: string;
    userId: number;
    decision: ApprovalDecision;
    editedAction?: Record<string, unknown>;
    rejectionReason?: string;
    terminate?: boolean;
  }) {
    const approval = await this.prisma.deskApproval.findUnique({
      where: { id: input.approvalId },
      include: { episode: { select: { id: true, temporalWorkflowId: true } } },
    });
    if (!approval) throw new NotFoundException('Approval not found');
    if (approval.decision !== null) {
      throw new ConflictException('Approval already decided');
    }
    if (approval.claimedByUserId !== null && approval.claimedByUserId !== input.userId) {
      throw new ForbiddenException(`Approval is claimed by another user (${approval.claimedByUserId})`);
    }

    // Enforce semantic rules
    if (input.decision === 'EDITED' && !input.editedAction) {
      throw new BadRequestException('editedAction is required when decision=EDITED');
    }
    if (input.decision === 'REJECTED' && !input.rejectionReason) {
      throw new BadRequestException('rejectionReason is required when decision=REJECTED');
    }
    if (input.terminate && input.decision !== 'REJECTED') {
      throw new BadRequestException('terminate=true requires decision=REJECTED');
    }

    const updated = await this.prisma.deskApproval.update({
      where: { id: input.approvalId },
      data: {
        decision: input.decision,
        decidedByUserId: input.userId,
        decidedAt: new Date(),
        editedAction: (input.editedAction ?? null) as Prisma.InputJsonValue | null,
        rejectionReason: input.rejectionReason ?? null,
        terminateEpisode: input.terminate ?? false,
      },
    });

    // Publish the inngest event so the workflow's step.waitForEvent wakes up
    await this.inngest.send('app/desk.approval.decided', {
      approvalId: updated.id,
      episodeId: updated.episodeId,
      decision: updated.decision,
      terminateEpisode: updated.terminateEpisode,
      editedAction: (updated.editedAction as Record<string, unknown> | null) ?? undefined,
      rejectionReason: updated.rejectionReason ?? undefined,
      decidedByUserId: updated.decidedByUserId,
    });

    this.logger.log(
      `approval decided: ${input.approvalId} → ${input.decision}${input.terminate ? ' (terminate)' : ''} by user ${input.userId}`,
    );
    return updated;
  }

  /**
   * Nightly cron — closes approvals past `expiresAt`. Sends a REJECTED +
   * terminate=true event so the workflow closes the episode with
   * outcome=approval_expired.
   */
  async expireOverdue() {
    const overdue = await this.prisma.deskApproval.findMany({
      where: {
        decision: null,
        expiresAt: { lte: new Date() },
      },
      select: { id: true, episodeId: true },
      take: 500,
    });
    for (const row of overdue) {
      await this.prisma.deskApproval.update({
        where: { id: row.id },
        data: {
          decision: 'REJECTED' as ApprovalDecision,
          decidedAt: new Date(),
          rejectionReason: 'auto-expired',
          terminateEpisode: true,
        },
      });
      await this.inngest.send('app/desk.approval.decided', {
        approvalId: row.id,
        episodeId: row.episodeId,
        decision: 'REJECTED' as ApprovalDecision,
        terminateEpisode: true,
        rejectionReason: 'auto-expired',
        decidedByUserId: 0, // 0 = system-decided
      });
    }
    if (overdue.length > 0) {
      this.logger.log(`auto-expired ${overdue.length} approvals`);
    }
    return overdue.length;
  }

  /**
   * Slim list contract (row = episode).
   *
   * List path returns only what rows render — no artifact, assistantRead,
   * context, confidence, or decisionHeader. Enrichment runs exclusively on
   * the detail endpoint (`GET /desk/episodes/:id`) so pagination payloads
   * stay ~300 bytes/row instead of ~2KB. See design spec §2.
   */
  async listPending(tenantId: number, options: { limit?: number; scope?: ApprovalScope; currentUserId?: number } = {}) {
    const limit = options.limit ?? 50;
    const episodeWhere: Prisma.DeskEpisodeWhereInput = { tenantId };
    if (options.scope === 'mine') {
      if (!options.currentUserId) {
        // Defensive: mine-scope with no user → empty list rather than leaking.
        return [];
      }
      episodeWhere.ownerAgent = { supervisorUserId: options.currentUserId };
    }
    const rows = await this.prisma.deskApproval.findMany({
      where: { decision: null, episode: episodeWhere },
      orderBy: { requestedAt: 'asc' },
      take: limit,
      select: {
        id: true,
        episodeId: true,
        requestedAt: true,
        expiresAt: true,
        episode: {
          select: {
            id: true,
            entityType: true,
            entityId: true,
            entityLabel: true,
            priority: true,
            status: true,
            openedAt: true,
            responsibility: { select: { key: true, title: true } },
            ownerAgent: { select: { key: true, name: true } },
          },
        },
      },
    });
    return rows.map(toSlimApprovalListItem);
  }

  async findById(id: string) {
    const approval = await this.prisma.deskApproval.findUnique({
      where: { id },
    });
    if (!approval) throw new NotFoundException('Approval not found');
    return approval;
  }

  /**
   * Cheap integer aggregates for the 3-tab Desk shell. Six counts in a
   * single round trip:
   *   • mine/all × waiting      — Needs You tab (pending approvals)
   *   • mine/all × escalated    — Needs You tab (escalations)
   *   • mine/all × handled.today / handled.last7d — Handled tab badges
   *
   * Window boundaries are tenant-local (midnight in Tenant.timezone via
   * Luxon, UTC fallback). Terminal statuses for Handled are
   * resolved / rejected_by_operator / expired.
   */
  async countPending(tenantId: number, currentUserId: number): Promise<HandoffCounts> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true },
    });
    const tz = tenant?.timezone ?? 'UTC';
    const now = DateTime.now().setZone(tz);
    const todayStart = now.startOf('day').toJSDate();
    const last7dStart = now.minus({ days: 7 }).toJSDate();

    const [
      allWaiting,
      mineWaiting,
      allEscalated,
      mineEscalated,
      allHandledToday,
      mineHandledToday,
      allHandled7d,
      mineHandled7d,
    ] = await Promise.all([
      this.prisma.deskApproval.count({
        where: { decision: null, episode: { tenantId } },
      }),
      this.prisma.deskApproval.count({
        where: {
          decision: null,
          episode: { tenantId, ownerAgent: { supervisorUserId: currentUserId } },
        },
      }),
      this.prisma.deskEpisode.count({
        where: { tenantId, status: EPISODE_STATUS.ESCALATED },
      }),
      this.prisma.deskEpisode.count({
        where: { tenantId, status: EPISODE_STATUS.ESCALATED, ownerAgent: { supervisorUserId: currentUserId } },
      }),
      this.prisma.deskEpisode.count({
        where: {
          tenantId,
          status: { in: [...HANDLED_COUNT_STATUSES] },
          closedAt: { gte: todayStart },
        },
      }),
      this.prisma.deskEpisode.count({
        where: {
          tenantId,
          status: { in: [...HANDLED_COUNT_STATUSES] },
          closedAt: { gte: todayStart },
          ownerAgent: { supervisorUserId: currentUserId },
        },
      }),
      this.prisma.deskEpisode.count({
        where: {
          tenantId,
          status: { in: [...HANDLED_COUNT_STATUSES] },
          closedAt: { gte: last7dStart },
        },
      }),
      this.prisma.deskEpisode.count({
        where: {
          tenantId,
          status: { in: [...HANDLED_COUNT_STATUSES] },
          closedAt: { gte: last7dStart },
          ownerAgent: { supervisorUserId: currentUserId },
        },
      }),
    ]);
    return {
      mine: { waiting: mineWaiting, escalated: mineEscalated },
      all: { waiting: allWaiting, escalated: allEscalated },
      handled: {
        today: { mine: mineHandledToday, all: allHandledToday },
        last7d: { mine: mineHandled7d, all: allHandled7d },
      },
    };
  }

  /**
   * Build the enriched payload for an approval owned by a tenant. Used by
   * the episode-detail controller so the sheet renders identically to the
   * queue view.
   */
  async enrichApproval(input: {
    responsibilityKey: string;
    proposedAction: Record<string, unknown>;
    steps: readonly { kind: DeskEpisodeStepKind; sequence: number; output: Record<string, unknown> | null }[];
  }): Promise<EnrichedApprovalPayload> {
    return this.enrichment.enrich(input);
  }
}

/**
 * Map a Prisma select row (approval + nested episode/responsibility/ownerAgent)
 * to the slim `EpisodeListItem` wire shape. Runs per row in the list path;
 * detail enrichment is the detail endpoint's job.
 */
function toSlimApprovalListItem(row: {
  id: string;
  episodeId: string;
  requestedAt: Date;
  expiresAt: Date;
  episode: {
    id: string;
    entityType: string | null;
    entityId: string | null;
    entityLabel: string | null;
    priority: string;
    status: string;
    openedAt: Date;
    responsibility: { key: string; title: string };
    ownerAgent: { key: string; name: string };
  };
}) {
  return {
    id: row.id,
    episodeId: row.episodeId,
    decisionTitle: row.episode.entityLabel ?? row.episode.responsibility.title,
    entityType: row.episode.entityType,
    entityId: row.episode.entityId,
    entitySubtitle: null, // responsibility-specific formatters can set this later
    agentKey: row.episode.ownerAgent.key,
    agentName: row.episode.ownerAgent.name,
    responsibilityKey: row.episode.responsibility.key,
    responsibilityTitle: row.episode.responsibility.title,
    priority: row.episode.priority,
    status: row.episode.status,
    openedAt: row.episode.openedAt.toISOString(),
    requestedAt: row.requestedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    escalationReason: null, // approvals are not escalations; this field only populated for escalation rows
  };
}
