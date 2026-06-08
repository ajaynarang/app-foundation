import { SendEmailTool } from '../send-email.tool';

describe('SendEmailTool', () => {
  let tool: SendEmailTool;
  let mockEmailService: { sendEmail: jest.Mock };

  beforeEach(() => {
    mockEmailService = {
      sendEmail: jest.fn().mockResolvedValue(undefined),
    };
    tool = new SendEmailTool(mockEmailService as any);
  });

  it('sends via EmailService on happy path and returns ok:true with messageId', async () => {
    const result = await tool.execute({
      to: 'customer@example.com',
      subject: 'Overdue invoice INV-123',
      body: 'Hi there, just a friendly reminder.',
      _tenantId: 17,
    });

    expect(mockEmailService.sendEmail).toHaveBeenCalledWith({
      to: 'customer@example.com',
      subject: 'Overdue invoice INV-123',
      text: 'Hi there, just a friendly reminder.',
      html: 'Hi there, just a friendly reminder.',
    });
    expect(result).toEqual({ ok: true, messageId: null });
  });

  it('rejects invalid email addresses (Zod validation)', async () => {
    // zod is the source of truth for the schema; parsing an invalid
    // address throws a ZodError — the tool must not silently accept it.
    const { SendEmailParamsSchema } = await import('../send-email.tool');
    expect(() =>
      SendEmailParamsSchema.parse({
        to: 'not-email',
        subject: 'Hi',
        body: 'Body',
        _tenantId: 17,
      }),
    ).toThrow();
  });

  it('requires _tenantId (schema marks it as required, not optional)', async () => {
    const { SendEmailParamsSchema } = await import('../send-email.tool');
    expect(() =>
      SendEmailParamsSchema.parse({
        to: 'customer@example.com',
        subject: 'Hi',
        body: 'Body',
      }),
    ).toThrow();
  });

  it('returns retriable=true on transient EmailService failure (5xx / timeout / ECONNRESET)', async () => {
    mockEmailService.sendEmail.mockRejectedValueOnce(new Error('Upstream 502 Bad Gateway'));
    const r502 = await tool.execute({
      to: 'customer@example.com',
      subject: 'Subject',
      body: 'Body',
      _tenantId: 17,
    });
    expect(r502.ok).toBe(false);
    expect(r502.ok === false && r502.retriable).toBe(true);

    mockEmailService.sendEmail.mockRejectedValueOnce(new Error('socket ECONNRESET'));
    const rReset = await tool.execute({
      to: 'customer@example.com',
      subject: 'Subject',
      body: 'Body',
      _tenantId: 17,
    });
    expect(rReset.ok).toBe(false);
    expect(rReset.ok === false && rReset.retriable).toBe(true);

    mockEmailService.sendEmail.mockRejectedValueOnce(new Error('Request timeout after 30s'));
    const rTimeout = await tool.execute({
      to: 'customer@example.com',
      subject: 'Subject',
      body: 'Body',
      _tenantId: 17,
    });
    expect(rTimeout.ok).toBe(false);
    expect(rTimeout.ok === false && rTimeout.retriable).toBe(true);
  });

  it('returns retriable=false on hard validation errors (e.g. invalid provider account)', async () => {
    mockEmailService.sendEmail.mockRejectedValueOnce(
      new Error('Invalid `from` address — domain not verified with provider'),
    );
    const result = await tool.execute({
      to: 'customer@example.com',
      subject: 'Subject',
      body: 'Body',
      _tenantId: 17,
    });
    expect(result).toEqual({
      ok: false,
      error: 'Invalid `from` address — domain not verified with provider',
      retriable: false,
    });
  });
});
