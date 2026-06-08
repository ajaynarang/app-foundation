import { Injectable, Logger } from '@nestjs/common';
import { EmailIngestFilterResult } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { isBlockedFilename } from '../constants/filename-patterns';

export interface FilterInput {
  tenantId: number;
  senderEmail: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  contentHash: string;
}

export interface FilterResult {
  result: EmailIngestFilterResult;
  reason: string | null;
}

const MIN_FILE_SIZE = 10 * 1024; // 10 KB
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

@Injectable()
export class EmailFilterService {
  private readonly logger = new Logger(EmailFilterService.name);

  constructor(private readonly prisma: PrismaService) {}

  async filter(input: FilterInput): Promise<FilterResult> {
    const { tenantId, senderEmail, fileName, mimeType, fileSize, contentHash } = input;

    // Layer 1: Attachment type check
    if (mimeType !== 'application/pdf') {
      return {
        result: EmailIngestFilterResult.WRONG_TYPE,
        reason: `Unsupported MIME type: ${mimeType}`,
      };
    }

    // Layer 2a: File size — too small
    if (fileSize < MIN_FILE_SIZE) {
      return {
        result: EmailIngestFilterResult.TOO_SMALL,
        reason: `File size ${fileSize} bytes is below minimum ${MIN_FILE_SIZE} bytes`,
      };
    }

    // Layer 2b: File size — too large
    if (fileSize > MAX_FILE_SIZE) {
      return {
        result: EmailIngestFilterResult.TOO_LARGE,
        reason: `File size ${fileSize} bytes exceeds maximum ${MAX_FILE_SIZE} bytes`,
      };
    }

    // Layer 2c: Blocked filename
    if (isBlockedFilename(fileName)) {
      return {
        result: EmailIngestFilterResult.BLOCKED_NAME,
        reason: `Filename "${fileName}" matches a blocked keyword`,
      };
    }

    // Layer 3: Duplicate check
    const existing = await this.prisma.emailIngestAttachment.findFirst({
      where: {
        tenantId,
        contentHash,
      },
      select: { id: true },
    });
    if (existing) {
      return {
        result: EmailIngestFilterResult.DUPLICATE,
        reason: `Attachment with hash ${contentHash} already exists`,
      };
    }

    // Layer 4 & 5: Sender filtering
    const settings = await this.prisma.emailIngestSettings.findUnique({
      where: { tenantId },
    });

    if (!settings) {
      this.logger.warn(`No EmailIngestSettings found for tenant ${tenantId}`);
      return {
        result: EmailIngestFilterResult.SENDER_UNKNOWN,
        reason: 'No email ingest settings configured for tenant',
      };
    }

    const senderDomain = senderEmail.split('@')[1]?.toLowerCase();
    const isApprovedDomain = settings.approvedDomains.some((d) => d.toLowerCase() === senderDomain);

    if (isApprovedDomain) {
      return { result: EmailIngestFilterResult.PASSED, reason: null };
    }

    // Check customer domains if autoApproveCustomerDomains is enabled
    if (settings.autoApproveCustomerDomains) {
      // Fix #9: Targeted query instead of fetching ALL customers
      const matchingCustomer = await this.prisma.customer.findFirst({
        where: {
          tenantId,
          OR: [
            {
              contacts: {
                some: {
                  email: {
                    endsWith: `@${senderDomain}`,
                    mode: 'insensitive',
                  },
                  status: 'ACTIVE',
                },
              },
            },
            {
              billingEmail: {
                endsWith: `@${senderDomain}`,
                mode: 'insensitive',
              },
            },
          ],
        },
        select: { id: true },
      });

      if (matchingCustomer) {
        return { result: EmailIngestFilterResult.PASSED, reason: null };
      }
    }

    // Unknown sender — apply policy
    switch (settings.unknownSenderPolicy) {
      case 'PARSE_ANYWAY':
        return { result: EmailIngestFilterResult.PASSED, reason: null };
      case 'REJECT':
        return {
          result: EmailIngestFilterResult.SENDER_UNKNOWN,
          reason: `Sender domain "${senderDomain}" is not approved and policy is REJECT`,
        };
      case 'HOLD':
      default:
        return {
          result: EmailIngestFilterResult.SENDER_UNKNOWN,
          reason: `Sender domain "${senderDomain}" is not approved; held for review`,
        };
    }
  }
}
