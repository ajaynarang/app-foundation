import { Module } from '@nestjs/common';
import { PlansService } from './plans.service';
import { PlansController } from './plans.controller';
import { TrialExpiryService } from './trial-expiry.service';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PlansController],
  providers: [PlansService, TrialExpiryService],
  exports: [PlansService, TrialExpiryService],
})
export class PlansModule {}
