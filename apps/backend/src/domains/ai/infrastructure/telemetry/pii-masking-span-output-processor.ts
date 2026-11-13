import type { AnySpan, SpanOutputProcessor } from '@mastra/core/observability';
import { maskPiiDeep } from '@appshore/kernel/shared/utils/pii-mask';

/**
 * Mastra span output processor that strips phones and emails from agent spans before any exporter (Langfuse) sees
 * them. Mastra runs processors ahead of export, so this is the one choke point for agent inputs and outputs; the
 * AI SDK path is masked separately by `PiiMaskingLangfuseSpanProcessor` (docs/standards/observability.md, rule 12).
 *
 * Mastra hands processors the live span and expects it back (its own SensitiveDataFilter works the same way), so
 * the fields are reassigned in place. The span exists only for telemetry, never for agent logic, so later readers
 * seeing the masked values is intended.
 */
export class PiiMaskingSpanOutputProcessor implements SpanOutputProcessor {
  readonly name = 'pii-masking';

  process(span?: AnySpan): AnySpan | undefined {
    if (!span) return span;
    span.input = maskPiiDeep(span.input);
    span.output = maskPiiDeep(span.output);
    span.attributes = maskPiiDeep(span.attributes);
    span.metadata = maskPiiDeep(span.metadata);
    span.errorInfo = maskPiiDeep(span.errorInfo);
    return span;
  }

  async shutdown(): Promise<void> {}
}
