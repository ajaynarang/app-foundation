import { Module } from '@nestjs/common';

import { PrismaModule } from '@appshore/platform/infrastructure/database/prisma.module';
import { DeskInngestModule } from '../inngest/inngest.module';

import { ApprovalController } from './approval.controller';
import { ApprovalEnrichmentModule } from './approval-enrichment.module';
import { ApprovalService } from './approval.service';

@Module({
  imports: [PrismaModule, DeskInngestModule, ApprovalEnrichmentModule],
  controllers: [ApprovalController],
  providers: [ApprovalService],
  exports: [ApprovalService],
})
export class DeskApprovalModule {}
