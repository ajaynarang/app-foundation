import { Global, Module } from '@nestjs/common';
import { OUTBOUND_GATE } from '@appshore/kernel/infrastructure/outbound/outbound-gate.port';
import { PrismaModule } from '../database/prisma.module';
import { OutboundPolicyService } from './outbound-policy.service';

/**
 * Binds the kernel's `OUTBOUND_GATE` port to `OutboundPolicyService` for the whole process (ADR "Outbound gate").
 * Global, so every sender (kernel SMS, platform email and push, the WhatsApp handler, app webhooks) injects the port
 * without importing this module.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [OutboundPolicyService, { provide: OUTBOUND_GATE, useExisting: OutboundPolicyService }],
  exports: [OutboundPolicyService, OUTBOUND_GATE],
})
export class OutboundModule {}
