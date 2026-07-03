import { Module } from '@nestjs/common';

import { PrismaModule } from '@appshore/platform/infrastructure/database/prisma.module';

import { DeskBootstrapService } from './desk-bootstrap.service';
import { DeskPromptRegistrar } from './desk-prompt.registrar';

/**
 * DeskResponsibilityModule — responsibility-level registrars and
 * bootstrap service.
 *
 * Contents:
 *   - DeskPromptRegistrar: registers the generic agent-system-prompt
 *     fallback(s) with PromptingService at module init. Register your
 *     responsibility step prompts here too.
 *   - DeskBootstrapService: on backend boot, sweeps every ACTIVE tenant
 *     and upserts their registered agents + responsibilities (idempotent).
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
