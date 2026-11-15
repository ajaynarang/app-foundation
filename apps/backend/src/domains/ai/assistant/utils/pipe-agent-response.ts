import type { Logger } from '@nestjs/common';
import { Prisma } from '@appshore/db';
import type { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import type { ModerationService } from '../../moderation/moderation.service';
import type { CardAccumulator } from '../../mcp/mcp-tool.service';
import { generateId } from '@appshore/kernel/shared/utils/id-generator';
import { STREAM_FRAME } from '@app/shared-types';
import { parseFollowups } from './parse-followups';
import { endStreamWithError } from './end-stream-with-error';
import { readStreamError } from '../../agents/read-stream-error';
import type { Request, Response } from 'express';
import { buildConfirmFrame } from './confirm-frame';

/**
 * Pipe a Mastra agent response to the HTTP response as stream frames (`STREAM_FRAME` in `@app/shared-types`).
 *
 * - Streams text deltas as `0:"text"\n` lines
 * - Streams card metadata as `8:{card}\n` lines (from tool _card results)
 * - Checks for HITL suspension and sends `9:{payload}\n` if suspended
 * - Accumulates the full assistant text and persists it to our DB
 * - Handles client disconnect by aborting the stream read
 * - A stream that fails ends with the error envelope (nothing written yet) or one terminal `x:` frame, and nothing is
 *   persisted for the failed turn. It fails when the read throws or when the stream closes with an error Mastra
 *   recorded on `response.error` (it often records a provider failure there instead of throwing); `mapError` turns
 *   either into the error to answer with (the caller maps a provider credit refusal through `mapProviderRefusal`)
 *
 * When `moderationService` is provided, output is PII-redacted before persistence.
 * When omitted (e.g. anonymous/unauthenticated sessions), text is stored as-is.
 */
export async function pipeAgentResponse(
  response: {
    textStream: ReadableStream<string>;
    suspendPayload?: unknown;
    runId?: string;
    error?: unknown;
  },
  opts: {
    conversationDbId: number;
    conversationId: string;
    req: Request;
    res: Response;
    prisma: PrismaService;
    logger: Logger;
    moderationService?: ModerationService;
    cardAccumulator?: CardAccumulator;
    inputMode?: string;
    mapError?: (error: unknown) => unknown;
  },
): Promise<void> {
  const { conversationDbId, conversationId, req, res, prisma, logger, moderationService, cardAccumulator } = opts;
  const mapError = opts.mapError ?? ((error: unknown) => error);

  // Set streaming headers
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Track client disconnect to stop consuming the AI stream
  let clientDisconnected = false;
  req.on('close', () => {
    clientDisconnected = true;
  });

  // Pipe textStream in AI SDK data stream protocol format.
  // Accumulate text during streaming.
  let assistantText = '';
  let failure: unknown;
  const reader = response.textStream.getReader();
  try {
    while (true) {
      if (clientDisconnected) break;
      const { done, value } = await reader.read();
      if (done) break;
      assistantText += value;
      if (!clientDisconnected) {
        res.write(`${STREAM_FRAME.TEXT}${JSON.stringify(value)}\n`);
      }
    }
  } catch (streamError) {
    failure = streamError;
  }
  const error = failure ?? (clientDisconnected ? undefined : readStreamError(response));
  if (error) {
    if (!clientDisconnected) {
      endStreamWithError(req, res, mapError(error), logger, `Stream error for ${conversationId}`);
    }
    if (!res.writableEnded) res.end();
    return;
  }

  // Parse follow-ups from response text
  const { cleanText, followUps } = parseFollowups(assistantText);
  assistantText = cleanText;

  if (followUps.length > 0 && !clientDisconnected) {
    try {
      res.write(`${STREAM_FRAME.FOLLOWUPS}${JSON.stringify(followUps)}\n`);
    } catch {
      // Follow-up streaming is non-fatal
    }
  }

  // Stream card metadata if any tool emitted a _card
  const cardData = cardAccumulator?.card ?? null;
  if (cardData && !clientDisconnected) {
    try {
      res.write(`${STREAM_FRAME.CARD}${JSON.stringify(cardData)}\n`);
    } catch {
      // Card streaming is non-fatal
    }
  }

  // Check if the agent is suspended (HITL confirmation pending)
  try {
    const suspendPayload = await Promise.resolve(response.suspendPayload);
    if (suspendPayload && !clientDisconnected) {
      // The 9: frame is the server-built confirm card plus the resume keys (runId, toolCallId), never model prose.
      res.write(`${STREAM_FRAME.SUSPEND}${JSON.stringify(buildConfirmFrame(suspendPayload, response.runId))}\n`);
    }
  } catch {
    // suspendPayload not available — no suspension
  }

  res.end();

  // Persist assistant message
  if (assistantText) {
    let textToStore = assistantText;

    // Output moderation — redact PII before persisting (only when moderationService provided)
    if (moderationService) {
      try {
        const outputResult = await moderationService.moderate(assistantText, 'output', '');
        if (outputResult.redactedText) {
          textToStore = outputResult.redactedText;
        }
      } catch (moderationError) {
        logger.warn('Output moderation failed — storing original text', moderationError);
      }
    }

    try {
      const assistantMessageId = generateId('msg');
      await prisma.conversationMessage.create({
        data: {
          messageId: assistantMessageId,
          conversation: { connect: { id: conversationDbId } },
          role: 'assistant',
          content: textToStore,
          inputMode: opts.inputMode ?? 'text',
          ...(cardData && {
            card: cardData as Prisma.InputJsonValue,
          }),
        },
      });
    } catch (persistError) {
      logger.error(
        `Failed to persist assistant message for conversation ${conversationId}`,
        persistError instanceof Error ? persistError.stack : String(persistError),
      );
    }
  }
}
