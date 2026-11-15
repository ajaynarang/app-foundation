import { Global, Module } from '@nestjs/common';
import { SseController } from './sse.controller';
import { SSE_TENANT_BROADCAST_ROLES, SseService } from '@appshore/kernel/infrastructure/sse/sse.service';
import { SSE_BROADCAST_ROLES } from './sse-broadcast-roles';
import { DomainEventSseBridge } from './domain-event-sse-bridge.service';

@Global()
@Module({
  controllers: [SseController],
  providers: [
    // Which roles receive tenant-wide broadcasts; every role is classified in sse-broadcast-roles.ts.
    { provide: SSE_TENANT_BROADCAST_ROLES, useValue: SSE_BROADCAST_ROLES },
    SseService,
    DomainEventSseBridge,
  ],
  exports: [SseService],
})
export class SseModule {}
