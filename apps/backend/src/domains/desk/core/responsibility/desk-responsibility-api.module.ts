import { Module } from '@nestjs/common';

import { PrismaModule } from '@appshore/platform/infrastructure/database/prisma.module';
import { DeskAgentModule } from '../agent/desk-agent.module';
import { DeskTriggerModule } from '../trigger/trigger.module';

import { DeskResponsibilityController } from './responsibility.controller';
import { DeskResponsibilityService } from './responsibility.service';

/**
 * Desk responsibility REST API — list / detail / update / manual-run.
 * Kept separate from DeskResponsibilityModule (prompt registrar) so the
 * read-API surface is cleanly scoped to core/. Imports DeskAgentModule
 * to reuse DeskAgentEditGuard on PATCH + manual-run routes.
 */
@Module({
  imports: [PrismaModule, DeskTriggerModule, DeskAgentModule],
  controllers: [DeskResponsibilityController],
  providers: [DeskResponsibilityService],
  exports: [DeskResponsibilityService],
})
export class DeskResponsibilityApiModule {}
