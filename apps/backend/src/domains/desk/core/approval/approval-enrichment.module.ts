import { Module } from '@nestjs/common';

import { ApprovalEnrichmentService } from './approval-enrichment.service';

/**
 * Tiny module that owns the stateless ApprovalEnrichmentService so both
 * DeskApprovalModule (queue view) and DeskEpisodeModule (episode detail
 * view) can share one instance without circular imports.
 */
@Module({
  providers: [ApprovalEnrichmentService],
  exports: [ApprovalEnrichmentService],
})
export class ApprovalEnrichmentModule {}
