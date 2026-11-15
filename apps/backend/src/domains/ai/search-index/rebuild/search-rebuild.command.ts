import { NestFactory } from '@nestjs/core';
import { applyQueueProcessingMode } from '@appshore/kernel/infrastructure/queue/queue-processing-mode';
import { SearchRebuildService, type RebuildSummary } from './search-rebuild.service';

/** `--tenant <id>` flags, repeatable. None means every tenant. */
export function parseTenantIds(argv: readonly string[]): number[] {
  const ids: number[] = [];
  argv.forEach((arg, i) => {
    if (arg !== '--tenant') return;
    const id = Number(argv[i + 1]);
    if (!Number.isInteger(id) || id <= 0) throw new Error(`--tenant needs a tenant id, got "${argv[i + 1] ?? ''}"`);
    ids.push(id);
  });
  return ids;
}

export function formatRebuildSummary(summary: RebuildSummary): string {
  return [
    `Search index: ${summary.tenants} tenant(s), ${summary.indexed} record(s) indexed, ` +
      `${summary.withoutVectors} stored without vectors, ${summary.removed} removed, ${summary.failed.length} failed`,
    ...(summary.withoutVectors
      ? ['Without vectors: the tenant has no embedding route, or it refused. Full-text search still finds them.']
      : []),
    ...summary.failed.map((f) => `  failed: tenant ${f.tenantId} ${f.subjectType} ${f.subjectId}: ${f.reason}`),
  ].join('\n');
}

/**
 * Writes the search index again from the records. The index is derived data, so this is the repair for anything it
 * missed, and the first fill after a product registers a new subject.
 *
 * It boots the whole app (subjects read through their own domain modules) as a process that enqueues but never
 * consumes a job. Embeddings are billed to each tenant like any other.
 *
 * Usage: pnpm search:rebuild                 # every tenant
 *        pnpm search:rebuild --tenant 12     # one tenant (repeatable)
 */
export async function bootstrap(argv: readonly string[] = process.argv.slice(2)): Promise<RebuildSummary> {
  const tenantIds = parseTenantIds(argv);
  applyQueueProcessingMode({ QUEUE_PROCESSORS_ENABLED: 'false' });
  // Loaded after the worker class is set, as the API does: @nestjs/bullmq reads it while the module initialises.
  const { AppModule } = await import('../../../../app.module');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const summary = await app.get(SearchRebuildService, { strict: false }).rebuild({ tenantIds });
    console.log(`\n${formatRebuildSummary(summary)}`);
    return summary;
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  bootstrap()
    .then((summary) => process.exit(summary.failed.length ? 1 : 0))
    .catch((error) => {
      console.error('Search rebuild failed:', error);
      process.exit(1);
    });
}
