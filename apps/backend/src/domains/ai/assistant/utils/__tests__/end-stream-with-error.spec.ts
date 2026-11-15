import { BadRequestException, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { Request, Response } from 'express';
import * as errorTracking from '@appshore/kernel/infrastructure/error-tracking/sentry';
import { endStreamWithError } from '../end-stream-with-error';

const req = { url: '/api/v1/ai/chat', method: 'POST' } as Request;

function fakeResponse({ headersSent = false, writableEnded = false } = {}) {
  const res: any = { headersSent, writableEnded, removeHeader: jest.fn(), setHeader: jest.fn(), write: jest.fn() };
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res as Response & { write: jest.Mock; json: jest.Mock };
}

describe('endStreamWithError and the error tracker', () => {
  const logger = { error: jest.fn() };
  let report: jest.SpyInstance;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    report = jest.spyOn(errorTracking, 'reportError').mockImplementation(() => undefined);
    logger.error.mockReset();
  });

  afterEach(() => jest.restoreAllMocks());

  it('after the stream began, reports a 5xx once beside the terminal frame, tagged http', () => {
    const res = fakeResponse({ headersSent: true });
    const err = new ServiceUnavailableException('AI is not configured');

    endStreamWithError(req, res, err, logger, 'Chat failed');

    expect(res.write).toHaveBeenCalledTimes(1);
    expect(String(res.write.mock.calls[0][0])).toMatch(/^x:/);
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith(err, { source: 'http' });
  });

  it('after the stream began, does not report a 4xx frame', () => {
    endStreamWithError(req, fakeResponse({ headersSent: true }), new BadRequestException('nope'), logger, 'x');

    expect(report).not.toHaveBeenCalled();
  });

  it('before the first byte, leaves the report to the envelope writer (no second call here)', () => {
    const res = fakeResponse();

    endStreamWithError(req, res, new Error('boom'), logger, 'x');

    expect(res.json).toHaveBeenCalled();
    expect(res.write).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });
});
