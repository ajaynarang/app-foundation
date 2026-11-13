import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isDevelopmentEnv } from '../../shared/utils/env-label';
import { maskPhone } from '../../shared/utils/log-redaction';
import { toLoggableError } from '../queue/job-events';

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
      // On a developer's machine the message is printed so OTP and PIN flows still work; anywhere else one line with
      // a masked number and no body (the body is usually a code).
      if (isDevelopmentEnv()) {
        this.logger.warn(
          `SMS not sent to ${maskPhone(to)} (Twilio not configured, ENV_TYPE=development). Message: ${message}`,
        );
      } else {
        this.logger.warn(`SMS not sent to ${maskPhone(to)}: Twilio not configured`);
      }
      return false;
    }

    try {
      await this.twilioClient.messages.create({
        body: message,
        from: this.fromNumber,
        to,
      });
      this.logger.log(`SMS sent to ${maskPhone(to)}`);
      return true;
    } catch (error: unknown) {
      // Twilio's errors echo the number they refused; the err serializer masks it.
      this.logger.error({ msg: `SMS send failed to ${maskPhone(to)}`, err: toLoggableError(error) });
      return false;
    }
  }
}
