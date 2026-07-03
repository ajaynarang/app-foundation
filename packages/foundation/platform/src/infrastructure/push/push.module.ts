import { Global, Module } from '@nestjs/common';
import { PushSubscriptionController } from './push-subscription.controller';
import { PushService } from './push.service';
import { PrismaModule } from '../database/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [PushSubscriptionController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
