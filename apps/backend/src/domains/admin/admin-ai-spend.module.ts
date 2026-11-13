import { Module } from '@nestjs/common';

import { PrismaModule } from '@appshore/platform/infrastructure/database/prisma.module';
import { AdminAiSpendController } from './admin-ai-spend.controller';
import { AdminAiSpendService } from './admin-ai-spend.service';
import { AiProvisioningModule } from '../ai/routing/provisioning/ai-provisioning.module';

@Module({
  imports: [PrismaModule, AiProvisioningModule],
  controllers: [AdminAiSpendController],
  providers: [AdminAiSpendService],
})
export class AdminAiSpendModule {}
