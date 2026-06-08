import { Module, forwardRef } from '@nestjs/common';
import { FeedbackController } from './feedback.controller';
import { FeedbackAdminController } from './feedback-admin.controller';
import { FeedbackService } from './feedback.service';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { SallyAiModule } from '../../ai/sally-ai/sally-ai.module';

@Module({
  imports: [PrismaModule, forwardRef(() => SallyAiModule)],
  controllers: [FeedbackController, FeedbackAdminController],
  providers: [FeedbackService],
  exports: [FeedbackService],
})
export class FeedbackModule {}
