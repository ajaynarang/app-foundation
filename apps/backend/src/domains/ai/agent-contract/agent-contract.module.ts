import { Module, forwardRef } from '@nestjs/common';
import { McpToolsModule } from '../mcp/mcp-tools.module';
import { FeatureFlagsModule } from '@appshore/platform/domains/feature-flags/feature-flags.module';
import { PlansModule } from '@appshore/platform/domains/plans/plans.module';
import { PlanGuard } from '@appshore/platform/auth/guards/plan.guard';
import { CacheModule } from '../../../platform-glue/cache/cache.module';
import { ScopeRegistryService } from './scope-registry.service';
import { HitlPolicyService } from './hitl-policy.service';
import { ToolExecutorService } from './tool-executor.service';
import { AgentInvocationLoggerService } from './agent-invocation-logger.service';
import { InvocationPipelineService } from './invocation-pipeline.service';
import { HitlChallengeService } from './hitl-challenge.service';
import { RateLimitService } from './rate-limit.service';
import { ToolAccessPolicyService } from './tool-access-policy.service';
import { AgentActivityService } from './agent-activity.service';
import { AgentActivityController } from './agent-activity.controller';
import { DeveloperScopesController } from './developer-scopes.controller';

@Module({
  imports: [forwardRef(() => McpToolsModule), FeatureFlagsModule, PlansModule, CacheModule],
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
    // The tool side of the plan rule runs the real REST guard (see ToolAccessPolicyService.evaluateFeature).
    PlanGuard,
    ToolAccessPolicyService,
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
