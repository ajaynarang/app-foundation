import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHash } from 'crypto';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { FileStorageService } from '../../../../infrastructure/storage/file-storage.service';
import { EmailFilterService } from './email-filter.service';
import { EmailThreadTrackerService } from './email-thread-tracker.service';
import { ResendInboundService } from './resend-inbound.service';
import { QUEUE_NAMES, DOCUMENTS_JOB_NAMES } from '../../../../infrastructure/queue/queue.constants';
import { buildJobEnvelope } from '../../../../infrastructure/queue/job-envelope.helper';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { DOMAIN_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import type { ResendInboundEmailDataDto } from '../dto/resend-inbound-webhook.dto';
import type { ListEmailThreadsDto } from '../dto/list-email-threads.dto';

@Injectable()
export class EmailIntakeService {
  private readonly logger = new Logger(EmailIntakeService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly fileStorage: FileStorageService,
    private readonly filterService: EmailFilterService,
    private readonly threadTracker: EmailThreadTrackerService,
    private readonly resendInbound: ResendInboundService,
    private readonly events: DomainEventService,
    @InjectQueue(QUEUE_NAMES.DOCUMENTS) private readonly documentsQueue: Queue,
  ) {}

  /**
   * Resolve a tenant from a recipient inbound address.
   * Returns the tenantId and settings if found and enabled.
   */
  async resolveTenant(recipientAddress: string) {
    const settings = await this.prisma.emailIngestSettings.findUnique({
      where: { inboundAddress: recipientAddress.toLowerCase() },
    });

    if (!settings) {
      return null;
    }

    return {
      tenantId: settings.tenantId,
      isEnabled: settings.isEnabled,
      settings,
    };
  }

  /**
   * Provision default email ingest settings for a tenant.
   * Generates a unique inbound address based on tenant slug.
   */
  async provisionSettings(tenantId: number) {
    const existing = await this.prisma.emailIngestSettings.findUnique({
      where: { tenantId },
    });

    if (existing) {
      return existing;
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { tenantId: true, subdomain: true },
    });

    if (!tenant) {
      this.logger.error(`[email-intake] Cannot provision settings — tenant ${tenantId} not found`);
      throw new NotFoundException(`Tenant ${tenantId} not found`);
    }

    // Prefer subdomain (human-readable) over tenantId (system-generated)
    const slug = (tenant.subdomain || tenant.tenantId).toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const inboundDomain = this.config.get<string>('EMAIL_INGEST_INBOUND_DOMAIN', 'olduazcan.resend.app');
    const inboundAddress = `loads-${slug}@${inboundDomain}`;

    return this.prisma.emailIngestSettings.create({
      data: {
        tenantId,
        inboundAddress,
        approvedDomains: [],
        autoApproveCustomerDomains: true,
        unknownSenderPolicy: 'HOLD',
        isEnabled: true,
      },
    });
  }

  /**
   * Main flow: process an inbound email from the Resend webhook.
   *
   * The webhook delivers only metadata (email_id, from, to, subject, attachment metadata).
   * Full email content (text, html, headers) and attachment binaries are fetched
   * from the Resend API using the email_id.
   */
  async processInboundEmail(tenantId: number, webhookData: ResendInboundEmailDataDto) {
    const senderEmail = extractEmail(webhookData.from);
    const senderName = extractName(webhookData.from);
    const attachmentMeta = webhookData.attachments ?? [];

    this.logger.log(
      `[email-intake] Received email | tenant=${tenantId} emailId=${webhookData.email_id} from=${senderEmail} subject="${webhookData.subject}" attachments=${attachmentMeta.length}`,
    );

    // Fetch full email content from Resend API (text, html, headers for threading)
    let fullEmail: Awaited<ReturnType<ResendInboundService['getEmail']>> | null = null;
    try {
      fullEmail = await this.resendInbound.getEmail(webhookData.email_id);
    } catch (error: any) {
      this.logger.warn(
        `[email-intake] Failed to fetch full email — proceeding with webhook data only | emailId=${webhookData.email_id} error="${error.message}"`,
      );
    }

    // Extract threading headers from the fetched email headers
    const inReplyTo = fullEmail?.headers?.['in-reply-to'] ?? null;
    const references = inReplyTo ? [inReplyTo] : [];

    // Find or create thread
    const thread = await this.threadTracker.findOrCreateThread({
      tenantId,
      senderEmail,
      senderName: senderName || undefined,
      subject: webhookData.subject,
      messageId: webhookData.message_id || webhookData.email_id,
      references,
    });

    this.logger.log(
      `[email-intake] Thread resolved | tenant=${tenantId} threadId=${thread.id} isNew=${!thread.updatedAt || thread.createdAt.getTime() === thread.updatedAt.getTime()}`,
    );

    // Store message record — use full email text for preview if available
    const bodyPreview = (fullEmail?.text || '').replace(/\s+/g, ' ').trim().slice(0, 500);

    const message = await this.prisma.emailIngestMessage.create({
      data: {
        threadId: thread.id,
        tenantId,
        messageId: webhookData.message_id || webhookData.email_id,
        fromEmail: senderEmail,
        fromName: senderName || null,
        subject: webhookData.subject,
        receivedAt: new Date(),
        bodyPreview: bodyPreview || null,
      },
    });

    // Emit received event
    await this.events.emit(DOMAIN_EVENTS.EMAIL_INGEST_RECEIVED, tenantId, {
      entityId: String(thread.id),
      entityType: 'email-ingest',
      threadId: thread.id,
      messageId: message.id,
      senderEmail,
      subject: webhookData.subject,
      attachmentCount: attachmentMeta.length,
    });

    if (attachmentMeta.length === 0) {
      this.logger.log(`[email-intake] No attachments — skipping | tenant=${tenantId} threadId=${thread.id}`);
    }

    // Process each attachment by downloading binary content from Resend API
    const results: Array<{
      attachmentId: number;
      filterResult: string;
      queued: boolean;
    }> = [];

    for (const att of attachmentMeta) {
      let buffer: Buffer;

      // Legacy/local testing: attachment has inline base64 content
      // Real Resend webhook: attachment has id, must download via API
      const inlineContent = (att as any).content;
      if (inlineContent && typeof inlineContent === 'string') {
        buffer = Buffer.from(inlineContent, 'base64');
        this.logger.log(
          `[email-intake] Using inline attachment content (local/test mode) | file="${att.filename}" size=${buffer.length}`,
        );
      } else if (att.id && webhookData.email_id) {
        try {
          buffer = await this.resendInbound.downloadAttachment(webhookData.email_id, att.id);
        } catch (error: any) {
          this.logger.error(`[email-intake] Failed to download attachment ${att.id}: ${error.message}`);
          continue;
        }
      } else {
        this.logger.warn(`[email-intake] Skipping attachment "${att.filename}" — no content or download ID`);
        continue;
      }

      const contentHash = createHash('sha256').update(buffer).digest('hex');

      this.logger.log(
        `[email-intake] Processing attachment | tenant=${tenantId} file="${att.filename}" type=${att.content_type} size=${buffer.length} hash=${contentHash.slice(0, 12)}`,
      );

      // Run filter pipeline
      const filterResult = await this.filterService.filter({
        tenantId,
        senderEmail,
        fileName: att.filename,
        mimeType: att.content_type,
        fileSize: buffer.length,
        contentHash,
      });

      this.logger.log(
        `[email-intake] Filter result | tenant=${tenantId} file="${att.filename}" result=${filterResult.result}${filterResult.reason ? ` reason="${filterResult.reason}"` : ''}`,
      );

      // Upload to S3 regardless of filter result (for audit trail)
      const s3Key = `tenants/${tenantId}/email-intake/${thread.id}/${message.id}/${contentHash}_${att.filename}`;
      await this.fileStorage.uploadBuffer(s3Key, buffer, att.content_type);

      // Create attachment record
      const attachment = await this.prisma.emailIngestAttachment.create({
        data: {
          messageId: message.id,
          tenantId,
          fileName: att.filename,
          mimeType: att.content_type,
          fileSize: buffer.length,
          s3Key,
          contentHash,
          filterResult: filterResult.result,
          filterReason: filterResult.reason,
          parseStatus: filterResult.result === 'PASSED' ? 'PENDING' : 'SKIPPED',
        },
      });

      let queued = false;
      if (filterResult.result === 'PASSED') {
        await this.documentsQueue.add(
          DOCUMENTS_JOB_NAMES.PARSE_ATTACHMENT,
          buildJobEnvelope(
            {
              tenantId,
              threadId: thread.id,
              messageId: message.id,
              attachmentId: attachment.id,
              s3Key,
              fileName: att.filename,
              contentHash,
            },
            { tenantId: String(tenantId), source: 'webhook' },
          ),
          {
            attempts: 2,
            backoff: { type: 'exponential', delay: 5000 },
          },
        );
        queued = true;
        this.logger.log(
          `[email-intake] Queued for AI parsing | tenant=${tenantId} attachmentId=${attachment.id} file="${att.filename}"`,
        );
      } else {
        this.logger.log(
          `[email-intake] Skipped (not queued) | tenant=${tenantId} attachmentId=${attachment.id} filter=${filterResult.result}`,
        );
      }

      results.push({
        attachmentId: attachment.id,
        filterResult: filterResult.result,
        queued,
      });
    }

    this.logger.log(
      `[email-intake] Processing complete | tenant=${tenantId} threadId=${thread.id} total=${results.length} passed=${results.filter((r) => r.queued).length} filtered=${results.filter((r) => !r.queued).length}`,
    );

    return { threadId: thread.id, messageId: message.id, results };
  }

  /**
   * Get email ingest settings for a tenant.
   */
  async getSettings(tenantId: number) {
    this.logger.log(`[email-intake] getSettings called | tenantId=${tenantId}`);

    const settings = await this.prisma.emailIngestSettings.findUnique({
      where: { tenantId },
    });

    if (!settings) {
      this.logger.log(`[email-intake] No settings found — auto-provisioning | tenantId=${tenantId}`);
      try {
        return await this.provisionSettings(tenantId);
      } catch (error) {
        this.logger.error(`[email-intake] Auto-provision FAILED | tenantId=${tenantId} error="${error.message}"`);
        throw error;
      }
    }

    return settings;
  }

  /**
   * Update email ingest settings for a tenant.
   */
  async updateSettings(
    tenantId: number,
    data: {
      approvedDomains?: string[];
      autoApproveCustomerDomains?: boolean;
      unknownSenderPolicy?: 'HOLD' | 'PARSE_ANYWAY' | 'REJECT';
      isEnabled?: boolean;
    },
  ) {
    // Ensure settings exist
    await this.getSettings(tenantId);

    return this.prisma.emailIngestSettings.update({
      where: { tenantId },
      data: {
        ...(data.approvedDomains !== undefined && {
          approvedDomains: data.approvedDomains,
        }),
        ...(data.autoApproveCustomerDomains !== undefined && {
          autoApproveCustomerDomains: data.autoApproveCustomerDomains,
        }),
        ...(data.unknownSenderPolicy !== undefined && {
          unknownSenderPolicy: data.unknownSenderPolicy,
        }),
        ...(data.isEnabled !== undefined && {
          isEnabled: data.isEnabled,
        }),
      },
    });
  }

  /**
   * List threads with pagination and filters.
   */
  async listThreads(tenantId: number, params: ListEmailThreadsDto) {
    const page = params.page || 1;
    const limit = Math.min(params.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: any = { tenantId };
    if (params.status) {
      where.status = params.status;
    }
    if (params.senderEmail) {
      where.senderEmail = {
        contains: params.senderEmail,
        mode: 'insensitive',
      };
    }
    if (params.from) {
      where.createdAt = { ...where.createdAt, gte: new Date(params.from) };
    }
    if (params.to) {
      where.createdAt = {
        ...where.createdAt,
        lte: new Date(params.to + 'T23:59:59.999Z'),
      };
    }

    const [threads, total] = await Promise.all([
      this.prisma.emailIngestThread.findMany({
        where,
        include: {
          messages: {
            include: {
              attachments: {
                where: { isLatestVersion: true },
              },
            },
            orderBy: { receivedAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.emailIngestThread.count({ where }),
    ]);

    return {
      data: threads,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get a single thread with all messages and attachments.
   */
  async getThread(tenantId: number, threadId: number) {
    const thread = await this.prisma.emailIngestThread.findFirst({
      where: { id: threadId, tenantId },
      include: {
        messages: {
          include: { attachments: true },
          orderBy: { receivedAt: 'desc' },
        },
      },
    });

    if (!thread) {
      throw new NotFoundException(`Thread ${threadId} not found`);
    }

    return thread;
  }

  /**
   * Mark a thread as CONFIRMED.
   */
  async confirmThread(tenantId: number, threadId: number, userId: number) {
    const thread = await this.prisma.emailIngestThread.findFirst({
      where: { id: threadId, tenantId },
    });

    if (!thread) {
      throw new NotFoundException(`Thread ${threadId} not found`);
    }

    return this.prisma.emailIngestThread.update({
      where: { id: threadId },
      data: {
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        confirmedById: userId,
      },
    });
  }

  /**
   * Mark a thread as DISCARDED.
   */
  async discardThread(tenantId: number, threadId: number) {
    const thread = await this.prisma.emailIngestThread.findFirst({
      where: { id: threadId, tenantId },
    });

    if (!thread) {
      throw new NotFoundException(`Thread ${threadId} not found`);
    }

    return this.prisma.emailIngestThread.update({
      where: { id: threadId },
      data: { status: 'DISCARDED' },
    });
  }

  async restoreThread(tenantId: number, threadId: number) {
    const thread = await this.prisma.emailIngestThread.findFirst({
      where: { id: threadId, tenantId, status: 'DISCARDED' },
    });

    if (!thread) {
      throw new NotFoundException(`Thread ${threadId} not found or not discarded`);
    }

    return this.prisma.emailIngestThread.update({
      where: { id: threadId },
      data: { status: 'PENDING' },
    });
  }

  /**
   * Approve sender domain and requeue held (SENDER_UNKNOWN) attachments for parsing.
   */
  async approveSenderAndParse(tenantId: number, threadId: number) {
    const thread = await this.prisma.emailIngestThread.findFirst({
      where: { id: threadId, tenantId },
      include: {
        messages: {
          include: {
            attachments: {
              where: { filterResult: 'SENDER_UNKNOWN' },
            },
          },
        },
      },
    });

    if (!thread) {
      throw new NotFoundException(`Thread ${threadId} not found`);
    }

    // Add sender domain to approved list
    const senderDomain = thread.senderEmail.split('@')[1]?.toLowerCase();
    if (senderDomain) {
      const settings = await this.prisma.emailIngestSettings.findUnique({
        where: { tenantId },
      });

      if (settings && !settings.approvedDomains.includes(senderDomain)) {
        await this.prisma.emailIngestSettings.update({
          where: { tenantId },
          data: {
            approvedDomains: [...settings.approvedDomains, senderDomain],
          },
        });
        this.logger.log(`[email-intake] Approved sender domain "${senderDomain}" for tenant ${tenantId}`);
      }
    }

    // Requeue all SENDER_UNKNOWN attachments for parsing
    let requeuedCount = 0;
    for (const msg of thread.messages) {
      for (const att of msg.attachments) {
        await this.prisma.emailIngestAttachment.update({
          where: { id: att.id },
          data: {
            filterResult: 'PASSED',
            filterReason: null,
            parseStatus: 'PENDING',
          },
        });

        await this.documentsQueue.add(
          DOCUMENTS_JOB_NAMES.PARSE_ATTACHMENT,
          buildJobEnvelope(
            {
              tenantId,
              threadId: thread.id,
              messageId: msg.id,
              attachmentId: att.id,
              s3Key: att.s3Key,
              fileName: att.fileName,
              contentHash: att.contentHash,
            },
            { tenantId: String(tenantId), source: 'api' },
          ),
          {
            attempts: 2,
            backoff: { type: 'exponential', delay: 5000 },
          },
        );
        requeuedCount++;
      }
    }

    this.logger.log(
      `[email-intake] Approved sender & queued ${requeuedCount} attachments for parsing | tenant=${tenantId} threadId=${threadId} domain=${senderDomain}`,
    );

    return { status: 'approved', domain: senderDomain, requeuedCount };
  }

  /**
   * Find customer by MC number.
   */
  async findCustomerByMc(tenantId: number, mcNumber: string): Promise<number | null> {
    const customer = await this.prisma.customer.findFirst({
      where: { tenantId, mcNumber },
      select: { id: true },
    });
    return customer?.id ?? null;
  }

  /**
   * Find customer by company name.
   */
  async findCustomerByName(tenantId: number, companyName: string): Promise<number | null> {
    const customer = await this.prisma.customer.findFirst({
      where: { tenantId, companyName },
      select: { id: true },
    });
    return customer?.id ?? null;
  }

  /**
   * Get a single attachment with its message (tenant-isolated).
   */
  async getAttachment(tenantId: number, attachmentId: number) {
    const attachment = await this.prisma.emailIngestAttachment.findFirst({
      where: { id: attachmentId, tenantId },
      include: { message: true },
    });

    if (!attachment) {
      throw new NotFoundException(`Attachment ${attachmentId} not found`);
    }

    return attachment;
  }

  /**
   * Link a created load to a thread.
   */
  async linkLoadToThread(threadId: number, loadNumber: string) {
    return this.prisma.emailIngestThread.update({
      where: { id: threadId },
      data: { confirmedLoadId: loadNumber },
    });
  }

  /**
   * Requeue an attachment for re-parsing.
   */
  async requeueAttachment(tenantId: number, attachmentId: number) {
    const attachment = await this.prisma.emailIngestAttachment.findFirst({
      where: { id: attachmentId, tenantId },
      include: { message: true },
    });

    if (!attachment) {
      throw new NotFoundException(`Attachment ${attachmentId} not found`);
    }

    // Reset parse status
    await this.prisma.emailIngestAttachment.update({
      where: { id: attachmentId },
      data: {
        parseStatus: 'PENDING',
        parsedData: null,
        parsedLoadNumber: null,
        parseConfidence: null,
      },
    });

    // Re-add to queue
    await this.documentsQueue.add(
      DOCUMENTS_JOB_NAMES.PARSE_ATTACHMENT,
      buildJobEnvelope(
        {
          tenantId,
          threadId: attachment.message.threadId,
          messageId: attachment.messageId,
          attachmentId: attachment.id,
          s3Key: attachment.s3Key,
          fileName: attachment.fileName,
          contentHash: attachment.contentHash,
        },
        { tenantId: String(tenantId), source: 'api' },
      ),
      {
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );

    this.logger.log(`Requeued attachment ${attachmentId} for re-parsing (tenant ${tenantId})`);

    return { requeued: true };
  }
}

/**
 * Extract email from "Name <email@x.com>" or "email@x.com" format.
 */
export function extractEmail(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return (match ? match[1] : from).trim().toLowerCase();
}

/**
 * Extract name from "Name <email@x.com>" format.
 */
export function extractName(from: string): string | null {
  const match = from.match(/^(.+?)\s*<[^>]+>/);
  if (match) {
    return match[1].replace(/^["']|["']$/g, '').trim() || null;
  }
  return null;
}
