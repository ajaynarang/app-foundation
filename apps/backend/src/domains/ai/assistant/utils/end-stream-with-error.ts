import type { Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { STREAM_FRAME, type StreamErrorFrame } from '@app/shared-types';
import { errorShapeOf, writeErrorEnvelope } from '@appshore/platform/shared/filters/error-envelope';
import { ERROR_SOURCE, reportError } from '@appshore/kernel/infrastructure/error-tracking/sentry';

/**
 * End a chat stream that failed. While headers are unsent the answer is the error envelope, so a routing refusal
 * (`AiNotConfigured`, `AiCredentialFailing`, `ZeroRetentionUnavailable`, the budget) keeps its status, code and detail.
 * Once the stream has begun it writes one terminal `x:` frame `{ code, detail }` (the same code and copy the envelope
 * would carry) and nothing after it; the caller ends the response. Logged exactly once either way.
 *
 * This route writes its own response, so the exception filter never sees the error. A 5xx reaches the error tracker
 * once either way: inside `writeErrorEnvelope` for the envelope case, and here, beside the frame, for the terminal
 * case.
 */
export function endStreamWithError(
  req: Request,
  res: Response,
  error: unknown,
  logger: Pick<Logger, 'error'>,
  context: string,
): void {
  if (writeErrorEnvelope(res, req, error)) return; // the envelope writer logs and reports it
  logger.error(context, error instanceof Error ? error.stack : undefined);
  const { status, code, detail } = errorShapeOf(error);
  // The envelope writer reports a 5xx only when it wrote the body; once the stream has begun this is the one call.
  if (status >= 500) reportError(error, { source: ERROR_SOURCE.HTTP });
  if (res.writableEnded) return;
  const frame: StreamErrorFrame = { code, detail };
  res.write(`${STREAM_FRAME.ERROR}${JSON.stringify(frame)}\n`);
}
