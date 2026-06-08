/**
 * One-time backfill — SQ-114.
 *
 * Relay loads that were marked DELIVERED *before* the relay-delivery billing-parity
 * fix never received their delivery side-effects: billingStatus stayed NULL (so the
 * load never appeared in Close-Out), the linehaul charge was never created, and stops
 * were never marked COMPLETED. The runtime fix only covers deliveries going forward;
 * this script rescues the already-stuck rows.
 *
 * Scope (narrow on purpose): isRelay = true AND status = DELIVERED AND billingStatus IS NULL.
 *
 * Idempotent — mirrors LoadLegService.applyDeliverySideEffects exactly:
 *   - billingStatus → PENDING_DOCUMENTS only when currently null
 *   - linehaul charge created only when none exists and rateCents is set
 *   - stops marked COMPLETED only when not already COMPLETED
 * Re-running is a no-op.
 *
 * SAFE BY DEFAULT: dry-run unless you pass --apply. Per-load transaction.
 *
 * Usage (against staging, via the SSM tunnel on localhost:5433):
 *   # 1. open the tunnel in another shell:  ./tools/db/tunnel.sh
 *   # 2. dry-run (no writes):
 *   DATABASE_URL='postgresql://USER:PASS@127.0.0.1:5433/DB?sslmode=require' \
 *     pnpm exec ts-node --transpile-only scripts/backfill-relay-delivery-billing.ts
 *   # 3. apply:
 *   DATABASE_URL='...:5433...' \
 *     pnpm exec ts-node --transpile-only scripts/backfill-relay-delivery-billing.ts --apply
 *
 * Optional: --tenant-id <slug> to limit to one tenant.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

interface BackfillOptions {
  apply: boolean;
  tenantSlug?: string;
}

interface BackfillStats {
  scanned: number;
  billingStatusSet: number;
  linehaulCreated: number;
  stopsCompleted: number;
  skippedNoRate: number;
  errors: number;
  perTenant: Record<string, number>;
}

export async function backfillRelayDeliveryBilling(
  prisma: PrismaClient,
  options: BackfillOptions,
  log: (msg: string) => void = console.log,
): Promise<BackfillStats> {
  const stats: BackfillStats = {
    scanned: 0,
    billingStatusSet: 0,
    linehaulCreated: 0,
    stopsCompleted: 0,
    skippedNoRate: 0,
    errors: 0,
    perTenant: {},
  };

  const where: Record<string, unknown> = {
    isRelay: true,
    status: 'DELIVERED',
    billingStatus: null,
  };
  if (options.tenantSlug) {
    where.tenant = { tenantId: options.tenantSlug };
  }

  const loads = await prisma.load.findMany({
    where,
    select: {
      id: true,
      loadNumber: true,
      rateCents: true,
      tenantId: true,
      tenant: { select: { tenantId: true } },
      charges: { where: { chargeType: 'linehaul' }, select: { id: true } },
    },
  });

  log(`Found ${loads.length} stuck relay load(s) (isRelay + DELIVERED + billingStatus NULL).`);

  for (const load of loads) {
    stats.scanned++;
    const tenantSlug = load.tenant?.tenantId ?? `tenant-${load.tenantId}`;
    const needsCharge = load.charges.length === 0 && !!load.rateCents;
    const noRate = load.charges.length === 0 && !load.rateCents;

    if (noRate) stats.skippedNoRate++;

    const plan = [
      'billingStatus→PENDING_DOCUMENTS',
      needsCharge
        ? `linehaul charge (${load.rateCents}¢)`
        : load.charges.length > 0
          ? 'linehaul exists'
          : 'no rate — skip charge',
      'complete stops',
    ].join(', ');

    if (!options.apply) {
      log(`[dry-run] ${tenantSlug} #${load.loadNumber}: ${plan}`);
      stats.billingStatusSet++;
      if (needsCharge) stats.linehaulCreated++;
      stats.perTenant[tenantSlug] = (stats.perTenant[tenantSlug] ?? 0) + 1;
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        // 1. Complete stops (idempotent)
        const stopRes = await tx.loadStop.updateMany({
          where: { loadId: load.id, status: { not: 'COMPLETED' } },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
        stats.stopsCompleted += stopRes.count;

        // 2. Linehaul charge (only if missing and a rate exists)
        if (needsCharge) {
          await tx.loadCharge.create({
            data: {
              loadId: load.id,
              chargeType: 'linehaul',
              description: `Linehaul - Load #${load.loadNumber}`,
              quantity: 1,
              unitPriceCents: load.rateCents,
              totalCents: load.rateCents,
              isBillable: true,
              isPayable: false,
            },
          });
          stats.linehaulCreated++;
        }

        // 3. Open the billing workflow (guard: only when null — re-check inside tx)
        const fresh = await tx.load.findUnique({ where: { id: load.id }, select: { billingStatus: true } });
        if (fresh?.billingStatus == null) {
          await tx.load.update({
            where: { id: load.id },
            data: { billingStatus: 'PENDING_DOCUMENTS' },
          });
          stats.billingStatusSet++;
        }
      });
      stats.perTenant[tenantSlug] = (stats.perTenant[tenantSlug] ?? 0) + 1;
      log(`Backfilled ${tenantSlug} #${load.loadNumber}`);
    } catch (err) {
      stats.errors++;
      log(`ERROR backfilling #${load.loadNumber}: ${(err as Error).message}`);
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
  const apply = process.argv.includes('--apply');
  const tenantSlug = arg('--tenant-id');

  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL is not set. Point it at the staging tunnel (localhost:5433).');
    process.exit(1);
  }

  // Prisma 7 uses the driver-adapter pattern (no url in schema) — mirror PrismaService.
  // SSL only for remote hosts: staging RDS (via the SSM tunnel) presents its own CA
  // cert not in the local trust store, so rejectUnauthorized=false is needed — the
  // tunnel is already an encrypted channel, so this is safe for a one-off operator
  // run (do NOT copy this into app runtime config). Local docker Postgres doesn't
  // speak SSL at all, so skip it there (loopback host).
  const isLocal = /@(127\.0\.0\.1|localhost):5432\b/.test(process.env.DATABASE_URL);
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const target = process.env.DATABASE_URL.replace(/:[^:@/]+@/, ':****@');
    console.log(`Relay-billing backfill [${apply ? 'APPLY' : 'DRY-RUN'}] tenant=${tenantSlug ?? 'ALL'}`);
    console.log(`Target: ${target}\n`);
    const stats = await backfillRelayDeliveryBilling(prisma, { apply, tenantSlug });
    console.log('\n=== Summary ===');
    console.log(JSON.stringify(stats, null, 2));
    if (!apply && stats.scanned > 0) {
      console.log('\nThis was a DRY-RUN. Re-run with --apply to write the changes.');
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
}
