import type { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { ModerationService } from '../../moderation/moderation.service';
import type { CardAccumulator } from '../../mcp/mcp-tool.service';
import { generateId } from '../../../../shared/utils/id-generator';
import { parseFollowups } from './parse-followups';
import type { Request, Response } from 'express';

/**
 * Pipe a Mastra agent response to the HTTP response in AI SDK data stream protocol.
 *
 * - Streams text deltas as `0:"text"\n` lines
 * - Streams card metadata as `8:{card}\n` lines (from tool _card results)
 * - Checks for HITL suspension and sends `9:{payload}\n` if suspended
 * - Accumulates the full assistant text and persists it to our DB
 * - Handles client disconnect by aborting the stream read
 *
 * When `moderationService` is provided, output is PII-redacted before persistence.
 * When omitted (e.g. anonymous/unauthenticated sessions), text is stored as-is.
 */
export async function pipeAgentResponse(
  response: {
    textStream: ReadableStream<string>;
    suspendPayload?: unknown;
    runId?: string;
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
  },
): Promise<void> {
  const { conversationDbId, conversationId, req, res, prisma, logger, moderationService, cardAccumulator } = opts;

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
  const reader = response.textStream.getReader();
  try {
    while (true) {
      if (clientDisconnected) break;
      const { done, value } = await reader.read();
      if (done) break;
      assistantText += value;
      if (!clientDisconnected) {
        res.write(`0:${JSON.stringify(value)}\n`);
      }
    }
  } catch (streamError) {
    logger.warn(`Stream read error for ${conversationId}`, streamError);
  }

  // Parse follow-ups from response text
  const { cleanText, followUps } = parseFollowups(assistantText);
  assistantText = cleanText;

  if (followUps.length > 0 && !clientDisconnected) {
    try {
      res.write(`a:${JSON.stringify(followUps)}\n`);
    } catch {
      // Follow-up streaming is non-fatal
    }
  }

  // Stream card metadata if any tool emitted a _card
  const cardData = cardAccumulator?.card ?? null;
  if (cardData && !clientDisconnected) {
    try {
      res.write(`8:${JSON.stringify(cardData)}\n`);
    } catch {
      // Card streaming is non-fatal
    }
  }

  // Check if the agent is suspended (HITL confirmation pending)
  try {
    const suspendPayload = await Promise.resolve(response.suspendPayload);
    if (suspendPayload && !clientDisconnected) {
      // Custom 9: protocol line signals HITL suspension to the frontend.
      // Include runId so the client can pass it back when resuming.
      const payload =
        typeof suspendPayload === 'object' && suspendPayload !== null
          ? { ...suspendPayload, runId: response.runId }
          : { data: suspendPayload, runId: response.runId };
      res.write(`9:${JSON.stringify(payload)}\n`);
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
