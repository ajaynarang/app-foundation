import { ToolNames } from '../../../ai/agent-contract/tool-names.constants';

/**
 * PersonaConfig — access control only.
 *
 * System prompts are now assembled dynamically from lean base prompts + skills.
 * See base-prompts.ts for agent prompts and skills/ for domain knowledge.
 */
export interface PersonaConfig {
  modelAlias: 'fast' | 'standard';
  allowedTools: string[];
  maxToolSteps: number;
}

/**
 * Persona configurations for each user mode.
 *
 * - `allowedTools`: structural guardrail — only these MCP tools are exposed to Claude.
 *   Note: `confirm-action` is a Mastra tool auto-injected by McpToolService
 *   for personas with write tools. It is NOT listed here.
 * - `modelAlias`: maps to ai-provider.ts aliases (fast = Haiku, standard = Sonnet).
 * - `maxToolSteps`: limits how many tool-call rounds the agent can make.
 */
export const PERSONA_CONFIGS: Record<string, PersonaConfig> = {
  prospect: {
    modelAlias: 'fast',
    allowedTools: [
      ToolNames.HEALTH_CHECK,
      ToolNames.SEARCH_KB,
      ToolNames.GET_PRODUCT_INFO,
      ToolNames.REQUEST_DEMO,
      ToolNames.GET_PRICING,
      ToolNames.GET_CAPABILITIES,
    ],
    maxToolSteps: 3,
  },
  customer: {
    modelAlias: 'fast',
    allowedTools: [
      ToolNames.HEALTH_CHECK,
      ToolNames.QUERY_MY_SHIPMENTS,
      ToolNames.GET_SHIPMENT_DETAIL,
      ToolNames.GET_MY_DOCUMENTS,
      ToolNames.GET_MY_INVOICES,
      // Product help
      ToolNames.SEARCH_KB,
      ToolNames.GET_PRODUCT_INFO,
      // Support
      ToolNames.CREATE_SUPPORT_TICKET,
      // Help
      ToolNames.GET_CAPABILITIES,
    ],
    maxToolSteps: 5,
  },
  dispatcher: {
    modelAlias: 'standard',
    allowedTools: [
      ToolNames.HEALTH_CHECK,
      // Fleet operations
      ToolNames.QUERY_LOADS,
      ToolNames.GET_LOAD_DETAIL,
      ToolNames.QUERY_DRIVERS,
      ToolNames.GET_DRIVER_DETAIL,
      ToolNames.GET_DRIVER_HOS,
      ToolNames.QUERY_VEHICLES,
      ToolNames.GET_VEHICLE_DETAIL,
      ToolNames.GET_FLEET_STATUS,
      ToolNames.GET_ALERTS,
      ToolNames.ACKNOWLEDGE_ALERT,
      ToolNames.RESOLVE_ALERT,
      ToolNames.PLAN_ROUTE,
      ToolNames.GET_ROUTE_STATUS,
      // Load actions
      ToolNames.ASSIGN_LOAD,
      ToolNames.UPDATE_LOAD_STATUS,
      ToolNames.UPDATE_LOAD,
      ToolNames.ADD_LOAD_NOTE,
      ToolNames.DUPLICATE_LOAD,
      ToolNames.GENERATE_LOAD_FROM_LANE,
      // Driver & vehicle management
      ToolNames.UPDATE_DRIVER,
      ToolNames.UPDATE_DRIVER_STATUS,
      ToolNames.UPDATE_VEHICLE,
      ToolNames.UPDATE_VEHICLE_STATUS,
      // Invoicing
      ToolNames.QUERY_INVOICES,
      ToolNames.GET_INVOICE_DETAIL,
      ToolNames.GET_INVOICE_SUMMARY,
      ToolNames.SEND_INVOICE,
      ToolNames.VOID_INVOICE,
      ToolNames.RECORD_PAYMENT,
      ToolNames.GENERATE_INVOICE,
      ToolNames.SUBMIT_INVOICE_TO_FACTOR,
      // Settlements
      ToolNames.QUERY_SETTLEMENTS,
      ToolNames.GET_SETTLEMENT_DETAIL,
      ToolNames.GET_SETTLEMENT_SUMMARY,
      ToolNames.GET_DRIVER_PAY_STRUCTURE,
      ToolNames.APPROVE_SETTLEMENT,
      // Customers
      ToolNames.QUERY_CUSTOMERS,
      ToolNames.GET_CUSTOMER_DETAIL,
      ToolNames.GET_CUSTOMER_PAYMENT_STATS,
      // Billing
      ToolNames.GET_BILLING_READINESS,
      ToolNames.APPROVE_FOR_BILLING,
      ToolNames.GET_LOAD_CHARGES,
      // Shield compliance
      ToolNames.GET_SHIELD_SCORE,
      ToolNames.GET_SHIELD_FINDINGS,
      ToolNames.TRIGGER_SHIELD_AUDIT,
      // Documents
      ToolNames.GET_DOCUMENT_COMPLIANCE,
      ToolNames.REQUEST_DOCUMENT_UPLOAD,
      // Product help
      ToolNames.SEARCH_KB,
      ToolNames.GET_PRODUCT_INFO,
      // Reports
      ToolNames.GENERATE_CUSTOM_REPORT,
      // Support
      ToolNames.CREATE_SUPPORT_TICKET,
      // Help
      ToolNames.GET_CAPABILITIES,
    ],
    maxToolSteps: 10,
  },
  driver: {
    modelAlias: 'fast',
    allowedTools: [
      ToolNames.HEALTH_CHECK,
      ToolNames.GET_MY_ROUTE,
      ToolNames.GET_MY_HOS,
      ToolNames.GET_MY_NEXT_STOP,
      ToolNames.REPORT_DELAY,
      ToolNames.REPORT_ARRIVAL,
      ToolNames.REPORT_FUEL_STOP,
      // Stop status + issue reporting
      ToolNames.UPDATE_STOP_STATUS,
      ToolNames.REPORT_ISSUE,
      // Driver pay
      ToolNames.GET_MY_SETTLEMENT,
      ToolNames.GET_MY_LOADS,
      ToolNames.GET_MY_PAY_STRUCTURE,
      // Documents
      ToolNames.REQUEST_DOCUMENT_UPLOAD,
      // Product help
      ToolNames.SEARCH_KB,
      ToolNames.GET_PRODUCT_INFO,
      // Support
      ToolNames.CREATE_SUPPORT_TICKET,
      // Help
      ToolNames.GET_CAPABILITIES,
    ],
    maxToolSteps: 6,
  },
  owner: {
    modelAlias: 'standard',
    allowedTools: [
      ToolNames.HEALTH_CHECK,
      // Fleet operations
      ToolNames.QUERY_LOADS,
      ToolNames.GET_LOAD_DETAIL,
      ToolNames.QUERY_DRIVERS,
      ToolNames.GET_DRIVER_DETAIL,
      ToolNames.GET_DRIVER_HOS,
      ToolNames.QUERY_VEHICLES,
      ToolNames.GET_VEHICLE_DETAIL,
      ToolNames.GET_FLEET_STATUS,
      ToolNames.GET_ALERTS,
      ToolNames.ACKNOWLEDGE_ALERT,
      ToolNames.RESOLVE_ALERT,
      ToolNames.PLAN_ROUTE,
      ToolNames.GET_ROUTE_STATUS,
      // Load actions
      ToolNames.ASSIGN_LOAD,
      ToolNames.UPDATE_LOAD_STATUS,
      ToolNames.UPDATE_LOAD,
      ToolNames.ADD_LOAD_NOTE,
      ToolNames.DUPLICATE_LOAD,
      ToolNames.GENERATE_LOAD_FROM_LANE,
      // Driver & vehicle management
      ToolNames.UPDATE_DRIVER,
      ToolNames.UPDATE_DRIVER_STATUS,
      ToolNames.UPDATE_VEHICLE,
      ToolNames.UPDATE_VEHICLE_STATUS,
      // Invoicing
      ToolNames.QUERY_INVOICES,
      ToolNames.GET_INVOICE_DETAIL,
      ToolNames.GET_INVOICE_SUMMARY,
      ToolNames.SEND_INVOICE,
      ToolNames.VOID_INVOICE,
      ToolNames.RECORD_PAYMENT,
      ToolNames.GENERATE_INVOICE,
      ToolNames.SUBMIT_INVOICE_TO_FACTOR,
      // Settlements
      ToolNames.QUERY_SETTLEMENTS,
      ToolNames.GET_SETTLEMENT_DETAIL,
      ToolNames.GET_SETTLEMENT_SUMMARY,
      ToolNames.GET_DRIVER_PAY_STRUCTURE,
      ToolNames.APPROVE_SETTLEMENT,
      // Customers
      ToolNames.QUERY_CUSTOMERS,
      ToolNames.GET_CUSTOMER_DETAIL,
      ToolNames.GET_CUSTOMER_PAYMENT_STATS,
      // Billing
      ToolNames.GET_BILLING_READINESS,
      ToolNames.APPROVE_FOR_BILLING,
      ToolNames.GET_LOAD_CHARGES,
      // Shield compliance
      ToolNames.GET_SHIELD_SCORE,
      ToolNames.GET_SHIELD_FINDINGS,
      ToolNames.TRIGGER_SHIELD_AUDIT,
      // Documents
      ToolNames.GET_DOCUMENT_COMPLIANCE,
      ToolNames.REQUEST_DOCUMENT_UPLOAD,
      // Reports
      ToolNames.GENERATE_CUSTOM_REPORT,
      // Product help
      ToolNames.SEARCH_KB,
      ToolNames.GET_PRODUCT_INFO,
      // Support
      ToolNames.CREATE_SUPPORT_TICKET,
      // Help
      ToolNames.GET_CAPABILITIES,
    ],
    maxToolSteps: 10,
  },
  admin: {
    modelAlias: 'standard',
    allowedTools: [
      ToolNames.HEALTH_CHECK,
      // Fleet operations
      ToolNames.QUERY_LOADS,
      ToolNames.GET_LOAD_DETAIL,
      ToolNames.QUERY_DRIVERS,
      ToolNames.GET_DRIVER_DETAIL,
      ToolNames.GET_DRIVER_HOS,
      ToolNames.QUERY_VEHICLES,
      ToolNames.GET_VEHICLE_DETAIL,
      ToolNames.GET_FLEET_STATUS,
      ToolNames.GET_ALERTS,
      ToolNames.ACKNOWLEDGE_ALERT,
      ToolNames.RESOLVE_ALERT,
      ToolNames.PLAN_ROUTE,
      ToolNames.GET_ROUTE_STATUS,
      // Load actions
      ToolNames.ASSIGN_LOAD,
      ToolNames.UPDATE_LOAD_STATUS,
      ToolNames.UPDATE_LOAD,
      ToolNames.ADD_LOAD_NOTE,
      ToolNames.DUPLICATE_LOAD,
      ToolNames.GENERATE_LOAD_FROM_LANE,
      // Driver & vehicle management
      ToolNames.UPDATE_DRIVER,
      ToolNames.UPDATE_DRIVER_STATUS,
      ToolNames.UPDATE_VEHICLE,
      ToolNames.UPDATE_VEHICLE_STATUS,
      // Invoicing
      ToolNames.QUERY_INVOICES,
      ToolNames.GET_INVOICE_DETAIL,
      ToolNames.GET_INVOICE_SUMMARY,
      ToolNames.SEND_INVOICE,
      ToolNames.VOID_INVOICE,
      ToolNames.RECORD_PAYMENT,
      ToolNames.GENERATE_INVOICE,
      ToolNames.SUBMIT_INVOICE_TO_FACTOR,
      // Settlements
      ToolNames.QUERY_SETTLEMENTS,
      ToolNames.GET_SETTLEMENT_DETAIL,
      ToolNames.GET_SETTLEMENT_SUMMARY,
      ToolNames.GET_DRIVER_PAY_STRUCTURE,
      ToolNames.APPROVE_SETTLEMENT,
      // Customers
      ToolNames.QUERY_CUSTOMERS,
      ToolNames.GET_CUSTOMER_DETAIL,
      ToolNames.GET_CUSTOMER_PAYMENT_STATS,
      // Billing
      ToolNames.GET_BILLING_READINESS,
      ToolNames.APPROVE_FOR_BILLING,
      ToolNames.GET_LOAD_CHARGES,
      // Shield compliance
      ToolNames.GET_SHIELD_SCORE,
      ToolNames.GET_SHIELD_FINDINGS,
      ToolNames.TRIGGER_SHIELD_AUDIT,
      // Documents
      ToolNames.GET_DOCUMENT_COMPLIANCE,
      ToolNames.REQUEST_DOCUMENT_UPLOAD,
      // Reports
      ToolNames.GENERATE_CUSTOM_REPORT,
      // Product help
      ToolNames.SEARCH_KB,
      ToolNames.GET_PRODUCT_INFO,
      // Support
      ToolNames.CREATE_SUPPORT_TICKET,
      // Help
      ToolNames.GET_CAPABILITIES,
    ],
    maxToolSteps: 10,
  },
  super_admin: {
    modelAlias: 'standard',
    allowedTools: [
      ToolNames.HEALTH_CHECK,
      // Fleet operations
      ToolNames.QUERY_LOADS,
      ToolNames.GET_LOAD_DETAIL,
      ToolNames.QUERY_DRIVERS,
      ToolNames.GET_DRIVER_DETAIL,
      ToolNames.GET_DRIVER_HOS,
      ToolNames.QUERY_VEHICLES,
      ToolNames.GET_VEHICLE_DETAIL,
      ToolNames.GET_FLEET_STATUS,
      ToolNames.GET_ALERTS,
      ToolNames.ACKNOWLEDGE_ALERT,
      ToolNames.RESOLVE_ALERT,
      ToolNames.PLAN_ROUTE,
      ToolNames.GET_ROUTE_STATUS,
      // Load actions
      ToolNames.ASSIGN_LOAD,
      ToolNames.UPDATE_LOAD_STATUS,
      ToolNames.UPDATE_LOAD,
      ToolNames.ADD_LOAD_NOTE,
      ToolNames.DUPLICATE_LOAD,
      ToolNames.GENERATE_LOAD_FROM_LANE,
      // Driver & vehicle management
      ToolNames.UPDATE_DRIVER,
      ToolNames.UPDATE_DRIVER_STATUS,
      ToolNames.UPDATE_VEHICLE,
      ToolNames.UPDATE_VEHICLE_STATUS,
      // Invoicing
      ToolNames.QUERY_INVOICES,
      ToolNames.GET_INVOICE_DETAIL,
      ToolNames.GET_INVOICE_SUMMARY,
      ToolNames.SEND_INVOICE,
      ToolNames.VOID_INVOICE,
      ToolNames.RECORD_PAYMENT,
      ToolNames.GENERATE_INVOICE,
      ToolNames.SUBMIT_INVOICE_TO_FACTOR,
      // Settlements
      ToolNames.QUERY_SETTLEMENTS,
      ToolNames.GET_SETTLEMENT_DETAIL,
      ToolNames.GET_SETTLEMENT_SUMMARY,
      ToolNames.GET_DRIVER_PAY_STRUCTURE,
      ToolNames.APPROVE_SETTLEMENT,
      // Customers
      ToolNames.QUERY_CUSTOMERS,
      ToolNames.GET_CUSTOMER_DETAIL,
      ToolNames.GET_CUSTOMER_PAYMENT_STATS,
      // Billing
      ToolNames.GET_BILLING_READINESS,
      ToolNames.APPROVE_FOR_BILLING,
      ToolNames.GET_LOAD_CHARGES,
      // Shield compliance
      ToolNames.GET_SHIELD_SCORE,
      ToolNames.GET_SHIELD_FINDINGS,
      ToolNames.TRIGGER_SHIELD_AUDIT,
      // Documents
      ToolNames.GET_DOCUMENT_COMPLIANCE,
      ToolNames.REQUEST_DOCUMENT_UPLOAD,
      // Product help
      ToolNames.SEARCH_KB,
      ToolNames.GET_PRODUCT_INFO,
      // Support
      ToolNames.CREATE_SUPPORT_TICKET,
      // Help
      ToolNames.GET_CAPABILITIES,
    ],
    maxToolSteps: 10,
  },
  support: {
    modelAlias: 'standard',
    allowedTools: [
      ToolNames.HEALTH_CHECK,
      // Fleet read tools for investigating issues
      ToolNames.QUERY_LOADS,
      ToolNames.GET_LOAD_DETAIL,
      ToolNames.QUERY_DRIVERS,
      ToolNames.GET_DRIVER_DETAIL,
      ToolNames.GET_DRIVER_HOS,
      ToolNames.QUERY_VEHICLES,
      ToolNames.GET_VEHICLE_DETAIL,
      ToolNames.GET_FLEET_STATUS,
      ToolNames.GET_ALERTS,
      // Invoicing read tools
      ToolNames.QUERY_INVOICES,
      ToolNames.GET_INVOICE_DETAIL,
      ToolNames.GET_INVOICE_SUMMARY,
      // Settlement read tools
      ToolNames.QUERY_SETTLEMENTS,
      ToolNames.GET_SETTLEMENT_DETAIL,
      ToolNames.GET_SETTLEMENT_SUMMARY,
      // Customers
      ToolNames.QUERY_CUSTOMERS,
      ToolNames.GET_CUSTOMER_DETAIL,
      // Billing
      ToolNames.GET_BILLING_READINESS,
      ToolNames.GET_LOAD_CHARGES,
      // Shield
      ToolNames.GET_SHIELD_SCORE,
      ToolNames.GET_SHIELD_FINDINGS,
      // Documents
      ToolNames.GET_DOCUMENT_COMPLIANCE,
      ToolNames.REQUEST_DOCUMENT_UPLOAD,
      // Product help
      ToolNames.SEARCH_KB,
      ToolNames.GET_PRODUCT_INFO,
      // Support
      ToolNames.CREATE_SUPPORT_TICKET,
      // Help
      ToolNames.GET_CAPABILITIES,
    ],
    maxToolSteps: 8,
  },
};

export function getPersonaConfig(userMode: string): PersonaConfig {
  return PERSONA_CONFIGS[userMode] ?? PERSONA_CONFIGS.prospect;
}
