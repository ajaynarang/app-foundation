import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { CacheModule } from '../../infrastructure/cache/cache.module';
import { PromptingService } from './prompting.service';
import { ChatPromptRegistrar } from './registrars/chat-prompt.registrar';
import { ServiceFallbackRegistrar } from './registrars/service-fallback.registrar';

/**
 * Global prompt management. Any domain can inject {@link PromptingService}
 * without importing this module — removes the old forwardRef cycle between
 * SkillsModule and AssistantAiModule.
 *
 * NOTE: DeskPromptRegistrar removed during v3 rewrite. AR Follow-up prompts
 * are registered by the backend-worker's AR Follow-up responsibility module
 * (P1.10) — they live with the workflow code, not here.
 */
@Global()
@Module({
  imports: [ConfigModule, CacheModule],
  providers: [PromptingService, ChatPromptRegistrar, ServiceFallbackRegistrar],
  exports: [PromptingService],
})
export class PromptingModule {}
