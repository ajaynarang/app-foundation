import { HttpException, Logger } from '@nestjs/common';
import { defaultApiErrorCode } from '@app/shared-types';

/** The generic answer when a tool fails for a reason that is not the caller's to see. */
export const TOOL_FAILED_MESSAGE = 'This action failed. Please try again.';

/** The machine code of a failure that is not an `HttpException`. */
export const TOOL_FAILED_CODE = 'TOOL_FAILED';

export interface ToolFailure {
  error: string;
  code: string;
}

/**
 * Map an error thrown inside a tool to what the model or an external agent sees. An `HttpException` carries a
 * user-facing message by contract, so it passes through with its code (the one it names, else the code its status
 * maps to). Anything else (a Prisma error, a TypeError, a vendor failure) is logged in full and answered with a
 * generic message: a raw `error.message` never leaves the server.
 */
export function toolFailure(error: unknown, logger: Logger, toolName: string): ToolFailure {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    const body = typeof response === 'object' && response !== null ? (response as Record<string, unknown>) : {};
    const named = body.code;
    const detail = typeof body.detail === 'string' ? body.detail : error.message;
    return {
      error: detail,
      code: typeof named === 'string' ? named : defaultApiErrorCode(error.getStatus()),
    };
  }
  const detail = error instanceof Error ? error : new Error(JSON.stringify(error) ?? 'unknown error');
  logger.error(`Tool "${toolName}" failed: ${detail.message}`, detail.stack);
  return { error: TOOL_FAILED_MESSAGE, code: TOOL_FAILED_CODE };
}
