import { Injectable, Logger } from '@nestjs/common';
import type { MemoryPolarity, MemoryScope } from '@appshore/db';

import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { findResponsibilityDefinition } from '../../responsibilities';

import type { ReinforcementJudge, ReinforcementJudgeContext } from './reinforcement.types';

/**
 * Tunables — exposed as constants so reviewers + tests can grep.
 *
 * Confidence movement is asymmetric: CONFIRM moves modestly (10%) but
 * CONTRADICT moves more aggressively (30%) because the cost of acting
 * on stale "do this" guidance is generally higher than the cost of
 * delaying a "do this" boost. Floor + cap clamp the value into a
 * sensible band; auto-deactivate fires when CONTRADICT pushes a
 * non-pinned row below the floor.
 */
const CONFIRM_MULTIPLIER = 1.1;
const CONTRADICT_MULTIPLIER = 0.7;
const CONFIDENCE_CAP = 0.99;
const CONFIDENCE_FLOOR = 0.01;
const AUTO_DEACTIVATE_BELOW = 0.3;

interface ReinforceInput {
  retrievedMemoryIds: string[];
  responsibilityKey: string;
  transition: string;
  entityRef: Record<string, unknown>;
  outcome: string;
}

/**
 * DeskMemoryReinforcer — the feedback loop. Walks every memory the
 * episode actually used (recorded by hydrate.step into
 * `episode.retrievedMemoryIds`) and asks the responsibility's judge
 * whether the closing outcome confirmed or contradicted each row.
 *
 * Generic — never branches on responsibility key. Per-responsibility
 * judgment lives in the responsibility's own definition. New
 * responsibilities ship a judge alongside their other registry fields.
 */
@Injectable()
export class DeskMemoryReinforcer {
  private readonly logger = new Logger(DeskMemoryReinforcer.name);

  constructor(private readonly prisma: PrismaService) {}

  async reinforce(input: ReinforceInput): Promise<void> {
    if (input.retrievedMemoryIds.length === 0) return;

    const responsibility = findResponsibilityDefinition(input.responsibilityKey);
    if (!responsibility) {
      // Unknown responsibility — defensive no-op. Code never branches on
      // responsibility key in this service so this is the natural exit.
      this.logger.debug(`reinforce: no definition for ${input.responsibilityKey}; skipping`);
      return;
    }
    const judge = responsibility.reinforcementJudge;
    if (!judge) return;

    const rows = await this.prisma.deskMemory.findMany({
      where: { id: { in: input.retrievedMemoryIds } },
      select: {
        id: true,
        scope: true,
        polarity: true,
        content: true,
        entityRef: true,
        entityPredicate: true,
        confidence: true,
        isPinned: true,
        isActive: true,
      },
    });

    const ctx: ReinforcementJudgeContext = {
      transition: input.transition,
      outcome: input.outcome,
      entityRef: input.entityRef,
    };

    await Promise.all(rows.map((row) => this.applyVerdict(judge, row, ctx)));
  }

  private async applyVerdict(
    judge: ReinforcementJudge,
    row: {
      id: string;
      scope: MemoryScope;
      polarity: MemoryPolarity;
      content: string;
      entityRef: unknown;
      entityPredicate: unknown;
      confidence: number;
      isPinned: boolean;
      isActive: boolean;
    },
    ctx: ReinforcementJudgeContext,
  ): Promise<void> {
    const verdict = judge(
      {
        scope: row.scope,
        polarity: row.polarity,
        content: row.content,
        entityRef: (row.entityRef as Record<string, unknown> | null) ?? null,
        entityPredicate: (row.entityPredicate as Record<string, unknown> | null) ?? null,
      },
      ctx,
    );

    const data: { confidence?: number; isActive?: boolean; usageCount: { increment: number } } = {
      usageCount: { increment: 1 },
    };

    if (verdict === 'CONFIRM') {
      data.confidence = Math.min(CONFIDENCE_CAP, row.confidence * CONFIRM_MULTIPLIER);
    } else if (verdict === 'CONTRADICT') {
      const next = Math.max(CONFIDENCE_FLOOR, row.confidence * CONTRADICT_MULTIPLIER);
      data.confidence = next;
      if (!row.isPinned && next < AUTO_DEACTIVATE_BELOW) {
        data.isActive = false;
      }
    }
    // NEUTRAL — usageCount only.

    await this.prisma.deskMemory.update({ where: { id: row.id }, data });
  }
}
