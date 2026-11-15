import pino from 'pino';
import { Writable } from 'node:stream';
import { toLoggableError } from '../../queue/job-events';
import { serializeErrorForLog } from '../log-serializers';

/**
 * Runs the error serializer the way the app does. pino-http wraps the custom `err` serializer with
 * pino-std-serializers' `wrapErrorSerializer` (pino-http/logger.js), so the std `err` serializer runs first; pino
 * exports the same wrapper from the same pino-std-serializers version.
 */
function logLine(fields: Record<string, unknown>): Record<string, any> {
  const lines: string[] = [];
  const sink = new Writable({
    write(chunk, _enc, done) {
      lines.push(chunk.toString());
      done();
    },
  });
  const logger = pino({ serializers: { err: pino.stdSerializers.wrapErrorSerializer(serializeErrorForLog) } }, sink);
  logger.error(fields, 'failed');
  return JSON.parse(lines[0]);
}

class EmailNotConfiguredError extends Error {
  constructor() {
    super('No email provider is configured');
    this.name = 'EmailNotConfiguredError';
  }
}

describe('serializeErrorForLog behind the std err serializer', () => {
  it('keeps the class name of an error passed through toLoggableError', () => {
    const line = logLine({ err: toLoggableError(new EmailNotConfiguredError()) });

    expect(line.err.type).toBe('EmailNotConfiguredError');
    expect(line.err.message).toBe('No email provider is configured');
  });

  it('keeps the class name of a raw error', () => {
    expect(logLine({ err: new EmailNotConfiguredError() }).err.type).toBe('EmailNotConfiguredError');
  });

  it('still masks contact details in a toLoggableError value', () => {
    const line = logLine({ err: toLoggableError(new Error('Invalid recipient ops@example.com')) });

    expect(line.err.type).toBe('Error');
    expect(JSON.stringify(line)).not.toContain('ops@example.com');
  });

  it('describes a thrown non-Error value by its typeof', () => {
    expect(logLine({ err: toLoggableError('plain string') }).err.type).toBe('string');
  });
});
