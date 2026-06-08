import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { NotificationType, NotificationChannel, NotificationStatus } from '@prisma/client';
import type { JobEnvelope } from '@sally/shared-types';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { FileStorageService } from '../../../../infrastructure/storage/file-storage.service';
import { NotificationService } from '../../../../infrastructure/notification/notification.service';
import { RateconParserService } from '../../../ai/document-intelligence/ratecon/ratecon-parser.service';
import { RateconConfidence } from '../../../ai/document-intelligence/ratecon/ratecon.schema';
import { EmailThreadTrackerService } from '../services/email-thread-tracker.service';
import { DOCUMENTS_JOB_NAMES } from '../../../../infrastructure/queue/queue.constants';
import type { QueueJobHandler } from '../../../../infrastructure/queue/job-handler.contract';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';

export interface ParseAttachmentJobData {
  tenantId: number;
  threadId: number;
  messageId: number;
  attachmentId: number;
  s3Key: string;
  fileName: string;
  contentHash: string;
}

/** Convert field-level confidence object to a 0-1 numeric score (average of all levels). */
function confidenceToScore(c: RateconConfidence): number {
  const levelScore = (level: 'high' | 'medium' | 'low'): number => {
    if (level === 'high') return 1.0;
    if (level === 'medium') return 0.5;
    return 0.0;
  };
  const stopScores = c.stops.flatMap((s) => [levelScore(s.location), ...(s.date != null ? [levelScore(s.date)] : [])]);
  const scores = [levelScore(c.reference_number), levelScore(c.broker_name), levelScore(c.rate), ...stopScores];
  return scores.reduce((sum, v) => sum + v, 0) / scores.length;
}

/**
 * Owns the `parse-attachment` job name on the `documents` queue. A plain handler
 * (not a `WorkerHost`) — the single {@link DocumentsQueueProcessor} dispatcher
 * routes jobs to it by name. Job-name routing and dead-letter persistence live
 * in the dispatcher, so this class no longer guards on `job.name` itself.
 */
@Injectable()
export class EmailIntakeJobHandler implements QueueJobHandler {
  readonly jobNames = [DOCUMENTS_JOB_NAMES.PARSE_ATTACHMENT];
  private readonly logger = new Logger(EmailIntakeJobHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fileStorage: FileStorageService,
    private readonly rateconParser: RateconParserService,
    private readonly threadTracker: EmailThreadTrackerService,
    private readonly events: DomainEventService,
    private readonly notificationService: NotificationService,
  ) {}

