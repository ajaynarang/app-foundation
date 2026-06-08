import { Injectable, Logger } from '@nestjs/common';
import { AiInvocationStatus } from '@prisma/client';
import { generateText, Output, type LanguageModel } from 'ai';
import type { ZodSchema } from 'zod';
import type { AiCallContext, ModelAlias } from '@sally/shared-types';
import { ai, MODEL_ID_BY_ALIAS, PROVIDER_BY_ALIAS } from './ai-provider';
import { AiTelemetryService } from '../telemetry/ai-telemetry.service';
import { redactMessages } from '../redaction/pii-redactor';
import { buildLangfuseSession } from '../telemetry/langfuse-session';
import { getAiLangfuseTracer } from '../../../../infrastructure/telemetry/telemetry';

interface ExtractOptions {
  messages: any[];
  schema: ZodSchema;
  modelAlias: ModelAlias;
  systemPrompt: string;
  timeoutMs: number;
  /** Optional pre-built model — bypasses the alias lookup when provided */
  model?: LanguageModel;
  /**
   * Cost-telemetry context. When supplied, every model call (including the
   * primary attempt and any fallback retry that the caller decides to make)
   * lands an `AiInvocation` row with attribution back to the caller's
   * surface + linkRef. Omitting `aiContext` skips telemetry — useful only
   * for paths that haven't been wired yet. See PR 2 of the AI Cost
   * Telemetry plan for the rollout schedule.
   *
   * Callers are responsible for chaining `parentInvocationId` on retries:
   * pass the primary attempt's returned `aiInvocationId` as
   * `aiContext.parentInvocationId` for the fallback call so the ledger
   * stitches together a primary→fallback chain.
   */
  aiContext?: AiCallContext;
  /**
   * When true (and `aiContext` is present), enforce the tenant's hard cost
   * budget BEFORE the model call — a tenant over its hard cap gets an
   * `AiBudgetExceededError` thrown instead of an LLM call. Use on
   * user-facing, billable surfaces (document parsing, desk steps). Leave
   * false for non-user-facing surfaces (memory extraction) that should
   * degrade silently rather than hard-fail. Chat enforces separately in
   * the Mastra path.
   */
  enforceBudget?: boolean;
}

interface ExtractResult<T> {
  object: T | null;
  /**
   * UUID of the `AiInvocation` row recorded for this call, when
   * `aiContext` was supplied. Use it to stamp `linkRefId` on a downstream
   * row (e.g. `DeskEpisodeStep.aiInvocationId`) and to set
   * `parentInvocationId` on a fallback retry.
   */
  aiInvocationId?: string;
}

@Injectable()
export class StructuredOutputService {
  private readonly logger = new Logger(StructuredOutputService.name);

  constructor(private readonly aiTelemetry: AiTelemetryService) {}

  async extract<T>(options: ExtractOptions): Promise<ExtractResult<T>> {
    // Hard-cap enforcement BEFORE we spend a model call. assertBudget throws
    // AiBudgetExceededError on hard; the caller's existing failure path turns
    // that into the surface-appropriate fallback (failed job, failed step).
    // We do NOT record a ledger row for a blocked call — no tokens were spent.
    if (options.enforceBudget && options.aiContext) {
      await this.aiTelemetry.assertBudget(options.aiContext.tenantId);
    }

    // Zero-data-retention gate — applies to ANY tenant-attributed call (not
    // just budget-enforced ones); it's a compliance control, not opt-in. A
    // ZDR-flagged tenant with no compliant route for this tier is blocked
    // (fail-closed) before the prompt leaves the building.
    if (options.aiContext) {
      await this.aiTelemetry.assertZeroRetention(options.aiContext.tenantId, options.modelAlias);
    }

    const model = options.model ?? ai(options.modelAlias);
    const provider = this.providerFor(options.modelAlias);
    const startedAt = Date.now();

    // Redact allowlisted PII field names from the structured payload before
    // it leaves the building. Field-name based only — free text is out of
    // scope (see pii-redactor.ts). Cheap deep-copy; safe for every call.
    const messages = redactMessages(options.messages);

    // Cast to any — Output.object() with ZodSchema triggers TS2589
    // (excessively deep type instantiation). The runtime behavior is correct.
    const output = (Output as any).object({ schema: options.schema });

    let usagePayload: { promptTokens: number; completionTokens: number; cachedTokens: number | undefined } | null =
      null;
    let outcome: AiInvocationStatus = AiInvocationStatus.OK;
    let errorCode: string | undefined;

    // Build Langfuse `experimental_telemetry` metadata when env is
    // configured and the caller supplied attribution context. This makes
    // raw-SDK surfaces (ratecon, fuel-receipt, memory extract) appear in
    // Langfuse alongside Mastra agent traces. When env vars are unset the
    // AI SDK silently drops the metadata.
    const telemetryMetadata = this.buildLangfuseTelemetry(options);

    try {
      const result: any = await (generateText as any)({
        model,
        system: options.systemPrompt,
        messages,
        output,
        abortSignal: AbortSignal.timeout(options.timeoutMs),
        ...(telemetryMetadata ? { experimental_telemetry: telemetryMetadata } : {}),
      });

      usagePayload = this.extractUsage(result);
      const aiInvocationId = await this.recordTelemetry(
        options,
        provider,
        usagePayload,
        Date.now() - startedAt,
        outcome,
        errorCode,
      );

      const objectResult = (result.output as T) ?? null;
      return { object: objectResult, ...(aiInvocationId ? { aiInvocationId } : {}) };
    } catch (err) {
      const isTimeout = err instanceof Error && (err.name === 'AbortError' || /timeout/i.test(err.message));
      outcome = isTimeout ? AiInvocationStatus.TIMEOUT : AiInvocationStatus.ERROR;
      errorCode = err instanceof Error ? err.name : 'UnknownError';

      // Record the failed attempt too — we want errors visible in the cost
      // ledger so dashboards can show error rate by surface. Token counts
      // are zero when the call never returned.
      const aiInvocationId = await this.recordTelemetry(
        options,
        provider,
        usagePayload,
        Date.now() - startedAt,
        outcome,
        errorCode,
      );

      // Re-throw so callers' existing retry/fallback logic keeps working.
      // The thrown error type is unchanged from prior behavior; we just
      // stamp the invocation id onto it so callers can join the failed
      // ledger row when they handle the throw.
      if (aiInvocationId && err && typeof err === 'object') {
        (err as Record<string, unknown>).aiInvocationId = aiInvocationId;
      }
      throw err;
    }
  }

