import { Module, forwardRef } from '@nestjs/common';
import { McpModule } from '@rekog/mcp-nest';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { CacheModule } from '../../../infrastructure/cache/cache.module';
import { HealthTool } from './tools/health.tool';
import { KnowledgeTool } from './tools/knowledge.tool';
import { LeadCaptureTool } from './tools/lead-capture.tool';
import { FleetQueryTool } from './tools/fleet-query.tool';
import { AlertManagementTool } from './tools/alert-management.tool';
import { RoutePlanningTool } from './tools/route-planning.tool';
import { DriverReadTool } from './tools/driver-read.tool';
import { DriverActionTool } from './tools/driver-action.tool';
import { InvoiceTool } from './tools/invoice.tool';
import { InvoiceActionTool } from './tools/invoice-action.tool';
import { SettlementTool } from './tools/settlement.tool';
import { SettlementActionTool } from './tools/settlement-action.tool';
import { CustomerTool } from './tools/customer.tool';
import { BillingTool } from './tools/billing.tool';
import { ShieldTool } from './tools/shield.tool';
import { IftaTool } from './tools/ifta.tool';
import { DocumentTool } from './tools/document.tool';
import { DriverPayTool } from './tools/driver-pay.tool';
import { CustomerPortalTool } from './tools/customer-portal.tool';
import { DriverContextTool } from './tools/driver-context.tool';
import { DriverQueryTool } from './tools/fleet/driver-query.tool';
import { VehicleQueryTool } from './tools/fleet/vehicle-query.tool';
import { LoadReadTool } from './tools/fleet/load-read.tool';
import { LoadActionTool } from './tools/fleet/load-action.tool';
import { LoadCreateTool } from './tools/fleet/load-create.tool';
import { RateconAcceptTool } from './tools/fleet/ratecon-accept.tool';
import { LaneActionTool } from './tools/fleet/lane-action.tool';
import { DriverMgmtActionTool } from './tools/fleet/driver-mgmt-action.tool';
import { DriverCreateTool } from './tools/fleet/driver-create.tool';
import { VehicleActionTool } from './tools/fleet/vehicle-action.tool';
import { TrailerQueryTool } from './tools/fleet/trailer-query.tool';
import { TrailerActionTool } from './tools/fleet/trailer-action.tool';
import { StopActionTool } from './tools/fleet/stop-action.tool';
import { TripActionTool } from './tools/fleet/trip-action.tool';
import { VehicleRetireTool } from './tools/fleet/vehicle-retire.tool';
import { DriverTerminateTool } from './tools/fleet/driver-terminate.tool';
import { AlertCreateTool } from './tools/alerts/alert-create.tool';
import { CustomerCreateTool } from './tools/customer-create.tool';
import { CustomerDeactivateTool } from './tools/customer-deactivate.tool';
import { ShieldDisputeTool } from './tools/shield-dispute.tool';
import { SettlementCreateTool } from './tools/settlement-create.tool';
import { CommsDriverTool } from './tools/comms-driver.tool';
import { CommsCustomerTool } from './tools/comms-customer.tool';
import { CommsBulkDriversTool } from './tools/comms-bulk-drivers.tool';
import { CapabilitiesTool } from './tools/help/capabilities.tool';
import { CustomFieldQueryTool } from './tools/custom-field-query.tool';
import { EDIQueryTool } from './tools/edi-query.tool';
import { EDIActionTool } from './tools/edi-action.tool';
import { ReportTool } from './tools/report.tool';
import { SupportTicketTool } from './tools/support-ticket.tool';
import { SendEmailTool } from './tools/send-email.tool';
import { SendSmsTool } from './tools/send-sms.tool';
// Desk v3 AR Follow-up consumes 7 tools — all live on existing domain tool
// classes. Nothing new to import here:
//   • InvoiceTool          — get-invoice-detail, get-communication-history
//   • InvoiceActionTool    — record-promise-to-pay, escalate-invoice
//   • CustomerTool         — get-customer-detail, get-customer-payment-stats
//   • SendEmailTool        — send-email (already registered)
import { McpToolService } from './mcp-tool.service';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';
import { RlsModule } from '../rls/rls.module';
import { InvoicingModule } from '../../financials/invoicing/invoicing.module';
import { PaymentsModule } from '../../financials/payments/payments.module';
import { SettlementsModule } from '../../financials/settlements/settlements.module';
import { CustomersModule } from '../../fleet/customers/customers.module';
import { CloseOutModule } from '../../financials/close-out/close-out.module';
import { ShieldModule } from '../../operations/shield/shield.module';
import { DocumentsModule } from '../../fleet/documents/documents.module';
import { LoadsModule } from '../../fleet/loads/loads.module';
import { DriversModule } from '../../fleet/drivers/drivers.module';
import { VehiclesModule } from '../../fleet/vehicles/vehicles.module';
import { RoutePlanningModule } from '../../routing/route-planning/route-planning.module';
import { TrailersModule } from '../../fleet/trailers/trailers.module';
import { RecurringLanesModule } from '../../fleet/recurring-lanes/recurring-lanes.module';
import { EDIModule } from '../../integrations/edi/edi.module';
import { IftaModule } from '../../operations/ifta/ifta.module';
import { AnalyticsModule } from '../../analytics/analytics.module';
import { SupportModule } from '../../operations/support/support.module';
import { TripModule } from '../../fleet/trips/trip.module';
import { AgentContractModule } from '../agent-contract/agent-contract.module';
import { TenantsModule } from '../../platform/tenants/tenants.module';

