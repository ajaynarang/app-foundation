import { Injectable, NotFoundException } from '@nestjs/common';

import { AgentId, SallyAgent, UserMode } from './agent.types';
import { BillingAgent } from './billing.agent';
import { ComplianceAgent } from './compliance.agent';
import { CustomerAgent } from './customer.agent';
import { DispatchAgent } from './dispatch.agent';
import { DriverAgent } from './driver.agent';
import { FuelAgent } from './fuel.agent';
import { MaintenanceAgent } from './maintenance.agent';
import { PayrollAgent } from './payroll.agent';
import { ProspectAgent } from './prospect.agent';
import { RouteAgent } from './route.agent';
import { SafetyAgent } from './safety.agent';
import { SupportAgent } from './support.agent';

@Injectable()
export class AgentRegistry {
  private readonly agents = new Map<AgentId, SallyAgent>();

  constructor(
    dispatch: DispatchAgent,
    billing: BillingAgent,
    compliance: ComplianceAgent,
    safety: SafetyAgent,
    route: RouteAgent,
    payroll: PayrollAgent,
    maintenance: MaintenanceAgent,
    fuel: FuelAgent,
    driver: DriverAgent,
    customer: CustomerAgent,
    support: SupportAgent,
    prospect: ProspectAgent,
  ) {
    const all: SallyAgent[] = [
      dispatch,
      billing,
      compliance,
      safety,
      route,
      payroll,
      maintenance,
      fuel,
      driver,
      customer,
      support,
      prospect,
    ];
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
