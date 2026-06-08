import { Module, forwardRef } from '@nestjs/common';

import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { McpToolsModule } from '../mcp/mcp-tools.module';
import { SallyAiModule } from '../sally-ai/sally-ai.module';
import { AgentRegistry } from './agent.registry';
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

@Module({
  imports: [McpToolsModule, PrismaModule, forwardRef(() => SallyAiModule)],
  providers: [
    AgentRegistry,
    DispatchAgent,
    BillingAgent,
    ComplianceAgent,
    SafetyAgent,
    RouteAgent,
    PayrollAgent,
    MaintenanceAgent,
    FuelAgent,
    DriverAgent,
    CustomerAgent,
    SupportAgent,
    ProspectAgent,
  ],
  exports: [AgentRegistry],
})
export class AgentsModule {}
