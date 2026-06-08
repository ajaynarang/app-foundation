import { Injectable, NotFoundException } from '@nestjs/common';

import { AgentId, SallyAgent, UserMode } from './agent.types';
import { AssistantAgent } from './assistant.agent';

@Injectable()
export class AgentRegistry {
  private readonly agents = new Map<AgentId, SallyAgent>();

  constructor(assistant: AssistantAgent) {
    const all: SallyAgent[] = [assistant];
    for (const agent of all) {
      this.agents.set(agent.id, agent);
    }
  }

  get(id: AgentId): SallyAgent {
    const agent = this.agents.get(id);
    if (!agent) throw new NotFoundException(`Unknown agent: ${id}`);
    return agent;
  }

  getForPersona(userMode: UserMode): SallyAgent[] {
    return Array.from(this.agents.values()).filter((a) => a.personas.includes(userMode));
  }

  getAll(): SallyAgent[] {
    return Array.from(this.agents.values());
  }
}
