import { SupportStatus, type SupportPriority } from '@appshore/db';

import type { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';

/**
 * Support follow-up fan-out: the workspace's own tickets that are still open and that nobody has replied on for a
 * while. One cheap query; the per-ticket checks (still open, still quiet) run again in hydrate, because time passes
 * between the sweep and the run.
 */

/** A ticket support still owes an answer on. WAITING_ON_CUSTOMER is the workspace's turn, so it is not followed up. */
export const FOLLOWABLE_STATUSES: readonly SupportStatus[] = [SupportStatus.OPEN, SupportStatus.IN_PROGRESS];

const DAY_MS = 24 * 60 * 60 * 1000;

export interface QuietTicket {
  ticketNumber: string;
  subject: string;
  priority: SupportPriority;
  daysQuiet: number;
}

export function wholeDaysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

export async function findQuietTicketsForTenant(
  prisma: PrismaService,
  tenantId: number,
  opts: { staleAfterDays: number; limit?: number; now?: Date },
): Promise<QuietTicket[]> {
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - opts.staleAfterDays * DAY_MS);

  const rows = await prisma.supportTicket.findMany({
    where: {
      tenantId,
      status: { in: [...FOLLOWABLE_STATUSES] },
      createdAt: { lte: cutoff },
      // Internal notes are support's own; a tenant never sees them, so they do not count as a reply.
      messages: { none: { isInternal: false, createdAt: { gt: cutoff } } },
    },
    select: {
      ticketNumber: true,
      subject: true,
      priority: true,
      createdAt: true,
      messages: {
        where: { isInternal: false },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { createdAt: true },
      },
    },
    orderBy: { createdAt: 'asc' },
    take: opts.limit ?? 100,
  });

  return rows.map((row) => ({
    ticketNumber: row.ticketNumber,
    subject: row.subject,
    priority: row.priority,
    daysQuiet: wholeDaysBetween(row.messages[0]?.createdAt ?? row.createdAt, now),
  }));
}
