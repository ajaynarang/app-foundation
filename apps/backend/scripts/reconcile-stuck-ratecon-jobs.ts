/**
 * One-off cleanup for rate-con import jobs left stuck in QUEUED/PROCESSING by the
 * pre-fix competing-consumer bug (2026-05-29): the email-intake worker grabbed
 * ratecon jobs and completed them with returnValue:null, so the DB Job row never
 * reached COMPLETED — the ghost card spins forever and rehydrates on reload.
 *
 * Scope is intentionally narrow: category='documents', type='ratecon', status in
 * (QUEUED, PROCESSING), and older than a grace window (so we never touch a job
 * that's legitimately in flight right now). Such rows are marked FAILED with a
 * clear, user-facing message — NOT deleted — so dispatchers see a failed card
 * they can dismiss or retry. Nothing else is touched.
 *
 * Dry-run by default. Pass `--apply` to write.
 *
 * Run (staging):  doppler run --project sally-backend --config stg -- npx tsx scripts/reconcile-stuck-ratecon-jobs.ts
 *        apply:   ... reconcile-stuck-ratecon-jobs.ts --apply
 */
import { PrismaClient, JobStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const GRACE_MINUTES = 15; // never touch jobs younger than this — could be live
const STUCK_MESSAGE = 'Processing was interrupted. Please re-upload the rate confirmation.';

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set — run via `doppler run -- ...`');

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const cutoff = new Date(Date.now() - GRACE_MINUTES * 60_000);
    const where = {
      category: 'documents',
      type: 'ratecon',
      status: { in: [JobStatus.QUEUED, JobStatus.PROCESSING] },
      createdAt: { lt: cutoff },
    };

    const stuck = await prisma.job.findMany({
      where,
      select: { id: true, tenantId: true, status: true, createdAt: true, inputData: true },
      orderBy: { createdAt: 'asc' },
    });

    console.log(`Found ${stuck.length} stuck ratecon job(s) older than ${GRACE_MINUTES}m:`);
    for (const j of stuck) {
      const fileName = (j.inputData as Record<string, unknown> | null)?.fileName ?? '(unknown)';
      console.log(
        `  job ${j.id} tenant=${j.tenantId} status=${j.status} created=${j.createdAt.toISOString()} file=${String(fileName)}`,
      );
    }

    if (!apply) {
      console.log(`\nDRY RUN — no rows changed. Re-run with --apply to mark these FAILED.`);
      return;
    }
    if (stuck.length === 0) {
      console.log('\nNothing to reconcile.');
      return;
    }

    const result = await prisma.job.updateMany({
      where,
      data: { status: JobStatus.FAILED, errorMessage: STUCK_MESSAGE, completedAt: new Date() },
    });
    console.log(`\nMarked ${result.count} job(s) FAILED.`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
