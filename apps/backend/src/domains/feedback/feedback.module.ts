import { Module, forwardRef } from '@nestjs/common';
import { FeedbackController } from './feedback.controller';
import { FeedbackAdminController } from './feedback-admin.controller';
import { FeedbackService } from './feedback.service';
import { PrismaModule } from '@appshore/platform/infrastructure/database/prisma.module';
import { AssistantAiModule } from '../ai/assistant/assistant.module';

@Module({
  imports: [PrismaModule, forwardRef(() => AssistantAiModule)],
  controllers: [FeedbackController, FeedbackAdminController],
  providers: [FeedbackService],
  exports: [FeedbackService],
})
export class FeedbackModule {}
