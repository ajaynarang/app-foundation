import { BasicTracerProvider, InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import type { LangfuseSpanProcessorParams } from '@langfuse/otel';
import {
  maskLangfuseData,
  maskSpanAttributesInPlace,
  PiiMaskingLangfuseSpanProcessor,
} from '../pii-masking-langfuse-span-processor';

const SAMPLE_PROMPT = 'Text Jose at +15551234567 or jose@example.com that order 4815162342 is ready';
const MASKED_PROMPT = 'Text Jose at <PHONE> or <EMAIL> that order 4815162342 is ready';

describe('maskLangfuseData', () => {
  it('masks a Langfuse observation input string', () => {
    expect(maskLangfuseData({ data: SAMPLE_PROMPT })).toBe(MASKED_PROMPT);
  });

  it('masks nested chat messages', () => {
    expect(maskLangfuseData({ data: [{ role: 'user', content: SAMPLE_PROMPT }] })).toEqual([
      { role: 'user', content: MASKED_PROMPT },
    ]);
  });
});

describe('maskSpanAttributesInPlace', () => {
  it('masks AI SDK prompt and response attributes and leaves numbers alone', () => {
    const attributes = {
      'ai.prompt': JSON.stringify({ prompt: SAMPLE_PROMPT }),
      'ai.response.text': 'Sent to (555) 987-6543',
      'gen_ai.usage.input_tokens': 120,
      'ai.prompt.tools': ['look up a contact by phone 555-111-2222'],
      'ai.telemetry.metadata.langfuseUserId': 'tenant:42',
    };

    maskSpanAttributesInPlace(attributes);

    expect(JSON.parse(attributes['ai.prompt']).prompt).toBe(MASKED_PROMPT);
    expect(attributes['ai.response.text']).toBe('Sent to <PHONE>');
    expect(attributes['gen_ai.usage.input_tokens']).toBe(120);
    expect(attributes['ai.prompt.tools']).toEqual(['look up a contact by phone <PHONE>']);
    expect(attributes['ai.telemetry.metadata.langfuseUserId']).toBe('tenant:42');
  });
});

describe('PiiMaskingLangfuseSpanProcessor', () => {
  async function exportOneSpan(
    attributes: Record<string, string>,
    params: Partial<LangfuseSpanProcessorParams> = {},
  ): Promise<Record<string, unknown>> {
    const exporter = new InMemorySpanExporter();
    const provider = new BasicTracerProvider({
      spanProcessors: [
        new PiiMaskingLangfuseSpanProcessor({
          exporter,
          exportMode: 'immediate',
          shouldExportSpan: () => true,
          ...params,
        }),
      ],
    });
    const span = provider.getTracer('ai').startSpan('ai.generateText');
    span.setAttributes(attributes);
    span.end();
    await provider.forceFlush();
    const [exported] = exporter.getFinishedSpans();
    await provider.shutdown();
    return { ...exported.attributes };
  }

  it('masks AI SDK prompt attributes on the exported span', async () => {
    const exported = await exportOneSpan({ 'ai.prompt': JSON.stringify({ prompt: SAMPLE_PROMPT }) });

    expect(JSON.parse(exported['ai.prompt'] as string)).toEqual({ prompt: MASKED_PROMPT });
  });

  it('runs the PII mask through the Langfuse mask hook for observation input', async () => {
    const exported = await exportOneSpan({ 'langfuse.observation.input': SAMPLE_PROMPT });

    expect(exported['langfuse.observation.input']).toBe(MASKED_PROMPT);
  });

  it('keeps a caller-supplied mask hook', async () => {
    const exported = await exportOneSpan({ 'langfuse.observation.output': 'anything' }, { mask: () => '<REDACTED>' });

    expect(exported['langfuse.observation.output']).toBe('<REDACTED>');
  });
});
