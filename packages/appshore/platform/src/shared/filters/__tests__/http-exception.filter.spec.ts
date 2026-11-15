import { HttpStatus, type ArgumentsHost } from '@nestjs/common';
import { Prisma } from '@appshore/db';
import { HttpExceptionFilter } from '../http-exception.filter';

function hostFor(url: string) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status, removeHeader: jest.fn(), setHeader: jest.fn() }),
      getRequest: () => ({ url, method: 'GET' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('inconsistent column data', { code, clientVersion: '7.3.0' });

describe('HttpExceptionFilter — Prisma request errors', () => {
  it('a value the column cannot hold (P2007: a non-uuid id or a forged cursor) is a 400, never a 500', () => {
    const { host, status, json } = hostFor('/api/v1/admin/events?cursor=forged');
    new HttpExceptionFilter().catch(prismaError('P2007'), host);
    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        code: 'VALIDATION_FAILED',
        detail: 'A value in this request is not in the expected format.',
      }),
    );
  });

  it('a missing record (P2025) stays a 404', () => {
    const { host, status } = hostFor('/api/v1/things/x');
    new HttpExceptionFilter().catch(prismaError('P2025'), host);
    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
  });
});
