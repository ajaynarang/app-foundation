import { LangfuseSpanProcessor, type LangfuseSpanProcessorParams, type MaskFunction } from '@langfuse/otel';
import type { Attributes, AttributeValue } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { maskPii, maskPiiDeep } from '../../shared/utils/pii-mask';

/** Masks the `langfuse.*` input, output and metadata attributes Langfuse hands to its `mask` hook. */
export const maskLangfuseData: MaskFunction = ({ data }) => maskPiiDeep(data);

function maskAttributeValue(value: AttributeValue | undefined): AttributeValue | undefined {
  if (typeof value === 'string') return maskPii(value);
  if (Array.isArray(value)) {
    return value.map((item: unknown) => (typeof item === 'string' ? maskPii(item) : item)) as AttributeValue;
  }
  return value;
}

export function maskSpanAttributesInPlace(attributes: Attributes): void {
  for (const key of Object.keys(attributes)) {
    attributes[key] = maskAttributeValue(attributes[key]);
  }
}

/**
 * A LangfuseSpanProcessor whose exports carry no phones or emails.
 *
 * Langfuse's own `mask` hook only sees the `langfuse.*` attributes, but AI SDK spans carry the prompt and completion
 * in `ai.prompt*`, `ai.response.*` and `gen_ai.*` attributes, which Langfuse maps to input and output server-side.
 * So every string attribute, every event attribute (`exception.message`) and the status message are masked before
 * the span reaches the exporter (docs/standards/observability.md,
 * rule 12). It lives beside `telemetry.ts` because that is where the isolated Langfuse provider is built.
 */
export class PiiMaskingLangfuseSpanProcessor extends LangfuseSpanProcessor {
  constructor(params?: LangfuseSpanProcessorParams) {
    super({ ...params, mask: params?.mask ?? maskLangfuseData });
  }

  override onEnd(span: ReadableSpan): void {
    maskSpanAttributesInPlace(span.attributes);
    // A provider error that echoes the prompt lands in an event (`recordException`) or the status message.
    for (const event of span.events) {
      if (event.attributes) maskSpanAttributesInPlace(event.attributes);
    }
    if (span.status.message) {
      // ReadableSpan types the status readonly; the SDK span holds it as a plain field, read at export.
      (span.status as { message?: string }).message = maskPii(span.status.message);
    }
    super.onEnd(span);
  }
}
