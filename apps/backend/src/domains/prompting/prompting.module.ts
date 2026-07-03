import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { CacheModule } from '../../platform-glue/cache/cache.module';
import { PromptingService } from './prompting.service';
import { ChatPromptRegistrar } from './registrars/chat-prompt.registrar';
import { ServiceFallbackRegistrar } from './registrars/service-fallback.registrar';

/**
 * Global prompt management. Any domain can inject {@link PromptingService}
 * without importing this module — removes the old forwardRef cycle between
 * SkillsModule and AssistantAiModule.
 *
 * NOTE: Desk responsibility prompts are registered by each responsibility's
 * own module under domains/desk/responsibilities/ — they live with the
 * workflow code, not here.
 */
@Global()
@Module({
  imports: [ConfigModule, CacheModule],
  providers: [PromptingService, ChatPromptRegistrar, ServiceFallbackRegistrar],
  exports: [PromptingService],
})
export class PromptingModule {}
