/**
 * Tenant reset: the command line.
 *
 *   pnpm tenant:reset --tenant <tenantId> --mode soft --dry-run
 *   pnpm tenant:reset --tenant <tenantId> --mode soft --yes
 *   pnpm tenant:reset --tenant <tenantId> --mode hard --yes --i-understand-this-deletes-the-tenant
 *
 * DATABASE_URL names the database; there is no default. See README.md beside this file.
 */
import 'dotenv/config';
import pg from 'pg';
import { PrismaClient } from '@appshore/db';
import { PrismaPg } from '@prisma/adapter-pg';
import { runReset, type ResetRow, type ResetSummary } from './core';
import type { ResetMode } from './registry';
import { HARD_CONFIRM_FLAG, SafetyError } from './safety';

export interface CliArgs {
  readonly tenantId: string;
  readonly mode: ResetMode;
  readonly yes: boolean;
  readonly hardConfirm: boolean;
  readonly dryRun: boolean;
  readonly help: boolean;
}

export const USAGE = `
Usage:
  pnpm tenant:reset --tenant <tenantId> --mode <soft|hard> [flags]

Modes:
  soft   Deletes the workspace's activity: chat, jobs, events, notifications, support, Desk runs.
         Keeps the workspace, its users and memberships, its configuration and its billing.
  hard   Deletes everything that belongs to the workspace, then the workspace itself.

Flags:
  --dry-run                                 Count what would be deleted; change nothing.
  --yes                                     Skip typing the tenant id to confirm.
  ${HARD_CONFIRM_FLAG}    Required with --mode hard (except with --dry-run).

DATABASE_URL names the database (no default). Only tenants in ALLOWED_TENANTS (safety.ts) can be reset.
`.trim();

export function parseArgs(argv: readonly string[]): CliArgs {
  let tenantId = '';
  let mode: ResetMode | null = null;
  let yes = false;
  let hardConfirm = false;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--tenant': {
        const next = argv[i + 1];
        if (!next || next.startsWith('--')) throw new Error('--tenant needs a tenant id');
        tenantId = next;
        i++;
        break;
      }
      case '--mode': {
        const next = argv[i + 1];
        if (next !== 'soft' && next !== 'hard') throw new Error('--mode must be "soft" or "hard"');
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
      case HARD_CONFIRM_FLAG:
        hardConfirm = true;
        break;
      case '--help':
      case '-h':
        return { tenantId: '', mode: 'soft', yes, hardConfirm, dryRun, help: true };
      default:
        throw new Error(`Unknown flag: ${arg}`);
    }
  }
  if (!tenantId) throw new Error('--tenant <tenantId> is required');
  // No default mode: a reset that deletes the workspace must be asked for by name.
  if (!mode) throw new Error('--mode <soft|hard> is required');
  return { tenantId, mode, yes, hardConfirm, dryRun, help: false };
}

export function formatRow(row: ResetRow): string {
  return `  ${row.action.padEnd(10)}  ${row.table.padEnd(34)}  ${String(row.count).padStart(7)}`;
}

export function formatSummary(summary: ResetSummary): string[] {
  const lines = [
    '',
    `  Tenant   : ${summary.tenantId} (${summary.companyName})`,
    `  Mode     : ${summary.mode}${summary.dryRun ? ' (dry run)' : ''}`,
    '',
    '  By category:',
  ];
  const byCategory = new Map<string, ResetRow[]>();
  for (const row of summary.rows) byCategory.set(row.category, [...(byCategory.get(row.category) ?? []), row]);
  for (const [category, rows] of byCategory) {
    const total = rows.filter((r) => r.action === 'wipe').reduce((n, r) => n + r.count, 0);
    const kept = rows.filter((r) => r.action === 'skip-keep').length;
    const keptLabel = kept > 0 ? ` (${kept} table${kept === 1 ? '' : 's'} kept)` : '';
    lines.push(`    ${category.padEnd(16)} ${String(total).padStart(7)} rows${keptLabel}`);
  }
  const rehomed = summary.rows.find((r) => r.action === 'rehome')?.count ?? 0;
  if (rehomed > 0) lines.push('', `  ${rehomed} user(s) belong to another workspace and move there instead.`);
  lines.push('', `  Total rows: ${summary.totalAffected}`, `  Took: ${summary.durationMs} ms`, '');
  if (summary.dryRun) lines.push('  DRY RUN: nothing was changed.', '');
  return lines;
}

async function main(): Promise<void> {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`\n  Error: ${(err as Error).message}\n\n${USAGE}`);
    process.exit(1);
  }
  if (args.help) {
    console.log(USAGE);
    return;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('\n  DATABASE_URL is not set. Name the database to reset; there is no default.\n');
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const summary = await runReset(prisma, {
      ...args,
      onRow: (row) => console.log(formatRow(row)),
    });
    console.log(formatSummary(summary).join('\n'));
  } catch (err) {
    if (err instanceof SafetyError) {
      console.error(`\n  ${err.message}\n`);
    } else {
      console.error(`\n  Reset failed; nothing was changed: ${err instanceof Error ? err.message : String(err)}\n`);
    }
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

if (require.main === module) {
  void main();
}
