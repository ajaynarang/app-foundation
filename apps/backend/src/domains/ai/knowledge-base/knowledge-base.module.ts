import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { AiInfrastructureModule } from '../infrastructure/ai-infrastructure.module';
import { KnowledgeBaseService } from './knowledge-base.service';
import { IngestionService } from './ingestion.service';

/**
 * KnowledgeBaseModule consumes the shared EmbeddingService from
 * AiInfrastructureModule. The embedder lives under ai/infrastructure/providers/
 * alongside StructuredOutputService — desk-memory + KB share one asset.
 */
@Module({
  imports: [PrismaModule, AiInfrastructureModule],
  providers: [KnowledgeBaseService, IngestionService],
  exports: [KnowledgeBaseService, IngestionService],
})
export class KnowledgeBaseModule {}
