import { Module } from '@nestjs/common';

import { AssistantRouterService } from './assistant-router.service';
import { SkillClassifierService } from './skill-classifier.service';

@Module({
  providers: [AssistantRouterService, SkillClassifierService],
  exports: [AssistantRouterService],
})
export class OrchestratorModule {}
