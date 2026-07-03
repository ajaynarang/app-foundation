import { Module, forwardRef } from '@nestjs/common';
import { McpToolsModule } from '../mcp/mcp-tools.module';
import { RlsModule } from '../rls/rls.module';
import { FeatureFlagsModule } from '@appshore/platform/domains/feature-flags/feature-flags.module';
import { CacheModule } from '../../../platform-glue/cache/cache.module';
import { ScopeRegistryService } from './scope-registry.service';
import { HitlPolicyService } from './hitl-policy.service';
import { ToolExecutorService } from './tool-executor.service';
import { AgentInvocationLoggerService } from './agent-invocation-logger.service';
import { InvocationPipelineService } from './invocation-pipeline.service';
import { HitlChallengeService } from './hitl-challenge.service';
import { RateLimitService } from './rate-limit.service';
import { AgentActivityService } from './agent-activity.service';
import { AgentActivityController } from './agent-activity.controller';
import { DeveloperScopesController } from './developer-scopes.controller';

@Module({
  imports: [forwardRef(() => McpToolsModule), RlsModule, FeatureFlagsModule, CacheModule],
  controllers: [AgentActivityController, DeveloperScopesController],
  providers: [
    ScopeRegistryService,
    HitlPolicyService,
    ToolExecutorService,
    AgentInvocationLoggerService,
    InvocationPipelineService,
    HitlChallengeService,
    RateLimitService,
    AgentActivityService,
  ],
  exports: [
    ScopeRegistryService,
    HitlPolicyService,
    InvocationPipelineService,
    AgentInvocationLoggerService,
    HitlChallengeService,
    RateLimitService,
    AgentActivityService,
  ],
})
export class AgentContractModule {}
