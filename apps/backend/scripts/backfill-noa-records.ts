/**
 * backfill-noa-records.ts
 *
 * One-time backfill: for every distinct (customerId, factoringCompanyId, tenantId)
 * tuple in existing FACTORED invoices where no NoaRecord exists, create
 * a NoaRecord(NOT_SENT). Idempotent — relies on the unique constraint
 * `@@unique([customerId, factoringCompanyId, tenantId])` to skip duplicates.
 *
 * Usage:
 *   doppler run -- pnpm exec ts-node apps/backend/scripts/backfill-noa-records.ts --dry-run
 *   doppler run -- pnpm exec ts-node apps/backend/scripts/backfill-noa-records.ts
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

interface InvoiceTuple {
  tenantId: number;
  customerId: number;
  factoringCompanyId: number;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  console.log(`[backfill-noa-records] ${dryRun ? 'DRY RUN — no writes' : 'EXECUTE — will create rows'}`);

  // Distinct (tenant, customer, factor) tuples from existing FACTORED invoices.
  const tuples = await prisma.invoice.findMany({
    where: { billingPath: 'FACTORED', factoringCompanyId: { not: null } },
    select: { tenantId: true, customerId: true, factoringCompanyId: true },
    distinct: ['tenantId', 'customerId', 'factoringCompanyId'],
  });

  // Filter to truly-distinct tuples in case the DB returns repeats.
  const seen = new Set<string>();
  const distinct: InvoiceTuple[] = [];
  for (const t of tuples) {
    if (!t.factoringCompanyId) continue;
    const key = `${t.tenantId}:${t.customerId}:${t.factoringCompanyId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    distinct.push({
      tenantId: t.tenantId,
      customerId: t.customerId,
      factoringCompanyId: t.factoringCompanyId,
    });
  }

  console.log(`[backfill-noa-records] Found ${distinct.length} distinct (tenant, customer, factor) tuples`);

  // Per-tenant counts for the report.
  const perTenant = new Map<number, { existing: number; created: number; skipped: number }>();
  const bump = (tenantId: number, key: 'existing' | 'created' | 'skipped') => {
    const cur = perTenant.get(tenantId) ?? { existing: 0, created: 0, skipped: 0 };
    cur[key] += 1;
    perTenant.set(tenantId, cur);
  };

  for (const t of distinct) {
    const existing = await prisma.noaRecord.findFirst({
      where: {
        tenantId: t.tenantId,
        customerId: t.customerId,
        factoringCompanyId: t.factoringCompanyId,
      },
      select: { id: true },
    });
    if (existing) {
      bump(t.tenantId, 'existing');
      continue;
    }
    if (dryRun) {
      bump(t.tenantId, 'created');
      continue;
    }
    try {
      await prisma.noaRecord.create({
        data: {
          noaId: `noa_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
          tenantId: t.tenantId,
          customerId: t.customerId,
          factoringCompanyId: t.factoringCompanyId,
        },
      });
      bump(t.tenantId, 'created');
    } catch (err) {
      // Concurrent race or unique violation — treat as skipped, count and continue.
      if ((err as { code?: string }).code === 'P2002') {
        bump(t.tenantId, 'skipped');
        continue;
      }
      console.error(
        `[backfill-noa-records] FAILED tenant=${t.tenantId} customer=${t.customerId} factor=${t.factoringCompanyId}:`,
        err,
      );
      bump(t.tenantId, 'skipped');
    }
  }

  console.log('\n[backfill-noa-records] Per-tenant summary:');
  console.log('  tenantId | existing | created | skipped');
  console.log('  ---------+----------+---------+--------');
  const sortedTenants = Array.from(perTenant.keys()).sort((a, b) => a - b);
  let totalCreated = 0;
  let totalExisting = 0;
  let totalSkipped = 0;
  for (const tenantId of sortedTenants) {
    const c = perTenant.get(tenantId)!;
    totalCreated += c.created;
    totalExisting += c.existing;
    totalSkipped += c.skipped;
    console.log(
      `  ${String(tenantId).padStart(8)} | ${String(c.existing).padStart(8)} | ${String(c.created).padStart(7)} | ${String(c.skipped).padStart(7)}`,
    );
  }
  console.log('  ---------+----------+---------+--------');
  console.log(
    `  TOTAL    | ${String(totalExisting).padStart(8)} | ${String(totalCreated).padStart(7)} | ${String(totalSkipped).padStart(7)}`,
  );
  console.log(`\n[backfill-noa-records] ${dryRun ? 'DRY RUN complete — no writes performed.' : 'Execute complete.'}`);

  await prisma.$disconnect();
  await pool.end();
}

main().catch((err) => {
  console.error('[backfill-noa-records] FATAL:', err);
  process.exit(1);
});
