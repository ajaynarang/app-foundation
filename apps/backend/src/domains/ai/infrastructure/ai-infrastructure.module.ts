import { Module } from '@nestjs/common';
import { EmbeddingService } from './providers/embedding.service';
import { StructuredOutputService } from './providers/structured-output.service';
import { AiTelemetryModule } from './telemetry/ai-telemetry.module';

/**
 * AI Infrastructure Module
 * Provides shared AI utilities (LLM providers, document processing, embeddings,
 * cost telemetry) to all AI domain submodules.
 *
 * Note: The Anthropic provider is a plain TypeScript export (not a NestJS injectable)
 * because it's passed to Mastra Agent constructors at initialization time.
 *
 * StructuredOutputService wraps AI SDK `generateText` + `Output.object()` for
 * workflow-shaped (non-agent) structured extraction — ratecon parsing, fuel
 * receipts, shield analysis, load-board NLP, desk memory extract.
 *
 * EmbeddingService wraps AI SDK `embed` + `embedMany` for 1536-dim vectors
 * via the AI gateway. Shared by knowledge-base RAG and desk-memory semantic
 * retrieval.
 *
 * AiTelemetryModule provides `AiTelemetryService`, the single write path
 * for the `ai_invocations` cost ledger. PR 2-4 of the AI Cost Telemetry
 * plan wires the surfaces above through this service.
 */
@Module({
  imports: [AiTelemetryModule],
  providers: [EmbeddingService, StructuredOutputService],
  exports: [EmbeddingService, StructuredOutputService, AiTelemetryModule],
})
export class AiInfrastructureModule {}