/**
 * MCP Tools Module — registers all MCP tools for Sally AI.
 *
 * Tools are auto-discovered by the AI SDK agent via the MCP client.
 * McpToolService bridges MCP tools to AI SDK format for use in agent.stream().
 * Add new tool providers to this module to make them available to the agent.
 */
@Module({
  imports: [
    McpModule.forRoot({
      name: 'sally-ai-tools',
      version: '1.0.0',
      // The rekog HTTP transport is unused — Sally's external MCP entrypoint
      // is McpServerController at `/api/v1/mcp`. Remap the rekog endpoint to
      // an internal path so it doesn't shadow our OAuth-guarded controller.
      mcpEndpoint: '_internal/mcp',
    }),
    PrismaModule,
    CacheModule,
    KnowledgeBaseModule,
    RlsModule,
    forwardRef(() => InvoicingModule),
    PaymentsModule,
    SettlementsModule,
    CustomersModule,
    TenantsModule,
    CloseOutModule,
    forwardRef(() => ShieldModule),
    DocumentsModule,
    forwardRef(() => LoadsModule),
    forwardRef(() => DriversModule),
    forwardRef(() => VehiclesModule),
    forwardRef(() => TrailersModule),
    forwardRef(() => RoutePlanningModule),
    RecurringLanesModule,
    EDIModule,
    IftaModule,
    AnalyticsModule,
    SupportModule,
    TripModule,
    forwardRef(() => AgentContractModule),
  ],
  providers: [
    // Existing tools
    HealthTool,
    KnowledgeTool,
    LeadCaptureTool,
    FleetQueryTool,
    AlertManagementTool,
    RoutePlanningTool,
    DriverReadTool,
    DriverActionTool,
    // Invoice tools
    InvoiceTool,
    InvoiceActionTool,
    // Settlement tools
    SettlementTool,
    SettlementActionTool,
    SettlementCreateTool,
    // Customer tools
    CustomerTool,
    CustomerCreateTool,
    CustomerDeactivateTool,
    // Billing / Close-out tools
    BillingTool,
    // Shield compliance tools
    ShieldTool,
    ShieldDisputeTool,
    // Document compliance tools
    DocumentTool,
    // Driver pay tools
    DriverPayTool,
    // Customer portal tools
    CustomerPortalTool,
    // Driver context tools
    DriverContextTool,
    // Fleet query tools (Phase 1)
    DriverQueryTool,
    VehicleQueryTool,
    LoadReadTool,
    // Fleet action tools (Phase 2)
    LoadActionTool,
    LoadCreateTool,
    RateconAcceptTool,
    LaneActionTool,
    DriverMgmtActionTool,
    DriverCreateTool,
    VehicleActionTool,
    TrailerQueryTool,
    TrailerActionTool,
    StopActionTool,
    // Trip tools
    TripActionTool,
    // Phase C sensitive tools
    VehicleRetireTool,
    DriverTerminateTool,
    // Alert tools (Phase 2)
    AlertCreateTool,
    // EDI tools
    EDIQueryTool,
    EDIActionTool,
    // IFTA fuel tax tools
    IftaTool,
    // Help tools (Phase 3)
    CapabilitiesTool,
    // Custom field tools
    CustomFieldQueryTool,
    // Report generation tool
    ReportTool,
    // Support ticket tool
    SupportTicketTool,
    // Comms tools (Phase C — typed, audit-surfaced)
    CommsDriverTool,
    CommsCustomerTool,
    CommsBulkDriversTool,
    // Cross-responsibility comms (used by chat + Desk workflows)
    SendEmailTool,
    SendSmsTool,
    // Service bridge
    McpToolService,
  ],
  exports: [McpModule, McpToolService],
})
export class McpToolsModule {}
