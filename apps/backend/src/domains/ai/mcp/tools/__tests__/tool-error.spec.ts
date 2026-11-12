import { ConflictException, ForbiddenException, HttpException, Logger, NotFoundException } from '@nestjs/common';
import { TOOL_FAILED_MESSAGE, toolFailure } from '../tool-error';

describe('toolFailure: what a model or an external agent sees when a tool fails', () => {
  const logger = { error: jest.fn() } as unknown as Logger;

  it.each([
    [new NotFoundException('That ticket was not found'), 'NOT_FOUND'],
    [new ConflictException('This ticket was just updated'), 'INVALID_STATE'],
    [new ForbiddenException('Only an owner can do that'), 'FORBIDDEN'],
    [new HttpException('Teapot', 418), 'VALIDATION_FAILED'],
  ])("passes an HttpException's user-facing message through with its code", (error, code) => {
    expect(toolFailure(error, logger, 't')).toEqual({ error: error.message, code });
  });

  it('keeps a code the exception names itself, and reads the envelope detail', () => {
    expect(toolFailure(new ConflictException({ message: 'Stale', code: 'STALE' }), logger, 't')).toEqual({
      error: 'Stale',
      code: 'STALE',
    });
    expect(toolFailure(new ConflictException({ code: 'STALE', detail: 'Refresh and try again' }), logger, 't')).toEqual(
      { error: 'Refresh and try again', code: 'STALE' },
    );
  });

  it('never leaks anything else: logs the detail, answers generically', () => {
    expect(toolFailure(new Error('P2002 unique constraint on users.email'), logger, 'create-thing')).toEqual({
      error: TOOL_FAILED_MESSAGE,
      code: 'TOOL_FAILED',
    });
    expect(toolFailure({ weird: true }, logger, 'x')).toEqual({ error: TOOL_FAILED_MESSAGE, code: 'TOOL_FAILED' });
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('P2002'), expect.any(String));
  });
});
