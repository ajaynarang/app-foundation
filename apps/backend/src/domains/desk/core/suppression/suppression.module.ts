import { Module } from '@nestjs/common';

import { PrismaModule } from '@appshore/platform/infrastructure/database/prisma.module';

import { SuppressionController } from './suppression.controller';
import { SuppressionService } from './suppression.service';

/**
 * DeskSuppressionModule — HTTP surface for snooze + unsnooze (T27g).
 *
 * EventEmitter2 is provided globally by `EventBusModule` (@Global), so no
 * extra import is needed here. Prisma comes from `PrismaModule`; `closeStep`
 * is a plain function that resolves its own Nest deps via `nestApp()`.
 */
@Module({
  imports: [PrismaModule],
  controllers: [SuppressionController],
  providers: [SuppressionService],
  exports: [SuppressionService],
})
export class DeskSuppressionModule {}
