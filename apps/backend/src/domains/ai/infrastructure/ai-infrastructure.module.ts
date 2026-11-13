import { Module } from '@nestjs/common';
import { EmbeddingService } from './providers/embedding.service';
import { StructuredOutputService } from './providers/structured-output.service';
import { AiTelemetryModule } from './telemetry/ai-telemetry.module';
import { AiRoutingModule } from '../routing/ai-routing.module';

/**
 * AI Infrastructure Module
 * Provides shared AI utilities (LLM providers, document processing, embeddings,
 * cost telemetry) to all AI domain submodules.
 *
 * Models come from the route resolver (`AiRoutingModule`, re-exported here): every language call resolves the
 * tenant's route first, so retention and configuration are enforced in one place.
 *
 * StructuredOutputService wraps AI SDK `generateText` + `Output.object()` for
 * workflow-shaped (non-agent) structured extraction — document parsing, desk
 * memory extract, and similar non-chat surfaces.
 *
 * EmbeddingService wraps AI SDK `embed` + `embedMany` for 1536-dim vectors on
 * the tenant's resolved embedding route (Cohere Embed v4). Shared by
 * knowledge-base RAG and desk-memory semantic retrieval.
 *
 * AiTelemetryModule provides `AiTelemetryService`, the single write path
 * for the `ai_invocations` cost ledger. PR 2-4 of the AI Cost Telemetry
 * plan wires the surfaces above through this service.
 */
@Module({
  imports: [AiTelemetryModule, AiRoutingModule],
  providers: [EmbeddingService, StructuredOutputService],
  exports: [EmbeddingService, StructuredOutputService, AiTelemetryModule, AiRoutingModule],
})
export class AiInfrastructureModule {}
