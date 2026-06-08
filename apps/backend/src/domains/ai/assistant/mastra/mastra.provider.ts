import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { PostgresStore } from '@mastra/pg';
import { Observability } from '@mastra/observability';
import { LangfuseExporter } from '@mastra/langfuse';
import { ai } from '../../infrastructure/providers/ai-provider';
import {
  BASE_BILLING,
  BASE_COMPLIANCE,
  BASE_CUSTOMER,
  BASE_DISPATCH,
  BASE_DRIVER,
  BASE_FUEL,
  BASE_MAINTENANCE,
  BASE_PAYROLL,
  BASE_PROSPECT,
  BASE_ROUTE,
  BASE_SAFETY,
  BASE_SUPPORT,
} from '../../../../domains/prompting/prompts/persona/base-prompts';

/**
 * Mastra Provider — central AI infrastructure registry.
 *
 * Creates a Mastra instance with:
 * - 12 domain agents (dispatch, billing, compliance, safety, route, payroll,
 *   maintenance, fuel, driver, customer, support, prospect)
 * - Extraction agents (ratecon, shield, briefing, fuel-receipt)
 * - LangFuse observability via @mastra/langfuse
 * - Shared Memory with PostgresStore
 *
 * Domain agents get lean base prompts (~300 tokens). Skills are injected
 * per-request via AbstractBaseAgent.chat(). Tools are passed dynamically
 * per-request via `toolsets` (Mastra multi-tenant pattern).
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

    // Register domain agents — skills injected per-request, not at registration
    const domainAgentDefs: Array<{
      id: string;
      model: 'fast' | 'standard';
      instructions: string;
    }> = [
      { id: 'sally-dispatch', model: 'standard', instructions: BASE_DISPATCH },
      { id: 'sally-billing', model: 'standard', instructions: BASE_BILLING },
      {
        id: 'sally-compliance',
        model: 'standard',
        instructions: BASE_COMPLIANCE,
      },
      { id: 'sally-safety', model: 'standard', instructions: BASE_SAFETY },
      { id: 'sally-route', model: 'standard', instructions: BASE_ROUTE },
      { id: 'sally-payroll', model: 'standard', instructions: BASE_PAYROLL },
      {
        id: 'sally-maintenance',
        model: 'standard',
        instructions: BASE_MAINTENANCE,
      },
      { id: 'sally-fuel', model: 'standard', instructions: BASE_FUEL },
      { id: 'sally-driver', model: 'fast', instructions: BASE_DRIVER },
      { id: 'sally-customer', model: 'fast', instructions: BASE_CUSTOMER },
      { id: 'sally-support', model: 'standard', instructions: BASE_SUPPORT },
      { id: 'sally-prospect', model: 'fast', instructions: BASE_PROSPECT },
    ];

    const agents: Record<string, Agent> = {};
    for (const def of domainAgentDefs) {
      // Chat-default agent — keeps the original ID and current model so
      // existing chat code paths are unchanged.
      agents[def.id] = new Agent({
        id: def.id,
        name: `SALLY (${def.id.replace('sally-', '')})`,
        instructions: def.instructions,
        model: ai(def.model),
        memory,
      });

      // Desk per-beat variants. Sally's Desk picks haiku for cheap beats
      // (Perceive) and sonnet for reasoning beats (Deliberate, Act). Mastra's
      // public `agent.generate()` signature has no per-call model override —
      // `AgentExecutionOptionsBase` exposes `modelSettings` (temperature etc.)
      // but not `model`. So we register two variants per domain agent and
      // InvocationService picks one by suffix (`${agentKey}-haiku` | `-sonnet`).
      agents[`${def.id}-haiku`] = new Agent({
        id: `${def.id}-haiku`,
        name: `SALLY (${def.id.replace('sally-', '')}) · haiku`,
        instructions: def.instructions,
        model: ai('fast'),
        memory,
      });
      agents[`${def.id}-sonnet`] = new Agent({
        id: `${def.id}-sonnet`,
        name: `SALLY (${def.id.replace('sally-', '')}) · sonnet`,
        instructions: def.instructions,
        model: ai('standard'),
        memory,
      });
    }

    // Non-conversational agents — structured extraction only (no memory, no tools)
    agents['sally-ratecon-parser'] = new Agent({
      id: 'sally-ratecon-parser',
      name: 'SALLY Ratecon Parser',
      instructions:
        'You are a document extraction agent for a trucking company. Extract structured data from rate confirmation documents.\n\n' +
        'CRITICAL RULES:\n' +
        '- Extract ONLY what is explicitly written in the document\n' +
        '- NEVER infer, guess, or complete partial addresses from context\n' +
        '- If a field is partially readable, extract what you can and leave unclear parts empty\n' +
        '- If city or state cannot be determined from the document text, leave them empty — do not guess\n' +
        '- For each field, honestly assess your confidence: high (clearly readable), medium (partial/abbreviated), low (mostly guessed)\n' +
        '- Return valid JSON matching the requested schema',
      model: ai('fast'),
    });

    agents['sally-ratecon-parser-standard'] = new Agent({
      id: 'sally-ratecon-parser-standard',
      name: 'SALLY Ratecon Parser (Standard)',
      instructions:
        'You are a document extraction agent for a trucking company. Extract structured data from rate confirmation documents.\n\n' +
        'CRITICAL RULES:\n' +
        '- Extract ONLY what is explicitly written in the document\n' +
        '- NEVER infer, guess, or complete partial addresses from context\n' +
        '- If a field is partially readable, extract what you can and leave unclear parts empty\n' +
        '- If city or state cannot be determined from the document text, leave them empty — do not guess\n' +
        '- For each field, honestly assess your confidence: high (clearly readable), medium (partial/abbreviated), low (mostly guessed)\n' +
        '- Return valid JSON matching the requested schema',
      model: ai('standard'),
    });

    agents['sally-ratecon-parser-powerful'] = new Agent({
      id: 'sally-ratecon-parser-powerful',
      name: 'SALLY Ratecon Parser (Powerful)',
      instructions:
        'You are a document extraction agent for a trucking company. Extract structured data from rate confirmation documents.\n\n' +
        'CRITICAL RULES:\n' +
        '- Extract ONLY what is explicitly written in the document\n' +
        '- NEVER infer, guess, or complete partial addresses from context\n' +
        '- If a field is partially readable, extract what you can and leave unclear parts empty\n' +
        '- If city or state cannot be determined from the document text, leave them empty — do not guess\n' +
        '- For each field, honestly assess your confidence: high (clearly readable), medium (partial/abbreviated), low (mostly guessed)\n' +
        '- Return valid JSON matching the requested schema',
      model: ai('powerful'),
    });

    agents['sally-alert-briefing'] = new Agent({
      id: 'sally-alert-briefing',
      name: 'SALLY Alert Briefing',
      instructions:
        'You are a fleet operations intelligence analyst. Analyze alert data and provide concise, actionable intelligence briefings. Return valid JSON matching the requested structure.',
      model: ai('fast'),
    });

    agents['sally-briefing'] = new Agent({
      id: 'sally-briefing',
      name: 'SALLY Briefing',
      instructions:
        'You are a fleet operations intelligence analyst. Analyze fleet operational data and provide a concise, actionable briefing as a prose paragraph. Return valid JSON with a single "summary" field.',
      model: ai('fast'),
    });

    agents['sally-shield-analyst'] = new Agent({
      id: 'sally-shield-analyst',
      name: 'SALLY Shield Analyst',
      instructions:
        'You are a fleet compliance analyst. Analyze fleet data and evaluate compliance rules. Return structured analysis results.',
      model: ai('fast'),
    });

    agents['sally-shield-analyst-standard'] = new Agent({
      id: 'sally-shield-analyst-standard',
      name: 'SALLY Shield Analyst (Standard)',
      instructions:
        'You are a fleet compliance analyst. Analyze fleet data and evaluate compliance rules. Return structured analysis results.',
      model: ai('standard'),
    });

    agents['sally-fuel-receipt-parser'] = new Agent({
      id: 'sally-fuel-receipt-parser',
      name: 'SALLY Fuel Receipt Parser',
      instructions:
        'You are a document extraction agent. Extract structured data from fuel receipt images accurately. Return valid JSON matching the requested schema.',
      model: ai('fast'),
    });

    agents['sally-fuel-receipt-parser-standard'] = new Agent({
      id: 'sally-fuel-receipt-parser-standard',
      name: 'SALLY Fuel Receipt Parser (Standard)',
      instructions:
        'You are a document extraction agent. Extract structured data from fuel receipt images accurately. Return valid JSON matching the requested schema.',
      model: ai('standard'),
    });

    // NOTE: The `sally-desk-dispatch` legacy agent was removed in PR-9.
    // Sally's Desk beats now run via `InvocationService` which calls the
    // Vercel AI SDK's `generateText` directly with `experimental_telemetry`
    // metadata (langfuseSessionId=episode:<uuid>, langfuseUserId=tenant:<id>).
    // The legacy agent only polluted Langfuse with a namespace that was
    // never actually used at runtime.

    // Observability — LangFuse for AI tracing (conditional on env vars)
    let observability: Observability | undefined;
    if (process.env.LANGFUSE_SECRET_KEY) {
      observability = new Observability({
        configs: {
          langfuse: {
            serviceName: process.env.OTEL_SERVICE_NAME ?? 'sally-backend',
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
