import { Global, Module } from '@nestjs/common';
import { SmsService } from '@appshore/kernel/infrastructure/sms/sms.service';
import { TwilioVerifyService } from './twilio-verify.service';

@Global()
@Module({
  providers: [SmsService, TwilioVerifyService],
  exports: [SmsService, TwilioVerifyService],
})
export class SmsModule {}
