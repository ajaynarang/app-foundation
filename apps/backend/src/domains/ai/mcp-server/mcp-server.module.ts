import { Module } from '@nestjs/common';
import { McpServerController } from './mcp-server.controller';
import { McpRootController } from './mcp-root.controller';
import { HitlStepUpController } from './hitl-step-up.controller';
import { McpServerService } from './mcp-server.service';
import { AgentRateLimitGuard } from './guards/agent-rate-limit.guard';
import { McpToolsModule } from '../mcp/mcp-tools.module';
import { RlsModule } from '../rls/rls.module';
import { OAuthProviderModule } from '../../platform/oauth-provider/oauth-provider.module';
import { AgentContractModule } from '../agent-contract/agent-contract.module';
import { AuthModule } from '../../../auth/auth.module';
import { ApiKeysModule } from '../../platform/api-keys/api-keys.module';

/**
 * MCP Server Module — Exposes SALLY tools to external AI clients
 * via MCP Streamable HTTP transport with OAuth 2.1 authentication.
 *
 * Two controllers:
 * - McpServerController handles /api/v1/mcp (standard prefixed route)
 * - McpRootController handles / (root, for Claude.ai which strips path after OAuth)
 * - HitlStepUpController handles POST /mcp/hitl/:token/step-up (PIN-based step-up for sensitive-tier tools)
 */
@Module({
  imports: [McpToolsModule, RlsModule, OAuthProviderModule, AgentContractModule, AuthModule, ApiKeysModule],
  controllers: [McpServerController, McpRootController, HitlStepUpController],
  providers: [McpServerService, AgentRateLimitGuard],
})
export class McpExternalServerModule {}
