import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { VoiceController } from './voice.controller';
import { VoiceService } from './voice.service';
import { VoiceAgentWorker } from './voice-agent.worker';

/**
 * Voice Module — LiveKit voice sessions for the assistant.
 *
 * Does NOT import AssistantAiModule to avoid circular dependencies
 * (AssistantAiModule → McpToolsModule → DriversModule → ... → AssistantAiModule).
 * Instead, VoiceAgentWorker resolves AssistantAiService lazily via ModuleRef.
 *
 * Must be registered inside AiModule (which already exports AssistantAiService).
 */
@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [VoiceController],
  providers: [VoiceService, VoiceAgentWorker],
})
export class VoiceModule {}
