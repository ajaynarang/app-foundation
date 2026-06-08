import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ResendEmail {
  id: string;
  from: string;
  to: string[];
  subject: string;
  text: string | null;
  html: string | null;
  message_id: string;
  headers: Record<string, string>;
  attachments: Array<{
    id: string;
    filename: string;
    content_type: string;
  }>;
}

@Injectable()
export class ResendInboundService {
  private readonly logger = new Logger(ResendInboundService.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.resend.com';

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('RESEND_API_KEY', '');
  }

  async getEmail(emailId: string): Promise<ResendEmail> {
    this.logger.log(`[resend-inbound] Fetching email ${emailId}`);

    const res = await fetch(`${this.baseUrl}/emails/receiving/${emailId}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!res.ok) {
      throw new InternalServerErrorException('Failed to retrieve email — please try again');
    }

    return res.json() as Promise<ResendEmail>;
  }

  async downloadAttachment(emailId: string, attachmentId: string): Promise<Buffer> {
    this.logger.log(`[resend-inbound] Downloading attachment ${attachmentId} from email ${emailId}`);

    // Step 1: Get attachment metadata with download_url
    const metaRes = await fetch(`${this.baseUrl}/emails/receiving/${emailId}/attachments/${attachmentId}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!metaRes.ok) {
      throw new InternalServerErrorException('Failed to retrieve email attachment — please try again');
    }

    const meta = (await metaRes.json()) as {
      download_url: string;
      expires_at: string;
    };

    if (!meta.download_url) {
      throw new InternalServerErrorException('Failed to retrieve email attachment — please try again');
    }

    this.logger.log(`[resend-inbound] Downloading from presigned URL | attachmentId=${attachmentId}`);

    // Step 2: Download binary from the presigned URL (no auth needed)
    const downloadRes = await fetch(meta.download_url);

    if (!downloadRes.ok) {
      throw new InternalServerErrorException('Failed to download email attachment — please try again');
    }

    const arrayBuffer = await downloadRes.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
