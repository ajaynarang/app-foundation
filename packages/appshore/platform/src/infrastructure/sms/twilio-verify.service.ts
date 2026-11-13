import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { getEnvType } from '@appshore/kernel/shared/utils/env-type';
import { ConfigService } from '@nestjs/config';
import { maskPhone } from '@appshore/kernel/shared/utils/log-redaction';
import { toLoggableError } from '@appshore/kernel/infrastructure/queue/job-events';

@Injectable()
export class TwilioVerifyService {
  private readonly logger = new Logger(TwilioVerifyService.name);
  private twilioClient: any = null;
  private readonly verifyServiceSid: string | undefined;

  constructor(private readonly configService: ConfigService) {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    this.verifyServiceSid = this.configService.get<string>('TWILIO_VERIFY_SERVICE_SID');
    if (accountSid && authToken) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const twilio = require('twilio');
        this.twilioClient = twilio(accountSid, authToken);
        this.logger.log('TwilioVerifyService configured');
      } catch {
        this.logger.warn('TwilioVerifyService: failed to init Twilio client');
      }
    }
  }

  private get mockOtp(): string | undefined {
    return this.configService.get<string>('TWILIO_MOCK_OTP');
  }

  async sendVerification(phone: string): Promise<void> {
    this.validateE164(phone);

    if (this.mockOtp) {
      this.logger.debug(
        `[MOCK] TWILIO_MOCK_OTP is active for ${maskPhone(phone)} (also sending a real OTP if Twilio is configured)`,
      );
    }

    if (!this.twilioClient || !this.verifyServiceSid) {
      if (!this.mockOtp) {
        this.logger.warn('Twilio Verify not configured — skipping OTP send');
      }
      return;
    }

    try {
      await this.twilioClient.verify.v2
        .services(this.verifyServiceSid)
        .verifications.create({ to: phone, channel: 'sms' });
    } catch (err: any) {
      this.logger.error({ msg: `Failed to send OTP to ${maskPhone(phone)}`, err: toLoggableError(err) });
      throw new BadRequestException('Failed to send verification code. Please try again.');
    }
  }

  async checkVerification(phone: string, code: string): Promise<boolean> {
    this.validateE164(phone);

    // If mock OTP matches, allow immediately (dev shortcut). NEVER in
    // production — a leaked TWILIO_MOCK_OTP would be a universal login code.
    if (this.mockOtp && code === this.mockOtp && getEnvType() !== 'production') {
      this.logger.debug(`[MOCK] OTP matched for ${maskPhone(phone)}`);
      return true;
    }

    // Fall through to real Twilio check (works whether mock is set or not)
    if (!this.twilioClient || !this.verifyServiceSid) {
      this.logger.warn('Twilio Verify not configured — OTP check skipped');
      return false;
    }

    try {
      const result = await this.twilioClient.verify.v2
        .services(this.verifyServiceSid)
        .verificationChecks.create({ to: phone, code });
      return result.status === 'approved';
    } catch (err: any) {
      this.logger.error({ msg: `OTP check failed for ${maskPhone(phone)}`, err: toLoggableError(err) });
      return false;
    }
  }

  private validateE164(phone: string): void {
    if (!/^\+[1-9]\d{1,14}$/.test(phone)) {
      throw new BadRequestException('Invalid phone number format. Must be E.164 (e.g. +12025551234)');
    }
  }
}
