import { Module } from '@nestjs/common';

import { CacheModule } from '../../../../platform-glue/cache/cache.module';
import { PrismaModule } from '@appshore/platform/infrastructure/database/prisma.module';

import { DeskAgentController } from './agent.controller';
import { DeskAgentService } from './agent.service';
import { DeskAgentEditGuard } from './desk-agent-edit.guard';

/**
 * Desk agent REST API — Crew tab roster + agent-level update +
 * activity stats + eligible supervisors. Agents carry one real piece of
 * config (supervisor); bulk-enable is still the most useful shortcut.
 */
@Module({
  imports: [PrismaModule, CacheModule],
  controllers: [DeskAgentController],
  providers: [DeskAgentService, DeskAgentEditGuard],
  exports: [DeskAgentService, DeskAgentEditGuard],
})
export class DeskAgentModule {}