  async run(job: Job<JobEnvelope<ParseAttachmentJobData>>): Promise<any> {
    const payload = job.data.payload;
    const { tenantId, threadId, attachmentId, s3Key, fileName } = payload;
    const attempt = job.attemptsMade + 1;
    const maxAttempts = job.opts?.attempts ?? 2;

    this.logger.log(
      `[email-intake-parser] Starting | tenant=${tenantId} attachmentId=${attachmentId} file="${fileName}" threadId=${threadId} attempt=${attempt}/${maxAttempts}`,
    );

    // Mark as parsing
    await this.prisma.emailIngestAttachment.update({
      where: { id: attachmentId },
      data: { parseStatus: 'PARSING' },
    });

    try {
      // Step 1: Download file from S3
      this.logger.log(`[email-intake-parser] Downloading from S3 | attachmentId=${attachmentId} s3Key=${s3Key}`);
      const fileBuffer = await this.fileStorage.downloadBuffer(s3Key);
      this.logger.log(`[email-intake-parser] Downloaded ${fileBuffer.length} bytes | attachmentId=${attachmentId}`);

      // Step 2: Delegate to RateconParserService
      this.logger.log(`[email-intake-parser] Sending to RateconParser (text-first) | attachmentId=${attachmentId}`);
      const parseStart = Date.now();
      const result = await this.rateconParser.parse(fileBuffer, fileName, 'text-first', {
        tenantId,
        linkRefId: String(attachmentId),
      });
      const parseDurationMs = Date.now() - parseStart;

      // Step 3: Update attachment with parsed data
      const loadNumber = result.data.load_number || null;
      const brokerName = result.data.broker_name || null;
      const rate = result.data.rate_total_usd || null;
      const stopCount = result.data.stops?.length || 0;
      const confidenceScore = result.data.confidence ? confidenceToScore(result.data.confidence) : null;

      this.logger.log(
        `[email-intake-parser] Parsed successfully | attachmentId=${attachmentId} loadNumber=${loadNumber} broker="${brokerName}" rate=$${rate} stops=${stopCount} confidence=${confidenceScore} durationMs=${parseDurationMs}`,
      );

      await this.prisma.emailIngestAttachment.update({
        where: { id: attachmentId },
        data: {
          parseStatus: 'PARSED',
          parsedData: result.data as any,
          parsedLoadNumber: loadNumber,
          parseConfidence: confidenceScore,
        },
      });

      // Step 4: Handle version management (mark older versions as stale)
      if (loadNumber) {
        await this.threadTracker.handleRevision({
          threadId,
          attachmentId,
          loadNumber,
        });
      }

      // Step 5: Create in-app system notification for dispatchers
      await this.createParsedNotification({
        tenantId,
        threadId,
        rate,
        parsedData: result.data,
      }).catch((err) => {
        // Non-fatal — log and continue
        this.logger.warn(
          `[email-intake-parser] Failed to create parse notification | attachmentId=${attachmentId} error="${err?.message}"`,
        );
      });

      // Step 6: Emit success event
      await this.events.emit(SALLY_EVENTS.EMAIL_INGEST_PARSED, tenantId, {
        entityId: String(threadId),
        entityType: 'email-ingest',
        threadId,
        attachmentId,
        fileName,
        loadNumber,
        confidence: confidenceScore,
      });

      this.logger.log(
        `[email-intake-parser] Complete | tenant=${tenantId} attachmentId=${attachmentId} loadNumber=${loadNumber} confidence=${confidenceScore} durationMs=${parseDurationMs}`,
      );

      return { attachmentId, loadNumber, confidence: confidenceScore };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isFinalAttempt = attempt >= maxAttempts;
      this.logger.error(
        `[email-intake-parser] FAILED | tenant=${tenantId} attachmentId=${attachmentId} file="${fileName}" attempt=${attempt}/${maxAttempts} final=${isFinalAttempt} error="${errorMessage}"`,
      );

      if (isFinalAttempt) {
        this.logger.warn(
          `[email-intake-parser] Final attempt exhausted — marking FAILED | attachmentId=${attachmentId}`,
        );
        await this.prisma.emailIngestAttachment.update({
          where: { id: attachmentId },
          data: { parseStatus: 'FAILED' },
        });

        await this.events.emit(SALLY_EVENTS.EMAIL_INGEST_FAILED, tenantId, {
          entityId: String(threadId),
          entityType: 'email-ingest',
          threadId,
          attachmentId,
          fileName,
          errorMessage,
        });
      }

      throw error;
    }
  }

  /**
   * Creates a SYSTEM in-app notification for all dispatchers in the tenant
   * after a rate-con PDF is successfully parsed.
   */
  private async createParsedNotification(params: {
    tenantId: number;
    threadId: number;
    rate: number | null;
    parsedData: Record<string, any>;
  }): Promise<void> {
    const { tenantId, threadId, rate, parsedData } = params;

    // Fetch sender email from the thread
    const thread = await this.prisma.emailIngestThread.findUnique({
      where: { id: threadId },
      select: { senderEmail: true },
    });

    // Build title: "Rate-con parsed: $X,XXX" or just "Rate-con parsed"
    const formattedRate = rate != null ? `$${Math.round(rate).toLocaleString('en-US')}` : null;
    const title = formattedRate ? `Rate-con parsed: ${formattedRate}` : 'Rate-con parsed';

    // Build message: "Origin, ST → Dest, ST — from broker@example.com"
    const stops: Array<{ city?: string; state?: string }> = parsedData?.stops ?? [];
    const origin = stops[0];
    const dest = stops[stops.length - 1];
    const originStr = origin?.city && origin?.state ? `${origin.city}, ${origin.state}` : (origin?.city ?? null);
    const destStr = dest?.city && dest?.state ? `${dest.city}, ${dest.state}` : (dest?.city ?? null);

    const routePart =
      originStr && destStr && originStr !== destStr ? `${originStr} → ${destStr}` : (originStr ?? destStr ?? null);

    const senderPart = thread?.senderEmail ? `from ${thread.senderEmail}` : null;

    const messageParts = [routePart, senderPart].filter(Boolean);
    const message = messageParts.length > 0 ? messageParts.join(' — ') : undefined;

    await this.prisma.notification.create({
      data: {
        type: NotificationType.EMAIL_RATECON_PARSED,
        channel: NotificationChannel.IN_APP,
        recipient: `tenant:${tenantId}`,
        status: NotificationStatus.SENT,
        category: 'SYSTEM',
        tenantId,
        title,
        message,
        actionUrl: '/dispatcher/inbox',
        actionLabel: 'View Email Inbox',
        iconType: 'email',
        sentAt: new Date(),
        metadata: {
          threadId,
          rate,
          originStr,
          destStr,
        },
      },
    });
  }
}
