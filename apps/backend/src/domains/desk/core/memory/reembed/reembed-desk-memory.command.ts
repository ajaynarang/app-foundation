import { NestFactory } from '@nestjs/core';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '@appshore/platform/infrastructure/cache/redis-client.provider';
import { ReembedDeskMemoryCliModule } from './reembed-desk-memory-cli.module';
import { DeskMemoryReembedService, type ReembedSummary } from './desk-memory-reembed.service';

/** The summary the command prints. */
export function formatReembedSummary(summary: ReembedSummary): string {
  const lines = [
    'Desk memory re-embed complete.',
    `Tenants with memories to embed: ${summary.tenants}`,
    `Memories embedded: ${summary.reembedded}`,
  ];
  for (const { tenantId, reason } of summary.skipped)
    lines.push(`Skipped tenant ${tenantId}: its route refused (${reason})`);
  for (const { tenantId, reason } of summary.failed) lines.push(`Failed tenant ${tenantId}: ${reason}`);
  if (summary.skipped.length + summary.failed.length > 0) lines.push('Safe to run again once the cause is fixed.');
  return lines.join('\n');
}

/** `--tenant <id>` (repeatable) limits the run to those tenants' numeric ids. */
export function parseTenantIds(argv: readonly string[]): number[] | undefined {
  const ids: number[] = [];
  argv.forEach((arg, i) => {
    if (arg !== '--tenant') return;
    const id = Number(argv[i + 1]);
    if (!Number.isInteger(id) || id <= 0) throw new Error(`--tenant needs a numeric tenant id, got "${argv[i + 1]}"`);
    ids.push(id);
  });
  return ids.length > 0 ? ids : undefined;
}

/**
 * Re-embed Desk memories that have no vector, tenant by tenant, on each tenant's own route. Safe to re-run.
 * A tenant its route refuses is skipped and named. Exits 1 when a tenant failed for any other reason.
 *
 * Usage: pnpm --filter @app/backend ai:reembed-desk-memory [--tenant <id> ...]
 */
export async function bootstrap(argv: readonly string[] = process.argv.slice(2)): Promise<ReembedSummary> {
  const tenantIds = parseTenantIds(argv);
  const app = await NestFactory.createApplicationContext(ReembedDeskMemoryCliModule, {
    logger: ['log', 'error', 'warn'],
  });
  try {
    const summary = await app.get(DeskMemoryReembedService).reembedAll({ tenantIds });
    console.log(`\n${formatReembedSummary(summary)}`);
    return summary;
  } finally {
    // The shared Redis client has no shutdown hook of its own (the app's process exit ends it). The tenant policy
    // lookups opened it, so close it here or the command never exits.
    await app
      .get<Redis>(REDIS_CLIENT)
      .quit()
      .catch(() => undefined);
    await app.close();
  }
}

if (require.main === module) {
  bootstrap()
    .then((summary) => {
      if (summary.failed.length > 0) process.exitCode = 1;
    })
    .catch((error) => {
      console.error('Desk memory re-embed failed:', error);
      process.exit(1);
    });
}
