import { Injectable } from '@nestjs/common';
import type { OutboxHealth } from '@app/shared-types';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';

/**
 * The transactional outbox's health on the Timers page (ADR "Outbox and deadlines"): events committed but not yet
 * published, and how long the oldest has waited. A backlog that grows past the relay's grace means
 * the relay is not running or every publish is failing.
 */
export const OUTBOX_HEALTH_READER = Symbol('OUTBOX_HEALTH_READER');

export interface OutboxHealthReader {
  health(): Promise<OutboxHealth>;
}

@Injectable()
export class PrismaOutboxHealthReader implements OutboxHealthReader {
  constructor(private readonly prisma: PrismaService) {}

  async health(now: Date = new Date()): Promise<OutboxHealth> {
    const backlog = await this.prisma.outboxEvent.aggregate({
      where: { publishedAt: null },
      _count: { _all: true },
      _min: { occurredAt: true },
    });
    const oldest = backlog._min.occurredAt;
    return {
      unpublished: backlog._count._all,
      oldestAgeSeconds: oldest ? Math.max(0, Math.round((now.getTime() - oldest.getTime()) / 1000)) : null,
    };
  }
}