  /**
   * Pull provider/usage shape off the AI SDK result. Different providers
   * surface usage slightly differently (`promptTokens`/`completionTokens` on
   * AI SDK v3, `inputTokens`/`outputTokens` on some shapes). Reading both
   * keeps the wrapper robust to upgrades.
   */
  private extractUsage(
    result: any,
  ): { promptTokens: number; completionTokens: number; cachedTokens: number | undefined } | null {
    const usage = result?.usage ?? result?.totalUsage;
    if (!usage) return null;
    const promptTokens = usage.promptTokens ?? usage.inputTokens ?? 0;
    const completionTokens = usage.completionTokens ?? usage.outputTokens ?? 0;
    const cachedTokens =
      usage.cachedPromptTokens ?? usage.cacheReadInputTokens ?? usage.promptTokensCached ?? undefined;
    return { promptTokens, completionTokens, cachedTokens };
  }

  /**
   * Coarse provider label for the ledger. Sourced from `ai-provider.ts` so
   * a provider change updates one place.
   */
  private providerFor(modelAlias: ModelAlias): string {
    return PROVIDER_BY_ALIAS[modelAlias];
  }

  private async recordTelemetry(
    options: ExtractOptions,
    provider: string,
    usage: { promptTokens: number; completionTokens: number; cachedTokens: number | undefined } | null,
    latencyMs: number,
    status: AiInvocationStatus,
    errorCode: string | undefined,
  ): Promise<string | undefined> {
    if (!options.aiContext) return undefined;
    try {
      const promptTokens = usage?.promptTokens ?? 0;
      const completionTokens = usage?.completionTokens ?? 0;
      const row = await this.aiTelemetry.record(
        {
          provider,
          model: this.modelStringFor(options.modelAlias),
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
          cachedTokens: usage?.cachedTokens,
          latencyMs,
          status,
          errorCode,
        },
        options.aiContext,
      );
      return row.id;
    } catch (err) {
      // Telemetry must never break the underlying AI call. Log and continue.
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`AI telemetry record failed (${options.aiContext.surface}): ${msg}`);
      return undefined;
    }
  }

  /**
   * Build the AI SDK `experimental_telemetry` payload for Langfuse. When
   * `LANGFUSE_SECRET_KEY` is unset the isolated Langfuse tracer is absent, so
   * we skip the export; when it's set the call shows up in Langfuse grouped by
   * session, so the super-admin AI Spend view can deep-link from a Postgres
   * row to its Langfuse session.
   *
   * Uses the PLAIN `sessionId`/`userId`/`tags` metadata keys (the OTel span
   * processor ignores the legacy `langfuseSessionId` key) via the shared
   * `buildLangfuseSession` helper, and pins the isolated Langfuse tracer so
   * only model calls — not every auto-instrumented span — reach Langfuse.
   *
   * Returns undefined when no `aiContext` is supplied — callers without
   * attribution skip both the Postgres ledger AND Langfuse export.
   */
  private buildLangfuseTelemetry(options: ExtractOptions): Record<string, unknown> | undefined {
    if (!options.aiContext) return undefined;
    const tracer = getAiLangfuseTracer();
    if (!tracer) return undefined;

    const { surface, agentId } = options.aiContext;
    const { sessionId, userId, tags } = buildLangfuseSession(options.aiContext);
    return {
      isEnabled: true,
      functionId: agentId ?? surface,
      tracer,
      metadata: { sessionId, userId, tags },
    };
  }

  /**
   * Map the alias to a stable model id for the ledger via the canonical
   * `MODEL_ID_BY_ALIAS` map in `ai-provider.ts`. Aliases keep callers
   * decoupled from specific model versions; the ledger preserves the
   * alias→version snapshot so cost reconciliation survives a model bump.
   */
  private modelStringFor(modelAlias: ModelAlias): string {
    return MODEL_ID_BY_ALIAS[modelAlias] ?? modelAlias;
  }
}
