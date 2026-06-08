import { Module } from '@nestjs/common';

import { SallyRouterService } from './sally-router.service';
import { SkillClassifierService } from './skill-classifier.service';

@Module({
  providers: [SallyRouterService, SkillClassifierService],
  exports: [SallyRouterService],
})
export class OrchestratorModule {}
