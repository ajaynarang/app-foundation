import { Module } from '@nestjs/common';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { ApiKeyGuard } from './guards/api-key.guard';
import { ApiKeyAuthGuard } from './guards/api-key-auth.guard';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { EventBusModule } from '../../../infrastructure/events/event-bus.module';

@Module({
  imports: [PrismaModule, EventBusModule],
  controllers: [ApiKeysController],
  providers: [ApiKeysService, ApiKeyGuard, ApiKeyAuthGuard],
  exports: [ApiKeysService, ApiKeyGuard, ApiKeyAuthGuard],
})
export class ApiKeysModule {}
