import { Module, forwardRef } from '@nestjs/common';

import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { McpToolsModule } from '../mcp/mcp-tools.module';
import { AssistantAiModule } from '../assistant/assistant.module';
import { AgentRegistry } from './agent.registry';
import { AssistantAgent } from './assistant.agent';

@Module({
  imports: [McpToolsModule, PrismaModule, forwardRef(() => AssistantAiModule)],
  providers: [AgentRegistry, AssistantAgent],
  exports: [AgentRegistry],
})
export class AgentsModule {}
