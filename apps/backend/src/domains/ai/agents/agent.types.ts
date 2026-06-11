// UserMode is a plain string in the DB (not a Prisma enum). It mirrors the
// user's role and is used for greeting copy + routing. Add modes as you grow
// the assistant's surfaces.
export type UserMode = 'owner' | 'admin' | 'member' | 'super_admin';

// The starter ships ONE generic agent. Add agent ids here as you register
// more specialist agents in agents.module.ts.
export const AGENT_IDS = ['assistant'] as const;

export type AgentId = (typeof AGENT_IDS)[number];

export interface AgentContext {
  userMode: UserMode;
  tenantId: number;
  /**
   * Wire-format string user id (JWT `sub` — e.g. `"user_demo_owner"`).
   * Flows into Langfuse tags and tool-arg `_userId` injection.
   */
  userId: string;
  /**
   * Resolved numeric DB id (`User.id`). Needed for `AgentPrincipal`
   * construction when tools route through `InvocationPipelineService`,
   * and for the RLS session variable `app.current_user_id`. Callers resolve via
   * `BaseTenantController.getUserDbId` (or `AssistantAiService.getUserDbId`)
   * before entering agent.chat().
   */
  userDbId: number;
  conversationId: string;
  inputMode: 'text' | 'voice';
  taskSkillContent?: string;
  voiceInstructions?: string;
}

export interface ChatChunk {
  type: 'text-delta' | 'card' | 'suspend' | 'blocked' | 'complete' | 'followups';
  data: string;
}

export interface AgentResult {
  text: string;
  structured?: Record<string, unknown>;
}

export interface AgentStatus {
  state: 'idle' | 'working' | 'monitoring' | 'scheduled';
  summary: string;
  nextRun?: string;
}

export interface AssistantAgentContract {
  readonly id: AgentId;
  readonly displayName: string;
  readonly mastraAgentId: string;
  readonly domainSkills: string[];
  readonly taskSkills: string[];
  readonly personas: UserMode[];

  chat(message: string, ctx: AgentContext): AsyncGenerator<ChatChunk>;
  execute(action: string, params: Record<string, unknown>, ctx: AgentContext): Promise<AgentResult>;
  getStatus(tenantId: number): Promise<AgentStatus>;
}

export interface AgentDefinition {
  id: AgentId;
  displayName: string;
  mastraAgentId: string;
  modelAlias: 'fast' | 'standard';
  domainSkills: string[];
  taskSkills: string[];
  personas: UserMode[];
  maxToolSteps: number;
}
