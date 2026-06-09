import { Injectable, NotFoundException } from '@nestjs/common';

import { AgentId, AssistantAgentContract, UserMode } from './agent.types';
import { AssistantAgent } from './assistant.agent';

@Injectable()
export class AgentRegistry {
  private readonly agents = new Map<AgentId, AssistantAgentContract>();

  constructor(assistant: AssistantAgent) {
    const all: AssistantAgentContract[] = [assistant];
    for (const agent of all) {
      this.agents.set(agent.id, agent);
    }
  }

  get(id: AgentId): AssistantAgentContract {
    const agent = this.agents.get(id);
    if (!agent) throw new NotFoundException(`Unknown agent: ${id}`);
    return agent;
  }

  getForPersona(userMode: UserMode): AssistantAgentContract[] {
    return Array.from(this.agents.values()).filter((a) => a.personas.includes(userMode));
  }

  getAll(): AssistantAgentContract[] {
    return Array.from(this.agents.values());
  }
}
