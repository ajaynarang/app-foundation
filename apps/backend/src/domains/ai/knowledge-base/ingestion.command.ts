import { NestFactory } from '@nestjs/core';
import { IngestionCliModule } from './ingestion-cli.module';
import { IngestionService, type IngestResult } from './ingestion.service';

/** The summary the CLI prints. */
export function formatIngestSummary(result: IngestResult): string {
  return [
    'Ingestion complete!',
    `Documents: ${result.documentCount}`,
    `Chunks: ${result.chunkCount}`,
    result.embedded
      ? 'Embeddings: written on the platform embedding route'
      : 'Embeddings: none (no platform embedding route; set COHERE_API_KEY and run again). Search uses full-text.',
  ].join('\n');
}

/**
 * Standalone script to ingest product knowledge into pgvector.
 *
 * Usage: pnpm run seed:knowledge
 */
export async function bootstrap(): Promise<IngestResult> {
  const app = await NestFactory.createApplicationContext(IngestionCliModule, {
    logger: ['log', 'error', 'warn'],
  });
  try {
    const result = await app.get(IngestionService).ingestAll();
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
