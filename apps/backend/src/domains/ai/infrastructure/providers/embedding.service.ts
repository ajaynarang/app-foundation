import { Injectable, Logger } from '@nestjs/common';
import { AiInvocationStatus } from '@prisma/client';
import { embed, embedMany } from 'ai';
import type { AiCallContext } from '@app/shared-types';

import { aiEmbedding, EMBEDDING_MODEL_ID, EMBEDDING_PROVIDER_LABEL } from './ai-provider';
import { AiTelemetryService } from '../telemetry/ai-telemetry.service';
import { buildLangfuseSession } from '../telemetry/langfuse-session';
import { getAiLangfuseTracer } from '../../../../infrastructure/telemetry/telemetry';

const EMBEDDING_DIMENSIONS = 1536;

/**
 * EmbeddingService — single source of truth for vector embeddings across
 * the backend. 1 536-dim vectors via the AI gateway (text-embedding-3-small).
 *
 * Consumers:
 *   • KnowledgeBaseService / IngestionService — KB RAG content embeddings
 *   • DeskMemoryService / DeskMemoryWriterService — desk-memory semantic search
 *
 * Lives under ai/infrastructure/providers/ alongside StructuredOutputService
 * and the AI Gateway provider so any future consumer (analytics, search,
 * recommendations) finds it in the obvious place.
 *
 * Cost telemetry: callers that supply `aiContext` land a row in
 * `ai_invocations` with `surface: 'EMBEDDING' | 'KB_INGEST' |
 * 'MEMORY_EXTRACT'`. `completionTokens` is always 0 for embeddings.
 * Telemetry is fire-and-forget — a recording failure never fails the
 * embedding call.
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  readonly dimensions = EMBEDDING_DIMENSIONS;

  constructor(private readonly aiTelemetry: AiTelemetryService) {}

  async embedText(text: string, aiContext?: AiCallContext): Promise<number[]> {
    const startedAt = Date.now();
    const result: any = await embed({
      model: aiEmbedding('embedding'),
      value: text,
      ...this.telemetryFor(aiContext),
    });
    const tokens = this.readTokens(result?.usage);
    void this.record(aiContext, tokens, Date.now() - startedAt, AiInvocationStatus.OK);
    return result.embedding;
  }

  async embedBatch(texts: string[], aiContext?: AiCallContext): Promise<number[][]> {
    const startedAt = Date.now();
    const result: any = await embedMany({
      model: aiEmbedding('embedding'),
      values: texts,
      ...this.telemetryFor(aiContext),
    });
    const tokens = this.readTokens(result?.usage);
    void this.record(aiContext, tokens, Date.now() - startedAt, AiInvocationStatus.OK);
    return result.embeddings;
  }

  /**
   * Langfuse `experimental_telemetry` for an embedding call. Groups the trace
   * under the same session as the cost ledger (e.g. `kb_document:<id>`) and
   * pins the isolated Langfuse tracer so only AI spans export. Returns an empty
   * object when there's no attribution context or Langfuse isn't configured.
   */
  private telemetryFor(aiContext?: AiCallContext): { experimental_telemetry?: Record<string, unknown> } {
    if (!aiContext) return {};
    const tracer = getAiLangfuseTracer();
    if (!tracer) return {};
    const { sessionId, userId, tags } = buildLangfuseSession(aiContext);
    return {
      experimental_telemetry: {
        isEnabled: true,
        functionId: aiContext.surface,
        tracer,
        metadata: { sessionId, userId, tags },
      },
    };
  }

  /**
   * Pull the token count off the AI SDK embed response. Different SDK
   * versions surface it as `tokens` or `inputTokens`; read both
   * defensively.
   */
  private readTokens(usage: unknown): number {
    if (!usage || typeof usage !== 'object') return 0;
    const u = usage as Record<string, unknown>;
    const candidate = u.tokens ?? u.inputTokens ?? u.promptTokens ?? 0;
    return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : 0;
  }

  private async record(
    aiContext: AiCallContext | undefined,
    tokens: number,
    latencyMs: number,
    status: AiInvocationStatus,
  ): Promise<void> {
    if (!aiContext) return;
    try {
      await this.aiTelemetry.record(
        {
          provider: EMBEDDING_PROVIDER_LABEL,
          model: EMBEDDING_MODEL_ID,
          promptTokens: tokens,
          completionTokens: 0,
          totalTokens: tokens,
          latencyMs,
          status,
        },
        aiContext,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Embedding telemetry record failed (${aiContext.surface}): ${msg}`);
    }
  }
}
