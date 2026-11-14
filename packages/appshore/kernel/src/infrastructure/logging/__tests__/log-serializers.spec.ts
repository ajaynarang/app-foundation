import { serializeErrorForLog, serializeRequestForLog } from '../log-serializers';

describe('serializeRequestForLog', () => {
  it('drops the SSE token from req.url', () => {
    const req = serializeRequestForLog({ method: 'GET', url: '/api/v1/sse/stream?token=eyJhbGciOi.x.y', query: {} });

    expect(req.url).toBe('/api/v1/sse/stream');
  });

  it('drops the parsed query copy, which carries the same token', () => {
    const req = serializeRequestForLog({ url: '/api/v1/sse/stream?token=eyJ', query: { token: 'eyJ' } });

    expect(req.query).toBeUndefined();
    expect(JSON.stringify(req)).not.toContain('eyJ');
  });

  it('keeps the rest of the request untouched', () => {
    const req = serializeRequestForLog({ id: 7, method: 'POST', url: '/api/v1/tickets', query: {} });

    expect(req).toMatchObject({ id: 7, method: 'POST', url: '/api/v1/tickets' });
  });
});

describe('serializeErrorForLog', () => {
  it('masks a recipient echoed in the message and the stack', () => {
    const err = serializeErrorForLog({
      type: 'Error',
      message: 'Invalid recipient ops@example.com',
      stack: 'Error: Invalid recipient ops@example.com\n    at send (/app/dist/email.js:10:5)',
    });

    expect(err.message).toBe('Invalid recipient o***@example.com');
    expect(err.stack).toContain('o***@example.com');
    expect(err.stack).toContain('/app/dist/email.js:10:5');
    expect(err.type).toBe('Error');
  });

  it('leaves scoped npm paths in stack frames untouched', () => {
    const stack = [
      'Error: boom',
      '    at Router.handle (/app/node_modules/@nestjs/core/router.js:120:45)',
      '    at q (/app/node_modules/.pnpm/@prisma+client@7.3.0/node_modules/@prisma/client/runtime.js:9:1)',
    ].join('\n');

    expect(serializeErrorForLog({ type: 'Error', message: 'boom', stack }).stack).toBe(stack);
  });

  it('masks the recipient in every field of a Nodemailer SMTP error', () => {
    // pino's std serializer copies the error's enumerable props, so these all reach the log line.
    const smtpError = {
      type: 'Error',
      message: "Can't send mail - all recipients were rejected: 550 5.1.1 <ops@example.com> unknown",
      stack: 'Error: rejected\n    at SMTPConnection._actionRCPT (/app/node_modules/nodemailer/lib/smtp.js:1:1)',
      code: 'EENVELOPE',
      command: 'RCPT TO',
      responseCode: 550,
      response: '550 5.1.1 <ops@example.com>: Recipient address rejected',
      rejected: ['ops@example.com', 'billing@example.com'],
      rejectedErrors: [
        Object.assign(new Error('Recipient command failed: 550 <ops@example.com>'), { recipient: 'ops@example.com' }),
      ],
      envelope: { from: 'noreply@example.net', to: ['ops@example.com'] },
    };
    const envelope = smtpError.envelope;

    const err = serializeErrorForLog(smtpError) as unknown as typeof smtpError;
    const logged = JSON.stringify(err);

    expect(logged).not.toContain('ops@example.com');
    expect(logged).not.toContain('billing@example.com');
    expect(err.rejected).toEqual(['o***@example.com', 'b***@example.com']);
    expect(err.envelope.to).toEqual(['o***@example.com']);
    expect(err.response).toBe('550 5.1.1 <o***@example.com>: Recipient address rejected');
    expect(err.rejectedErrors[0]).toMatchObject({
      message: 'Recipient command failed: 550 <o***@example.com>',
      recipient: 'o***@example.com',
    });
    expect(err).toMatchObject({ code: 'EENVELOPE', command: 'RCPT TO', responseCode: 550 });
    // The live error's own objects are copied, not mutated.
    expect(envelope.to).toEqual(['ops@example.com']);
  });

  it('masks E.164 phones in nested props', () => {
    const err = serializeErrorForLog({ type: 'Error', message: 'x', details: { to: '+19785551234' } }) as any;

    expect(err.details.to).toBe('***1234');
  });

  it('survives a cyclic error and stops at the depth limit', () => {
    const cyclic: Record<string, unknown> = { type: 'Error', message: 'loop' };
    cyclic.self = cyclic;
    let deep: Record<string, unknown> = { leak: 'ops@example.com' };
    for (let i = 0; i < 10; i++) deep = { next: deep };

    expect((serializeErrorForLog(cyclic) as any).self).toBe('[Truncated]');
    expect(JSON.stringify(serializeErrorForLog({ type: 'Error', deep }))).not.toContain('ops@example.com');
  });

  it('tolerates errors without a message or stack', () => {
    expect(serializeErrorForLog({ type: 'Error' })).toEqual({ type: 'Error' });
  });
});
