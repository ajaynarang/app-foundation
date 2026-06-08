import { Module } from '@nestjs/common';

import { PrismaModule } from '../../../infrastructure/database/prisma.module';

import { DeskBootstrapService } from './desk-bootstrap.service';
import { DeskPromptRegistrar } from './desk-prompt.registrar';

/**
 * DeskResponsibilityModule — responsibility-level registrars and
 * bootstrap service.
 *
 * Contents:
 *   - DeskPromptRegistrar: registers the 3 AR Follow-up step-prompt
 *     fallbacks + 12 agent-system-prompt fallbacks with PromptingService
 *     at module init.
 *   - DeskBootstrapService: on backend boot, sweeps every ACTIVE tenant
 *     and upserts their 12 agents + 10 responsibilities (idempotent).
 *     Also exposes bootstrapForTenant(tenantDbId) for TenantsService to
 *     call the moment a tenant is approved.
 *
 * PromptingService is @Global, so we don't need to import PromptingModule.
 */
@Module({
  imports: [PrismaModule],
  providers: [DeskPromptRegistrar, DeskBootstrapService],
  exports: [DeskBootstrapService],
})
export class DeskResponsibilityModule {}
