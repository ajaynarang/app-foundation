import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private twilioClient: any;
  private fromNumber: string;
  private isConfiguredFlag: boolean;

  constructor(private readonly configService: ConfigService) {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    this.fromNumber = this.configService.get<string>('TWILIO_PHONE_NUMBER') || '';

    if (accountSid && authToken && this.fromNumber) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const twilio = require('twilio');
        this.twilioClient = twilio(accountSid, authToken);
        this.isConfiguredFlag = true;
        this.logger.log('SMS service configured with Twilio');
      } catch {
        this.isConfiguredFlag = false;
        this.logger.warn('SMS service not configured — Twilio init failed');
      }
    } else {
      this.isConfiguredFlag = false;
      this.logger.warn('SMS service not configured — Twilio credentials missing');
    }
  }

  getIsConfigured(): boolean {
    return this.isConfiguredFlag;
  }

  async sendSms(to: string, message: string): Promise<boolean> {
    if (!this.isConfiguredFlag) {
      this.logger.warn(`SMS not sent to ${to} — Twilio not configured. Message: ${message}`);
      return false;
    }

    try {
      await this.twilioClient.messages.create({
        body: message,
        from: this.fromNumber,
        to,
      });
      this.logger.log(`SMS sent to ${to}`);
      return true;
    } catch (error: any) {
      this.logger.error(`SMS send failed to ${to}: ${error.message}`);
      return false;
    }
  }
}
