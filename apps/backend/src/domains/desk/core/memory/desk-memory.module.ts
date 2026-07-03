import { Module } from '@nestjs/common';

import { PrismaModule } from '@appshore/platform/infrastructure/database/prisma.module';
import { AiInfrastructureModule } from '../../../ai/infrastructure/ai-infrastructure.module';
import { DeskAgentModule } from '../agent/desk-agent.module';

import { DeskMemoryController } from './memory.controller';
import { DeskMemoryPromptRegistrar } from './desk-memory-prompt.registrar';
import { DeskMemoryReinforcer } from './desk-memory-reinforcer.service';
import { DeskMemoryService } from './desk-memory.service';
import { DeskMemoryWriterService } from './desk-memory-writer.service';

@Module({
  imports: [PrismaModule, AiInfrastructureModule, DeskAgentModule],
  controllers: [DeskMemoryController],
  providers: [DeskMemoryService, DeskMemoryWriterService, DeskMemoryReinforcer, DeskMemoryPromptRegistrar],
  exports: [DeskMemoryService, DeskMemoryWriterService, DeskMemoryReinforcer],
})
export class DeskMemoryModule {}
