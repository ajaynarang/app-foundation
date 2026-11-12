import { Injectable, Logger } from '@nestjs/common';
import { AiInvocationStatus } from '@appshore/db';
import { generateText, Output } from 'ai';
import type { ZodSchema } from 'zod';
import type { AiCallContext, ModelAlias } from '@app/shared-types';
import { AiRouteResolver } from '../../routing/ai-route-resolver.service';
import type { ResolvedRoute } from '../../routing/routing.types';
import { AiTelemetryService } from '../telemetry/ai-telemetry.service';
import { redactMessages } from '../redaction/pii-redactor';
import { buildLangfuseSession } from '../telemetry/langfuse-session';
import { getAiLangfuseTracer } from '@appshore/kernel/infrastructure/telemetry/telemetry';

interface ExtractOptions {
  messages: any[];
  schema: ZodSchema;
  modelAlias: ModelAlias;
  systemPrompt: string;
  timeoutMs: number;
  /**
   * The ceiling on the answer's tokens. REQUIRED: unset, some routes reserve the model's whole output window, which a
   * tight per-key credit limit refuses outright. Thinking counts toward it on the 5.5 models. Size it to the answer
   * with `OUTPUT_CEILINGS` (`domains/ai/routing/output-ceilings.ts`) and name it next to the call.
   */
  maxOutputTokens: number;
  /**
   * Cost-telemetry and routing context. REQUIRED: routing is per tenant, so an unattributed call has no route to take
   * (and unattributed spend is a ledger bug). Every call lands an `AiInvocation` row with attribution back to the
   * caller's surface and linkRef.
   *
   * Callers are responsible for chaining `parentInvocationId` on retries:
   * pass the primary attempt's returned `aiInvocationId` as
   * `aiContext.parentInvocationId` for the fallback call so the ledger
   * stitches together a primary→fallback chain.
   */
  aiContext: AiCallContext;
  /**
   * When true, enforce the tenant's hard cost
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

  constructor(
    private readonly aiTelemetry: AiTelemetryService,
    private readonly aiRouteResolver: AiRouteResolver,
  ) {}

  async extract<T>(options: ExtractOptions): Promise<ExtractResult<T>> {
    // Route resolution IS the retention gate: a zero-retention tenant with no compliant route is refused
    // (fail-closed) before the prompt leaves the building, and a deployment with no language route answers
    // AiNotConfigured. No tokens are spent, so no ledger row is written.
    const route = await this.aiRouteResolver.resolve(options.aiContext.tenantId, 'language');

    // Hard-cap enforcement BEFORE we spend a model call. assertBudget throws
    // AiBudgetExceededError on hard; the caller's existing failure path turns
    // that into the surface-appropriate fallback (failed job, failed step).
    // We do NOT record a ledger row for a blocked call — no tokens were spent.
    if (options.enforceBudget) {
      await this.aiTelemetry.assertBudget(options.aiContext.tenantId);
    }

    const model = route.languageModel(options.modelAlias);
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
    // raw-SDK surfaces (document parsing, memory extract) appear in
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
        maxOutputTokens: options.maxOutputTokens,
        ...(telemetryMetadata ? { experimental_telemetry: telemetryMetadata } : {}),
      });

      usagePayload = this.extractUsage(result);
      const aiInvocationId = await this.recordTelemetry(
        options,
        route,
        usagePayload,
        Date.now() - startedAt,
        outcome,
        errorCode,
        result.response?.modelId,
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
        route,
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

  private async recordTelemetry(
    options: ExtractOptions,
    route: ResolvedRoute,
    usage: { promptTokens: number; completionTokens: number; cachedTokens: number | undefined } | null,
    latencyMs: number,
    status: AiInvocationStatus,
    errorCode: string | undefined,
    answeredByModelId?: string,
  ): Promise<string | undefined> {
    try {
      const promptTokens = usage?.promptTokens ?? 0;
      const completionTokens = usage?.completionTokens ?? 0;
      const row = await this.aiTelemetry.record(
        {
          provider: route.providerLabel,
          // A refused call that fell back one alias up was answered (and billed)
          // by the fallback model, so price it as that model, on the route's own id column.
          model: route.ledgerModelIdFor(options.modelAlias, answeredByModelId),
          routeId: route.routeId,
          credentialType: route.credentialType,
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
   */
  private buildLangfuseTelemetry(options: ExtractOptions): Record<string, unknown> | undefined {
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
}
