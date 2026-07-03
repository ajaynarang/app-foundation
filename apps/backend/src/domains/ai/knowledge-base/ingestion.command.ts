import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@appshore/platform/infrastructure/database/prisma.module';
import { EmbeddingService } from '../infrastructure/providers/embedding.service';
import { IngestionService } from './ingestion.service';

/**
 * Minimal module for the ingestion CLI — only what IngestionService needs.
 * Avoids bootstrapping the full AppModule (which pulls in MCP, Mastra, etc.).
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    PrismaModule,
  ],
  providers: [EmbeddingService, IngestionService],
})
class IngestionModule {}

/**
 * Standalone script to ingest product knowledge into pgvector.
 *
 * Usage: pnpm run seed:knowledge
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(IngestionModule, {
    logger: ['log', 'error', 'warn'],
  });

  const ingestionService = app.get(IngestionService);
  const result = await ingestionService.ingestAll();

  console.log(`\nIngestion complete!`);
  console.log(`Documents: ${result.documentCount}`);
  console.log(`Chunks: ${result.chunkCount}`);

  await app.close();
}

bootstrap().catch((error) => {
  console.error('Ingestion failed:', error);
  process.exit(1);
});
