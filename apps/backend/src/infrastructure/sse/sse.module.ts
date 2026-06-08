import { Global, Module } from '@nestjs/common';
import { SseController } from './sse.controller';
import { SseService } from './sse.service';
import { DomainEventSseBridge } from './domain-event-sse-bridge.service';

@Global()
@Module({
  controllers: [SseController],
  providers: [SseService, DomainEventSseBridge],
  exports: [SseService],
})
export class SseModule {}
