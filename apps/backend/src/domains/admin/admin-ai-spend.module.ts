import { Module } from '@nestjs/common';

import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { AdminAiSpendController } from './admin-ai-spend.controller';
import { AdminAiSpendService } from './admin-ai-spend.service';

@Module({
  imports: [PrismaModule],
  controllers: [AdminAiSpendController],
  providers: [AdminAiSpendService],
})
export class AdminAiSpendModule {}
