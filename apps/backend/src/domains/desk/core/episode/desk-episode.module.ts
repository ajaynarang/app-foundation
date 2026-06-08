import { Module } from '@nestjs/common';

import { PrismaModule } from '../../../../infrastructure/database/prisma.module';

import { ApprovalEnrichmentModule } from '../approval/approval-enrichment.module';

import { DeskEpisodeController } from './desk-episode.controller';
import { DeskEpisodeService } from './desk-episode.service';
import { DeskStepWriter } from './desk-step-writer.service';

/**
 * Episode-side surface — step writer (used by Inngest step handlers)
 * plus the read API (list + detail) consumed by the Desk UI.
 *
 * ApprovalEnrichmentModule is imported so the episode-detail endpoint can
 * enrich embedded approvals with the canonical decision-sheet payload,
 * identical to the queue view (T23).
 */
@Module({
  imports: [PrismaModule, ApprovalEnrichmentModule],
  controllers: [DeskEpisodeController],
  providers: [DeskStepWriter, DeskEpisodeService],
  exports: [DeskStepWriter, DeskEpisodeService],
})
export class DeskEpisodeModule {}
