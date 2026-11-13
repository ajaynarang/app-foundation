import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { AiInvocationStatus } from '@appshore/db';
import { embed, embedMany } from 'ai';
import type { AiCallContext } from '@app/shared-types';

import { AiRouteResolver } from '../../routing/ai-route-resolver.service';
import { EMBEDDING_CATALOG } from '../../routing/model-catalog';
import type { ResolvedRoute } from '../../routing/routing.types';
import { AiTelemetryService } from '../telemetry/ai-telemetry.service';
import { buildLangfuseSession } from '../telemetry/langfuse-session';
import {
  isProviderCreditRefusal,
  logPlatformCreditRefusal,
  mapProviderRefusal,
} from '../telemetry/ai-provider-credit-refused.error';
import { getAiLangfuseTracer } from '@appshore/kernel/infrastructure/telemetry/telemetry';

/**
 * What the text is for. Embed v4 is asymmetric: text that is stored embeds as a `document`, text that looks it up as
 * a `query`. Mixing them up silently degrades retrieval, so every call names one.
 */
export type EmbeddingIntent = 'document' | 'query';

const INPUT_TYPE: Record<EmbeddingIntent, 'search_document' | 'search_query'> = {
  document: 'search_document',
  query: 'search_query',
};

/**
 * EmbeddingService: the one way to turn text into a vector. Every call takes its model from the route resolver, so
 * the tenant's retention policy and configuration are enforced in one place: a zero-retention tenant with no
 * zero-retention embedding route is refused before its text leaves (`ZeroRetentionUnavailable`), and a deployment
 * with no embedding route answers `AiNotConfigured`. Every route serves Cohere Embed v4 at 1536 dimensions.
 *
 * - `embedText` / `embedBatch`: tenant content. `aiContext` (the tenant to route by and to bill) and an intent are
 *   required. Each call lands one ledger row with the route that served it; a failed provider call lands an ERROR row.
 * - `embedForPlatform`: platform-owned content with no tenant (the global knowledge base), with an intent. The
 *   platform route, standard retention, and no tenant ledger row. Never use it for tenant content.
 *
 * Every vector is dimension-checked before it is returned: two tables carry `vector(1536)`, and a wrong-size write
 * is corruption. Consumers: the knowledge base (ingest and search) and Desk memory (write, recall, re-embed).
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  readonly dimensions = EMBEDDING_CATALOG.dimensions;

  constructor(
    private readonly aiTelemetry: AiTelemetryService,
    private readonly aiRouteResolver: AiRouteResolver,
  ) {}

  async embedText(text: string, aiContext: AiCallContext, intent: EmbeddingIntent): Promise<number[]> {
    const route = await this.aiRouteResolver.resolve(aiContext.tenantId, 'embedding');
    const startedAt = Date.now();
    let result: Awaited<ReturnType<typeof embed>>;
    try {
      result = await embed({
        model: route.embeddingModel(),
        value: text,
        providerOptions: this.providerOptions(intent),
        ...this.telemetryFor(aiContext),
      });
    } catch (err) {
      void this.record(aiContext, route, 0, Date.now() - startedAt, AiInvocationStatus.ERROR);
      throw mapProviderRefusal(err, aiContext.tenantId, route);
    }
    this.assertDimensions(result.embedding);
    void this.record(aiContext, route, this.readTokens(result.usage), Date.now() - startedAt, AiInvocationStatus.OK);
    return result.embedding;
  }

  async embedBatch(texts: string[], aiContext: AiCallContext, intent: EmbeddingIntent): Promise<number[][]> {
    const route = await this.aiRouteResolver.resolve(aiContext.tenantId, 'embedding');
    const startedAt = Date.now();
    let result: Awaited<ReturnType<typeof embedMany>>;
    try {
      result = await embedMany({
        model: route.embeddingModel(),
        values: texts,
        providerOptions: this.providerOptions(intent),
        ...this.telemetryFor(aiContext),
      });
    } catch (err) {
      void this.record(aiContext, route, 0, Date.now() - startedAt, AiInvocationStatus.ERROR);
      throw mapProviderRefusal(err, aiContext.tenantId, route);
    }
    for (const embedding of result.embeddings) this.assertDimensions(embedding);
    void this.record(aiContext, route, this.readTokens(result.usage), Date.now() - startedAt, AiInvocationStatus.OK);
    return result.embeddings;
  }

  /**
   * Platform-owned content only (the global knowledge base): `document` to store it, `query` for an operator tool
   * searching it with no tenant (`pnpm kb:eval`). Tenant content and tenant queries never go here.
   */
  async embedForPlatform(texts: string[], intent: EmbeddingIntent): Promise<number[][]> {
    const route = this.aiRouteResolver.resolvePlatform('embedding');
    let result: Awaited<ReturnType<typeof embedMany>>;
    try {
      result = await embedMany({
        model: route.embeddingModel(),
        values: texts,
        providerOptions: this.providerOptions(intent),
      });
    } catch (err) {
      // No workspace to pin a budget error on: the ingest reports the failure; the platform's balance is logged.
      if (isProviderCreditRefusal(err)) logPlatformCreditRefusal(route, null, err);
      throw err;
    }
    for (const embedding of result.embeddings) this.assertDimensions(embedding);
    return result.embeddings;
  }

  /**
   * The input type and dimension, under both provider keys: each provider reads its own (`cohere` direct, `bedrock`
   * for the zero-retention route) and ignores the other.
   */
  private providerOptions(intent: EmbeddingIntent): Record<string, Record<string, string | number>> {
    const options = { inputType: INPUT_TYPE[intent], outputDimension: EMBEDDING_CATALOG.dimensions };
    return { cohere: options, bedrock: options };
  }

  private assertDimensions(embedding: number[]): void {
    if (!Array.isArray(embedding) || embedding.length !== this.dimensions) {
      const got = Array.isArray(embedding) ? embedding.length : typeof embedding;
      throw new InternalServerErrorException(`Embedding dimension mismatch: got ${got}, expected ${this.dimensions}`);
    }
  }

  /**
   * Langfuse `experimental_telemetry` for an embedding call. Groups the trace under the same session as the cost
   * ledger and pins the isolated Langfuse tracer so only AI spans export. Empty when Langfuse is not configured.
   */
  private telemetryFor(aiContext: AiCallContext): { experimental_telemetry?: Record<string, unknown> } {
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

  /** The token count off the AI SDK embed response; SDK versions name it `tokens` or `inputTokens`. */
  private readTokens(usage: unknown): number {
    if (!usage || typeof usage !== 'object') return 0;
    const u = usage as Record<string, unknown>;
    const candidate = u.tokens ?? u.inputTokens ?? u.promptTokens ?? 0;
    return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : 0;
  }

  /** One ledger row per call. A recording failure is logged and never fails the embedding. */
  private async record(
    aiContext: AiCallContext,
    route: ResolvedRoute,
    tokens: number,
    latencyMs: number,
    status: AiInvocationStatus,
  ): Promise<void> {
    try {
      await this.aiTelemetry.record(
        {
          provider: route.providerLabel,
          model: route.embeddingModelId(),
          routeId: route.routeId,
          credentialType: route.credentialType,
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
