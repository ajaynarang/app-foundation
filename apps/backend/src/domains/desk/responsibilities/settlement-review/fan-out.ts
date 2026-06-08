import { SettlementStatus } from '@prisma/client';

import { PrismaService } from '../../../../infrastructure/database/prisma.service';

/**
 * Settlement Review fan-out adapter.
 *
 * Pure Prisma query — returns the set of DRAFT settlements the weekly sweep
 * (or manual run) should review. Anomaly classification + the per-driver
 * average happen inside hydrate.step per episode, so fan-out stays cheap and
 * just returns the candidate set with display fields. excludeDriverIds and
 * staleness are applied later (hydrate/preflight) so the snapshot the operator
 * sees matches the snapshot the gate read.
 */
export interface DraftSettlement {
  /** Public settlement id (e.g. stl_abc123) — used as the episode entityId. */
  settlementId: string;
  settlementNumber: string;
  /** Public driver id (e.g. drv_abc123). */
  driverId: string;
  driverName: string;
  netPayCents: number;
  grossPayCents: number;
  deductionsCents: number;
  createdAt: Date;
}

export async function findDraftSettlementsForTenant(
  prisma: PrismaService,
  tenantId: number,
  opts: { limit?: number } = {},
): Promise<DraftSettlement[]> {
  const rows = await prisma.settlement.findMany({
    where: {
      tenantId,
      status: SettlementStatus.DRAFT,
    },
    select: {
      settlementId: true,
      settlementNumber: true,
      grossPayCents: true,
      deductionsCents: true,
      netPayCents: true,
      createdAt: true,
      driver: { select: { driverId: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: opts.limit ?? 500,
  });

  return rows.map((r) => ({
    settlementId: r.settlementId,
    settlementNumber: r.settlementNumber,
    driverId: r.driver.driverId,
    driverName: r.driver.name,
    netPayCents: r.netPayCents,
    grossPayCents: r.grossPayCents,
    deductionsCents: r.deductionsCents,
    createdAt: r.createdAt,
  }));
}
