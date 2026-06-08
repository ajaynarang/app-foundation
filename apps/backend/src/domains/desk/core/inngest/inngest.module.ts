import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { InngestClientService } from './inngest.client';
import { InngestController } from './inngest.controller';

/**
 * Inngest sub-module for Desk. Owns the Inngest client + the /api/inngest
 * HTTP handler. Other Desk modules (trigger, approval, responsibility) import
 * this to publish events and — in P1.7 — to register functions for serve().
 */
@Module({
  imports: [ConfigModule],
  providers: [InngestClientService],
  controllers: [InngestController],
  exports: [InngestClientService],
})
export class DeskInngestModule {}
