import { Injectable, InternalServerErrorException, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { PostgresStore } from '@mastra/pg';
import { Observability } from '@mastra/observability';
import { LangfuseExporter } from '@mastra/langfuse';
import type { RequestContext } from '@mastra/core/request-context';
import type { LanguageModel } from 'ai';
import { REQUEST_MODEL_KEY } from '../../routing/request-model-key';
import { PiiMaskingSpanOutputProcessor } from '../../infrastructure/telemetry/pii-masking-span-output-processor';

/**
 * Per-request model: agents own no model. Every call site resolves the tenant's route
 * (`AiRouteResolver.resolve(tenantId, 'language')`) and passes the alias's model in the request context under
 * `REQUEST_MODEL_KEY`. A call without one is a routing bypass, so it fails loud (a clean 500) instead of falling back
 * to any default provider.
 */
export const perRequestModel = ({ requestContext }: { requestContext: RequestContext }): LanguageModel => {
  // RequestContext<unknown> types its keys as `never`; read through a minimal structural view.
  const model = (requestContext as { get(key: string): unknown }).get(REQUEST_MODEL_KEY) as LanguageModel | undefined;
  if (!model) {
    throw new InternalServerErrorException(
      `Agent invoked without a resolved model: resolve a route and pass requestContext [${REQUEST_MODEL_KEY}]`,
    );
  }
  return model;
};

/** Lean base prompt for the generic assistant (~100 tokens). */
const BASE_ASSISTANT =
  'You are a helpful AI assistant for this application. Answer the user clearly and concisely. ' +
  'Use the tools available to you when they help answer the question. If you are unsure, say so.';

/**
 * Mastra Provider — central AI infrastructure registry.
 *
 * Creates a Mastra instance with:
 * - ONE generic `assistant` agent (extend by registering more agents here)
 * - LangFuse observability via @mastra/langfuse, with phones and emails masked before export
 * - Shared Memory with PostgresStore
 *
 * Agents own no model: each takes the one its caller resolved for the tenant (`perRequestModel`).
 * Agents get a lean base prompt. Skills are injected per-request via
 * AbstractBaseAgent.chat(). Tools are passed dynamically per-request via
 * `toolsets` (Mastra multi-tenant pattern).
 */
@Injectable()
export class MastraProvider implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MastraProvider.name);
  private mastra: Mastra | null = null;
  private store: PostgresStore | null = null;

  async onModuleInit() {
    this.logger.log('Initializing Mastra infrastructure...');

    try {
      await this.initializeMastra();
    } catch (error) {
      this.logger.error(
        'Failed to initialize Mastra AI infrastructure — AI features will be unavailable',
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- async signature reserved for future awaited init
  private async initializeMastra() {
    // Memory with PostgreSQL storage — creates its own tables, no Prisma migration needed
    this.store = new PostgresStore({
      id: 'app-ai-memory',
      connectionString: process.env.DATABASE_URL,
    });

    const memory = new Memory({
      storage: this.store,
      options: {
        lastMessages: 40,
        semanticRecall: false, // Enabled in Phase 6 (#73) when embeddings are ready
      },
    });

    // Register the single generic assistant agent. Skills are injected
    // per-request, not at registration. Add more agents to this map to grow
    // the assistant into a multi-agent system.
    const agents: Record<string, Agent> = {
      assistant: new Agent({
        id: 'assistant',
        name: 'Assistant',
        instructions: BASE_ASSISTANT,
        model: perRequestModel,
        memory,
      }),
    };

    // Observability — LangFuse for AI tracing (conditional on env vars)
    let observability: Observability | undefined;
    if (process.env.LANGFUSE_SECRET_KEY) {
      observability = new Observability({
        configs: {
          langfuse: {
            serviceName: process.env.OTEL_SERVICE_NAME ?? 'app-backend',
            // Rule 12: no phones or emails leave in agent spans (docs/standards/observability.md).
            spanOutputProcessors: [new PiiMaskingSpanOutputProcessor()],
            exporters: [
              new LangfuseExporter({
                publicKey: process.env.LANGFUSE_PUBLIC_KEY,
                secretKey: process.env.LANGFUSE_SECRET_KEY,
                baseUrl: process.env.LANGFUSE_BASE_URL,
              }),
            ],
          },
        },
      });
      this.logger.log('LangFuse AI observability enabled via Mastra');
    }

    this.mastra = new Mastra({
      agents,
      storage: this.store,
      ...(observability && { observability }),
    });

    this.logger.log(`Mastra initialized with ${Object.keys(agents).length} agents`);
  }

  async onModuleDestroy() {
    if (this.mastra) {
      await this.mastra.shutdown();
      this.logger.log('Mastra shut down');
    }
    await this.store?.close();
  }

  getMastra(): Mastra {
    if (!this.mastra) throw new Error('Mastra not initialized');
    return this.mastra;
  }
}
