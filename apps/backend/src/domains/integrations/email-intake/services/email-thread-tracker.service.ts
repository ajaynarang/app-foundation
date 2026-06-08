import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

export interface FindOrCreateThreadInput {
  tenantId: number;
  senderEmail: string;
  senderName?: string;
  subject: string;
  messageId: string;
  references: string[];
}

export interface HandleRevisionInput {
  threadId: number;
  attachmentId: number;
  loadNumber: string;
}

@Injectable()
export class EmailThreadTrackerService {
  private readonly logger = new Logger(EmailThreadTrackerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findOrCreateThread(input: FindOrCreateThreadInput) {
    const { tenantId, senderEmail, senderName, subject, messageId, references } = input;

    // Try to find an existing thread whose messageIdChain overlaps with the References headers
    const existingThread =
      references.length > 0
        ? await this.prisma.emailIngestThread.findFirst({
            where: {
              tenantId,
              messageIdChain: { hasSome: references },
            },
          })
        : null;

    if (existingThread) {
      this.logger.debug(`Found existing thread ${existingThread.id} for messageId ${messageId}`);

      // Append the new messageId to the chain if not already present
      const updatedChain = existingThread.messageIdChain.includes(messageId)
        ? existingThread.messageIdChain
        : [...existingThread.messageIdChain, messageId];

      const updated = await this.prisma.emailIngestThread.update({
        where: { id: existingThread.id },
        data: { messageIdChain: updatedChain },
      });

      return updated;
    }

    // Create a new thread
    this.logger.debug(`Creating new thread for messageId ${messageId}`);
    const thread = await this.prisma.emailIngestThread.create({
      data: {
        tenantId,
        senderEmail,
        senderName,
        subject,
        messageIdChain: [messageId, ...references],
      },
    });

    return thread;
  }

  async handleRevision(input: HandleRevisionInput): Promise<void> {
    const { threadId, attachmentId, loadNumber } = input;

    // Find all attachments in this thread with the same load number that are not the current one
    const thread = await this.prisma.emailIngestThread.findUnique({
      where: { id: threadId },
      select: {
        messages: {
          select: {
            attachments: {
              where: {
                parsedLoadNumber: loadNumber,
                isLatestVersion: true,
                id: { not: attachmentId },
              },
              select: { id: true },
            },
          },
        },
      },
    });

    if (!thread) {
      this.logger.warn(`Thread ${threadId} not found in handleRevision`);
      return;
    }

    const staleIds = thread.messages.flatMap((m) => m.attachments).map((a) => a.id);

    if (staleIds.length === 0) {
      return;
    }

    this.logger.debug(
      `Marking ${staleIds.length} attachment(s) as not latest version in thread ${threadId} for load ${loadNumber}`,
    );

    await this.prisma.emailIngestAttachment.updateMany({
      where: { id: { in: staleIds } },
      data: { isLatestVersion: false },
    });
  }
}
