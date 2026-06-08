import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { VoiceController } from './voice.controller';
import { VoiceService } from './voice.service';
import { VoiceAgentWorker } from './voice-agent.worker';

/**
 * Voice Module — LiveKit voice sessions for Sally AI.
 *
 * Does NOT import SallyAiModule to avoid circular dependencies
 * (SallyAiModule → McpToolsModule → DriversModule → ... → SallyAiModule).
 * Instead, VoiceAgentWorker resolves SallyAiService lazily via ModuleRef.
 *
 * Must be registered inside AiModule (which already exports SallyAiService).
 */
@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [VoiceController],
  providers: [VoiceService, VoiceAgentWorker],
})
export class VoiceModule {}
