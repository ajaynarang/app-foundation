/**
 * Tenant Reset — CLI entry point.
 *
 * Usage:
 *   pnpm tenant:reset --tenant <slug> --mode soft --dry-run
 *   pnpm tenant:reset --tenant <slug> --mode soft --yes
 *   pnpm tenant:reset --tenant <slug> --mode hard --yes \
 *                    --i-understand-this-deletes-the-tenant
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { runReset, type ResetRow, type ResetSummary } from './core';
import { SafetyError } from './safety';
import type { ResetMode } from './registry';

interface CliArgs {
  readonly tenantSlug: string;
  readonly mode: ResetMode;
  readonly yes: boolean;
  readonly hardConfirm: boolean;
  readonly dryRun: boolean;
}

const USAGE = `
Usage:
  pnpm tenant:reset --tenant <slug> --mode <soft|hard> [flags]

Modes:
  soft   Wipes operational data. Keeps tenant, users, fleet, tenant config.
  hard   Wipes everything for the tenant, including the tenant row.

Flags:
  --dry-run                                   Preview counts, don't delete.
  --yes                                       Skip the slug-confirmation prompt.
  --i-understand-this-deletes-the-tenant      Required with --mode hard (unless dry-run).
`.trim();

function parseArgs(argv: readonly string[]): CliArgs {
  let tenantSlug = '';
  let mode: ResetMode = 'soft';
  let yes = false;
  let hardConfirm = false;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--tenant': {
        const next = argv[i + 1];
        if (!next || next.startsWith('--')) {
          throw new Error('--tenant requires a slug value');
        }
        tenantSlug = next;
        i++;
        break;
      }
      case '--mode': {
        const next = argv[i + 1];
        if (next !== 'soft' && next !== 'hard') {
          throw new Error('--mode must be "soft" or "hard"');
        }
        mode = next;
        i++;
        break;
      }
      case '--dry-run':
        dryRun = true;
        break;
      case '--yes':
        yes = true;
        break;
      case '--i-understand-this-deletes-the-tenant':
        hardConfirm = true;
        break;
      case '--help':
      case '-h':
        console.log(USAGE);
        process.exit(0);
      /* c8 ignore next */
      // eslint-disable-next-line no-fallthrough -- unreachable after exit
      default:
        throw new Error(`Unknown flag: ${arg}`);
    }
  }

  if (!tenantSlug) {
    throw new Error('--tenant <slug> is required');
  }

  return { tenantSlug, mode, yes, hardConfirm, dryRun };
}

function formatRow(row: ResetRow): string {
  const actionLabel = row.action.padEnd(10);
  const table = row.table.padEnd(34);
  return `  ${actionLabel}  ${table}  ${String(row.count).padStart(7)}`;
}

function printHeader(args: CliArgs, companyName: string): void {
  console.log('');
  console.log('  SALLY — Tenant Reset');
  console.log(`  Tenant   : ${args.tenantSlug}`);
  console.log(`  Company  : ${companyName}`);
  console.log(`  Mode     : ${args.mode}${args.dryRun ? ' (dry-run)' : ''}`);
  console.log('');
}

function printSummary(summary: ResetSummary): void {
  console.log('');
  const byCategory = new Map<string, ResetRow[]>();
  for (const row of summary.rows) {
    const list = byCategory.get(row.category) ?? [];
    list.push(row);
    byCategory.set(row.category, list);
  }

  console.log('  Summary by category:');
  for (const [cat, rows] of byCategory) {
    const total = rows.reduce((n, r) => n + r.count, 0);
    const kept = rows.filter((r) => r.action === 'skip-keep').length;
    const keptLabel = kept > 0 ? ` (${kept} table${kept === 1 ? '' : 's'} preserved)` : '';
    console.log(`    ${cat.padEnd(22)} ${String(total).padStart(7)} rows${keptLabel}`);
  }
  console.log('');
  console.log(`  Total affected: ${summary.totalAffected}`);
  console.log(`  Duration: ${summary.durationMs}ms`);
  console.log('');
  if (summary.dryRun) {
    console.log('  DRY RUN — no changes were written.');
    console.log('');
  }
}

async function main(): Promise<void> {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`\n  Error: ${(err as Error).message}\n`);
    console.error(USAGE);
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL ?? 'postgresql://sally_user:sally_password@localhost:5432/sally';
  const pool = new pg.Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const summary = await runReset(prisma, {
      tenantSlug: args.tenantSlug,
      mode: args.mode,
      yes: args.yes,
      hardConfirm: args.hardConfirm,
      dryRun: args.dryRun,
      onRow: (row) => {
        if (row.action === 'skip-keep') return;
        console.log(formatRow(row));
      },
    });
    if (!args.dryRun) printHeader(args, summary.companyName);
    printSummary(summary);
  } catch (err) {
    if (err instanceof SafetyError) {
      console.error(`\n  ${err.message}\n`);
      process.exit(1);
    }
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : '';
    console.error(`\n  Reset failed: ${msg}\n${stack ?? ''}\n`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

// Only run main when invoked directly (not when imported by tests).
/* c8 ignore start */
if (require.main === module) {
  void main();
}
/* c8 ignore stop */
