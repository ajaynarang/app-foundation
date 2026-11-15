import { Module, forwardRef } from '@nestjs/common';
import { McpToolsModule } from '../mcp/mcp-tools.module';
import { EntitlementsModule } from '@appshore/platform/domains/entitlements/entitlements.module';
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
import { AgentActionsController } from './agent-actions.controller';
import { AgentActionsService } from './agent-actions.service';
import { TOOL_AVAILABILITY_RULES, ToolAvailabilityService } from './tool-availability.service';

@Module({
  // EntitlementsModule: the tool side of the plan rule is the same service PlanGuard runs (ToolAccessPolicyService).
  imports: [forwardRef(() => McpToolsModule), EntitlementsModule, CacheModule],
  controllers: [AgentActivityController, DeveloperScopesController, AgentActionsController],
  providers: [
    ScopeRegistryService,
    HitlPolicyService,
    ToolExecutorService,
    AgentInvocationLoggerService,
    InvocationPipelineService,
    HitlChallengeService,
    RateLimitService,
    AgentActivityService,
    AgentActionsService,
    ToolAccessPolicyService,
    // Tool availability rules: the starter ships none. Replace with a factory that builds your rules (see
    // tool-availability.service.ts); an unavailable tool is left out of tools/list and every chat toolset.
    { provide: TOOL_AVAILABILITY_RULES, useValue: [] },
    ToolAvailabilityService,
  ],
  exports: [
    ScopeRegistryService,
    HitlPolicyService,
    InvocationPipelineService,
    AgentInvocationLoggerService,
    HitlChallengeService,
    RateLimitService,
    AgentActivityService,
    ToolAccessPolicyService,
    ToolAvailabilityService,
  ],
})
export class AgentContractModule {}
