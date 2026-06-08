import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '../../../infrastructure/cache/cache.module';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { EventBusModule } from '../../../infrastructure/events/event-bus.module';
import { McpToolsModule } from '../mcp/mcp-tools.module';
import { ModerationModule } from '../moderation/moderation.module';
import { AgentsModule } from '../agents/agents.module';
import { OrchestratorModule } from '../orchestrator/orchestrator.module';
import { SallyAiController } from './assistant.controller';
import { SallyAiService } from './assistant.service';
import { MastraProvider } from './mastra/mastra.provider';
import { ProspectController } from './prospect.controller';
import { ProspectService } from './prospect.service';
import { ConversationSessionService } from './services/conversation-session.service';
import { AiInfrastructureModule } from '../infrastructure/ai-infrastructure.module';
import { CapabilityRegistryModule } from './capabilities/capability-registry.module';

@Module({
  imports: [
    CacheModule,
    PrismaModule,
    EventBusModule,
    McpToolsModule,
    ModerationModule,
    ConfigModule,
    forwardRef(() => AgentsModule),
    OrchestratorModule,
    AiInfrastructureModule,
    CapabilityRegistryModule,
  ],
  controllers: [SallyAiController, ProspectController],
  providers: [SallyAiService, MastraProvider, ProspectService, ConversationSessionService],
  exports: [SallyAiService, MastraProvider, AiInfrastructureModule, CapabilityRegistryModule],
})
export class SallyAiModule {}
