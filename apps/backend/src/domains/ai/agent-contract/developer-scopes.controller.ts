import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AgentScopeSchema, SCOPE_DESCRIPTIONS, NEVER_EXTERNAL_SCOPES, type AgentScope } from '@sally/shared-types';
import { ScopeRegistryService } from './scope-registry.service';

export interface DeveloperScopeEntry {
  scope: AgentScope;
  summary: string;
  grantsPlainEnglish: string;
  hitlTier: 'none' | 'standard' | 'sensitive';
  sampleTools: string[];
}

/**
 * Platform-wide scope vocabulary endpoint.
 *
 * Not tenant-scoped — scope definitions are the same across the platform.
 * Authenticated (inherits the global JwtAuthGuard); any signed-in user
 * may read this list. Scopes in NEVER_EXTERNAL_SCOPES (e.g. platform:admin)
 * are filtered out so the developer portal never hints at internal-only grants.
 */
@ApiTags('Developer')
@ApiBearerAuth()
@Controller('developer/scopes')
export class DeveloperScopesController {
  constructor(private readonly scopeRegistry: ScopeRegistryService) {}

  @Get()
  @ApiOperation({
    summary: 'List scope vocabulary with descriptions, HITL tier, and live sample tools',
  })
  list(): DeveloperScopeEntry[] {
    const never = new Set<string>(NEVER_EXTERNAL_SCOPES);
    return AgentScopeSchema.options
      .filter((scope) => !never.has(scope))
      .map((scope) => {
        const desc = SCOPE_DESCRIPTIONS[scope];
        // Live tools from the registry take precedence over the hand-authored
        // sampleTools — this ensures the page never lists a tool that was
        // removed from the codebase. Falls back to the static list if the
        // registry hasn't been initialized yet or no tools are mapped.
        const liveTools = this.scopeRegistry.toolsForScope(scope).slice(0, 4);
        return {
          scope,
          summary: desc.summary,
          grantsPlainEnglish: desc.grantsPlainEnglish,
          hitlTier: desc.hitlTier,
          sampleTools: liveTools.length > 0 ? liveTools : desc.sampleTools,
        };
      });
  }
}
