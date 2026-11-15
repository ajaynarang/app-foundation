import type { AnySpan } from '@mastra/core/observability';
import { PiiMaskingSpanOutputProcessor } from '../pii-masking-span-output-processor';

describe('PiiMaskingSpanOutputProcessor', () => {
  it('masks agent input, output, attributes, metadata and error info', () => {
    const span = {
      input: { messages: [{ role: 'user', content: 'Call me on +15551234567 or mail ana@example.com' }] },
      output: { text: 'Done, emailed ana@example.com' },
      attributes: { model: 'test-model', toolArgs: { phone: '+15551234567' } },
      metadata: { tenantId: 'tenant_42' },
      errorInfo: { message: 'SMS to 555-123-4567 failed' },
    } as unknown as AnySpan;

    const masked = new PiiMaskingSpanOutputProcessor().process(span);

    expect(masked).toMatchObject({
      input: { messages: [{ role: 'user', content: 'Call me on <PHONE> or mail <EMAIL>' }] },
      output: { text: 'Done, emailed <EMAIL>' },
      attributes: { model: 'test-model', toolArgs: { phone: '<PHONE>' } },
      metadata: { tenantId: 'tenant_42' },
      errorInfo: { message: 'SMS to <PHONE> failed' },
    });
  });

  it('masks a tool result held as a class instance', () => {
    class ContactLookupResult {
      constructor(
        readonly name: string,
        readonly phone: string,
      ) {}
    }
    const span = { output: new ContactLookupResult('Ana', '+15551234567') } as unknown as AnySpan;

    expect(new PiiMaskingSpanOutputProcessor().process(span)?.output).toEqual({ name: 'Ana', phone: '<PHONE>' });
  });

  it('passes an absent span through', () => {
    expect(new PiiMaskingSpanOutputProcessor().process(undefined)).toBeUndefined();
  });
});
