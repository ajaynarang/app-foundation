import type { AgentPrincipal } from './agent-principal';

export const AGENT_RATE_LIMIT_DEFAULTS: Record<AgentPrincipal['kind'], number> = {
  user: 600,
  desk_responsibility: 300,
  oauth_client: 120,
  api_key: 300,
} as const;

export const AGENT_RATE_LIMIT_WINDOW_SECONDS = 60;
