/**
 * Phase 4A backfill — for FACTORED invoices in the last 90 days, estimate
 * advance/fee/reserve from FactoringCompany rate-card and write the
 * matching FactoringTransaction ledger rows + populate Invoice denormalized
 * money fields.
 *
 * Idempotent: re-running on an invoice that already has an ADVANCE row is
 * a no-op. metadata.estimated=true is set on every backfilled row so the 4C
 * verification banner can flag them for the dispatcher.
 *
 * Usage:
 *   pnpm --filter @sally/backend backfill:factoring-money [--dry-run] [--tenant-id <slug>] [--days <N>]
 */
import { PrismaClient } from '@prisma/client';

interface BackfillOptions {
  dryRun: boolean;
  tenantSlug?: string;
  days: number;
}

interface BackfillStats {
  scanned: number;
  backfilled: number;
  skippedExisting: number;
  skippedNoRateCard: number;
  errors: number;
  perTenant: Record<string, number>;
}

export async function backfillFactoringMoney(
  prisma: PrismaClient,
  options: BackfillOptions,
  log: (msg: string) => void = console.log,
): Promise<BackfillStats> {
  const stats: BackfillStats = {
    scanned: 0,
    backfilled: 0,
    skippedExisting: 0,
    skippedNoRateCard: 0,
    errors: 0,
    perTenant: {},
  };

  const since = new Date(Date.now() - options.days * 24 * 60 * 60 * 1000);

  const where: Record<string, unknown> = {
    status: 'FACTORED',
    submittedToFactorAt: { gte: since },
    advanceAmountCents: null, // skip already-backfilled
  };
  if (options.tenantSlug) {
    where.tenant = { tenantId: options.tenantSlug };
  }

  const invoices = await prisma.invoice.findMany({
    where,
    include: { factoringCompanyRel: true, tenant: { select: { tenantId: true } } },
  });

  for (const inv of invoices) {
    stats.scanned++;
    const tenantSlug = (inv as any).tenant?.tenantId ?? `tenant-${inv.tenantId}`;

    if (!inv.factoringCompanyRel?.advanceRatePct || !inv.factoringCompanyRel?.feeRatePct) {
      log(`Skipping ${inv.invoiceNumber}: factor missing rate-card`);
      stats.skippedNoRateCard++;
      continue;
    }

    // Idempotency check — skip if an ADVANCE already exists.
    const existingAdvance = await prisma.factoringTransaction.findFirst({
      where: { invoiceId: inv.id, type: 'ADVANCE', deletedAt: null },
    });
    if (existingAdvance) {
      stats.skippedExisting++;
      continue;
    }

    const advanceRate = Number(inv.factoringCompanyRel.advanceRatePct) / 100;
    const feeRate = Number(inv.factoringCompanyRel.feeRatePct) / 100;
    const advance = Math.round(inv.totalCents * advanceRate);
    const fee = Math.round(inv.totalCents * feeRate);
    const reserve = Math.max(0, inv.totalCents - advance - fee);
    const txnDate = inv.submittedToFactorAt!;

    if (options.dryRun) {
      log(
        `[dry-run] ${tenantSlug} ${inv.invoiceNumber}: ADVANCE=${advance} FEE=${fee} RESERVE=${reserve} (total=${inv.totalCents})`,
      );
      stats.backfilled++;
      stats.perTenant[tenantSlug] = (stats.perTenant[tenantSlug] ?? 0) + 1;
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        await tx.factoringTransaction.create({
          data: {
            transactionId: `FT-BACKFILL-${inv.invoiceNumber}-A`,
            invoiceId: inv.id,
            factoringCompanyId: inv.factoringCompanyId!,
            tenantId: inv.tenantId,
            type: 'ADVANCE',
            amountCents: advance,
            transactionDate: txnDate,
            advanceRatePctSnapshot: inv.factoringCompanyRel!.advanceRatePct,
            feeRatePctSnapshot: inv.factoringCompanyRel!.feeRatePct,
            metadata: { estimated: true, source: 'backfill-2026-04-29', pleaseVerify: true },
            notes: 'Estimated from rate-card; please verify against factor statement',
          },
        });
        if (fee > 0) {
          await tx.factoringTransaction.create({
            data: {
              transactionId: `FT-BACKFILL-${inv.invoiceNumber}-F`,
              invoiceId: inv.id,
              factoringCompanyId: inv.factoringCompanyId!,
              tenantId: inv.tenantId,
              type: 'FEE',
              amountCents: fee,
              transactionDate: txnDate,
              advanceRatePctSnapshot: inv.factoringCompanyRel!.advanceRatePct,
              feeRatePctSnapshot: inv.factoringCompanyRel!.feeRatePct,
              metadata: { estimated: true, source: 'backfill-2026-04-29', pleaseVerify: true },
            },
          });
        }
        await tx.invoice.update({
          where: { id: inv.id },
          data: {
            advanceAmountCents: advance,
            advanceReceivedAt: txnDate,
            factoringFeeCents: fee > 0 ? fee : null,
            reserveAmountCents: reserve > 0 ? reserve : null,
          },
        });
      });
      stats.backfilled++;
      stats.perTenant[tenantSlug] = (stats.perTenant[tenantSlug] ?? 0) + 1;
      log(`Backfilled ${inv.invoiceNumber} (${tenantSlug})`);
    } catch (err) {
      stats.errors++;
      log(`Error backfilling ${inv.invoiceNumber}: ${(err as Error).message}`);
    }
  }

  return stats;
}

function arg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  const v = process.argv[idx + 1];
  return v && !v.startsWith('--') ? v : undefined;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const tenantSlug = arg('--tenant-id');
  const days = Number(arg('--days') ?? '90');

  const prisma = new PrismaClient();
  try {
    console.log(`Backfill running [dryRun=${dryRun} tenant=${tenantSlug ?? 'ALL'} days=${days}]`);
    const stats = await backfillFactoringMoney(prisma, { dryRun, tenantSlug, days });
    console.log('\n=== Backfill summary ===');
    console.log(JSON.stringify(stats, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
}
