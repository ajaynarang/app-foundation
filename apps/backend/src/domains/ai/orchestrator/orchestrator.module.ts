import { Module } from '@nestjs/common';

import { AssistantRouterService } from './assistant-router.service';
import { SkillClassifierService } from './skill-classifier.service';
import { AiRoutingModule } from '../routing/ai-routing.module';

@Module({
  imports: [AiRoutingModule],
  providers: [AssistantRouterService, SkillClassifierService],
  exports: [AssistantRouterService],
})
export class OrchestratorModule {}
