import { Module, forwardRef } from '@nestjs/common';
import { McpModule } from '@rekog/mcp-nest';
import { PrismaModule } from '@appshore/platform/infrastructure/database/prisma.module';
import { CacheModule } from '../../../platform-glue/cache/cache.module';
import { HealthTool } from './tools/health.tool';
import { KnowledgeTool } from './tools/knowledge.tool';
import { McpToolService } from './mcp-tool.service';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';
import { RlsModule } from '../rls/rls.module';
import { AgentContractModule } from '../agent-contract/agent-contract.module';

/**
 * MCP Tools Module — the extension point for the AI assistant's tool surface.
 *
 * This module ships EMPTY by design: only two sample tools are registered
 * (`HealthTool` and `KnowledgeTool`). They demonstrate the read-only and
 * knowledge-base patterns. Add your own domain tools below.
 *
 * Tools are auto-discovered by the AI SDK agent via the MCP client.
 * `McpToolService` bridges MCP tools to AI SDK format for use in agent.stream().
 *
 * To add a tool:
 *   1. Create a provider class with a `@Tool(...)` + `@RequiresScope(...)` method.
 *   2. Import any NestJS module its dependencies need into `imports[]`.
 *   3. Register the provider in `providers[]` below.
 */
@Module({
  imports: [
    McpModule.forRoot({
      name: 'app-ai-tools',
      version: '1.0.0',
      // The rekog HTTP transport is unused — the external MCP entrypoint is
      // McpServerController at `/api/v1/mcp`. Remap the rekog endpoint to an
      // internal path so it doesn't shadow the OAuth-guarded controller.
      mcpEndpoint: '_internal/mcp',
    }),
    PrismaModule,
    CacheModule,
    KnowledgeBaseModule,
    RlsModule,
    forwardRef(() => AgentContractModule),
    // Import the NestJS modules your tool providers depend on here.
  ],
  providers: [
    // Register your @Tool + @RequiresScope providers here.
    HealthTool,
    KnowledgeTool,
    // Service bridge
    McpToolService,
  ],
  exports: [McpModule, McpToolService],
})
export class McpToolsModule {}
