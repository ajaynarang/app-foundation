import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { PostgresStore } from '@mastra/pg';
import { Observability } from '@mastra/observability';
import { LangfuseExporter } from '@mastra/langfuse';
import { ai } from '../../infrastructure/providers/ai-provider';

/** Lean base prompt for the generic assistant (~100 tokens). */
const BASE_ASSISTANT =
  'You are a helpful AI assistant for this application. Answer the user clearly and concisely. ' +
  'Use the tools available to you when they help answer the question. If you are unsure, say so.';

/**
 * Mastra Provider — central AI infrastructure registry.
 *
 * Creates a Mastra instance with:
 * - ONE generic `assistant` agent (extend by registering more agents here)
 * - LangFuse observability via @mastra/langfuse
 * - Shared Memory with PostgresStore
 *
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
        model: ai('standard'),
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
