import { NestFactory } from '@nestjs/core';
import { IngestionCliModule } from './ingestion-cli.module';
import { IngestionService, type IngestOptions, type IngestResult } from './ingestion.service';

/** The summary the CLI prints: one counts line, the changed files, and how embeddings went. */
export function formatIngestSummary(result: IngestResult): string {
  const list = (label: string, paths: string[]) => (paths.length ? [`${label}:`, ...paths.map((p) => `  ${p}`)] : []);
  return [
    `Knowledge base: ${result.added.length} added, ${result.updated.length} updated, ` +
      `${result.reembedded.length} re-embedded, ${result.unchanged} unchanged, ${result.removed.length} removed ` +
      `(${result.chunkCount} chunks written)`,
    ...list('Added', result.added),
    ...list('Updated', result.updated),
    ...list('Re-embedded', result.reembedded),
    ...list('Removed', result.removed),
    result.embedded
      ? 'Embeddings: written on the platform embedding route'
      : 'Embeddings: none (no platform embedding route; set COHERE_API_KEY and run again). Search uses full-text.',
  ].join('\n');
}

/** The command-line flags: `--force` re-embeds every file. */
export function parseIngestArgs(argv: string[]): IngestOptions {
  return { force: argv.includes('--force') };
}

/**
 * Standalone script that syncs the content folder into the knowledge base. Incremental and idempotent: only changed
 * files (and files whose chunks lack vectors) are embedded, so it is safe on every deploy.
 *
 * Usage: pnpm seed:knowledge            # sync changed files
 *        pnpm seed:knowledge --force    # re-embed everything
 */
export async function bootstrap(argv: string[] = process.argv): Promise<IngestResult> {
  const app = await NestFactory.createApplicationContext(IngestionCliModule, {
    logger: ['log', 'error', 'warn'],
  });
  try {
    const result = await app.get(IngestionService).ingestAll(parseIngestArgs(argv));
    console.log(`\n${formatIngestSummary(result)}`);
    return result;
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  bootstrap().catch((error) => {
    console.error('Ingestion failed:', error);
    process.exit(1);
  });
}
