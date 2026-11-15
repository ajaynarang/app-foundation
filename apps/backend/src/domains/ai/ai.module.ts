import { Module } from '@nestjs/common';
import { AiInfrastructureModule } from './infrastructure/ai-infrastructure.module';
import { AssistantAiModule } from './assistant/assistant.module';
import { McpToolsModule } from './mcp/mcp-tools.module';
import { KnowledgeBaseModule } from './knowledge-base/knowledge-base.module';
import { ModerationModule } from './moderation/moderation.module';
import { McpExternalServerModule } from './mcp-server/mcp-server.module';
import { VoiceModule } from './voice/voice.module';
import { AgentContractModule } from './agent-contract/agent-contract.module';
import { AiConnectModule } from './routing/connect/ai-connect.module';
/**
 * AI Domain Module — aggregates all AI-related functionality.
 *
 * Submodules:
 * - Infrastructure: Shared LLM providers
 * - Assistant: Conversational assistant (AI SDK agent with MCP tools)
 * - MCP Tools: Model Context Protocol tool server (internal extension point)
 * - MCP External Server: MCP Streamable HTTP for external AI clients
 * - Knowledge Base: RAG knowledge base with pgvector search
 * - Moderation: Content moderation, guardrails, PII redaction
 * - Voice: LiveKit voice sessions
 * - AI settings: the workspace retention policy and its own AI keys (bring-your-own-key)
 */
@Module({
  imports: [
    AiInfrastructureModule,
    AssistantAiModule,
    McpToolsModule,
    McpExternalServerModule,
    KnowledgeBaseModule,
    ModerationModule,
    VoiceModule,
    AgentContractModule,
    AiConnectModule,
  ],
  exports: [
    AssistantAiModule,
    McpToolsModule,
    McpExternalServerModule,
    KnowledgeBaseModule,
    ModerationModule,
    AgentContractModule,
  ],
})
export class AiModule {}
