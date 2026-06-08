/**
 * Central registry of every MCP @Tool name exposed by Sally.
 *
 * Why this exists:
 *   - @Tool({ name: '...' }) is declared at each tool class but the SAME string
 *     is repeated by hand in mcp-tool.service.ts WRITE_TOOLS, persona.config.ts
 *     allowlists, and agent task-skill lists. Drift is inevitable.
 *   - This is the single source of truth; every one of those callers imports
 *     from here. Renaming a tool = one-line change in this file.
 *
 * Invariant (enforced by ScopeRegistryService at boot): every value in
 * ToolNames must match a registered @Tool; every registered @Tool name must
 * appear in ToolNames. New tool → add entry here AND in its @Tool decorator.
 */
export const ToolNames = {
  // ─── Queries (read) ──────────────────────────────────────────────────────
  QUERY_LOADS: 'query-loads',
  GET_LOAD_DETAIL: 'get-load-detail',
  QUERY_DRIVERS: 'query-drivers',
  GET_DRIVER_DETAIL: 'get-driver-detail',
  GET_DRIVER_HOS: 'get-driver-hos',
  QUERY_VEHICLES: 'query-vehicles',
  GET_VEHICLE_DETAIL: 'get-vehicle-detail',
  LIST_TRAILERS: 'list-trailers',
  GET_TRAILER: 'get-trailer',
  FIND_AVAILABLE_TRAILER: 'find-available-trailer',
  GET_FLEET_STATUS: 'get-fleet-status',
  QUERY_CUSTOMERS: 'query-customers',
  GET_CUSTOMER_DETAIL: 'get-customer-detail',
  GET_CUSTOMER_PAYMENT_STATS: 'get-customer-payment-stats',
  QUERY_INVOICES: 'query-invoices',
  GET_INVOICE_DETAIL: 'get-invoice-detail',
  GET_INVOICE_SUMMARY: 'get-invoice-summary',
  QUERY_SETTLEMENTS: 'query-settlements',
  GET_SETTLEMENT_DETAIL: 'get-settlement-detail',
  GET_SETTLEMENT_SUMMARY: 'get-settlement-summary',
  GET_DRIVER_PAY_STRUCTURE: 'get-driver-pay-structure',
  GET_BILLING_READINESS: 'get-billing-readiness',
  GET_LOAD_CHARGES: 'get-load-charges',
  GET_ALERTS: 'get-alerts',
  GET_SHIELD_SCORE: 'get-shield-score',
  GET_SHIELD_FINDINGS: 'get-shield-findings',
  GET_DOCUMENT_COMPLIANCE: 'get-document-compliance',
  GET_CUSTOM_FIELD_DEFINITIONS: 'get-custom-field-definitions',
  QUERY_TENDERS: 'query-tenders',
  GET_EDI_ANALYTICS: 'get-edi-analytics',
  GET_TRADING_PARTNERS: 'get-trading-partners',
  GET_EDI_MESSAGE_LOG: 'get-edi-message-log',
  GET_IFTA_SUMMARY: 'get-ifta-summary',
  GET_IFTA_STATE_BREAKDOWN: 'get-ifta-state-breakdown',
  QUERY_IFTA_QUARTERS: 'query-ifta-quarters',
  GET_ROUTE_STATUS: 'get-route-status',
  // Trip
  GET_TRIP_DETAIL: 'get-trip-detail',
  // Meta / system
  GET_CAPABILITIES: 'get-capabilities',
  HEALTH_CHECK: 'health-check',
  SEARCH_KB: 'search-kb',
  GET_PRODUCT_INFO: 'get-product-info',
  GET_PRICING: 'get-pricing',
  GET_DRIVER_ACTIVE_CONTEXT: 'get-driver-active-context',
  // Driver-self & customer-portal reads
  GET_MY_ROUTE: 'get-my-route',
  GET_MY_HOS: 'get-my-hos',
  GET_MY_NEXT_STOP: 'get-my-next-stop',
  GET_MY_SETTLEMENT: 'get-my-settlement',
  GET_MY_LOADS: 'get-my-loads',
  GET_MY_PAY_STRUCTURE: 'get-my-pay-structure',
  QUERY_MY_SHIPMENTS: 'query-my-shipments',
  GET_SHIPMENT_DETAIL: 'get-shipment-detail',
  GET_MY_DOCUMENTS: 'get-my-documents',
  GET_MY_INVOICES: 'get-my-invoices',
  // Desk reads — all entries removed by Desk v3 refactor (PR #637). The tool
  // implementations are gone. Do NOT re-add Desk v1 tool names here unless
  // you're also restoring the tool — scope-coverage will fail otherwise.

  // ─── Actions (write) ─────────────────────────────────────────────────────
  // Loads
  ASSIGN_LOAD: 'assign-load',
  UPDATE_LOAD_STATUS: 'update-load-status',
  UPDATE_LOAD: 'update-load', // renamed from update-load-fields (Task 3)
  ADD_LOAD_NOTE: 'add-load-note',
  DUPLICATE_LOAD: 'duplicate-load',
  GENERATE_LOAD_FROM_LANE: 'generate-load-from-lane',
  UPDATE_STOP_STATUS: 'update-stop-status',
  CREATE_LOAD: 'create-load', // NEW Phase C
  ACCEPT_RATECON_DRAFT: 'accept-ratecon-draft', // NEW Phase C
  // Drivers
  UPDATE_DRIVER: 'update-driver', // renamed from update-driver-fields (Task 3)
  UPDATE_DRIVER_STATUS: 'update-driver-status',
  CREATE_DRIVER: 'create-driver', // NEW Phase C
  TERMINATE_DRIVER: 'terminate-driver', // NEW Phase C
  // Vehicles
  UPDATE_VEHICLE: 'update-vehicle', // renamed from update-vehicle-fields (Task 3)
  UPDATE_VEHICLE_STATUS: 'update-vehicle-status',
  RETIRE_VEHICLE: 'retire-vehicle', // NEW Phase C
  // Trailers
  ASSIGN_TRAILER_TO_VEHICLE: 'assign-trailer-to-vehicle',
  UNASSIGN_TRAILER: 'unassign-trailer',
  // Trip
  CREATE_TRIP: 'create-trip',
  ADD_LOAD_TO_TRIP: 'add-load-to-trip',
  REMOVE_LOAD_FROM_TRIP: 'remove-load-from-trip',
  // Customers
  CREATE_CUSTOMER: 'create-customer', // NEW Phase C
  DEACTIVATE_CUSTOMER: 'deactivate-customer', // NEW Phase C
  // Invoicing
  SEND_INVOICE: 'send-invoice',
  VOID_INVOICE: 'void-invoice',
  RECORD_PAYMENT: 'record-payment',
  GENERATE_INVOICE: 'generate-invoice',
  SUBMIT_INVOICE_TO_FACTOR: 'submit-invoice-to-factor',
  // Settlements
  APPROVE_SETTLEMENT: 'approve-settlement',
  CREATE_SETTLEMENT: 'create-settlement', // NEW Phase C
  // Billing
  APPROVE_FOR_BILLING: 'approve-for-billing',
  // Shield
  TRIGGER_SHIELD_AUDIT: 'trigger-shield-audit',
  DISPUTE_SHIELD_FINDING: 'dispute-shield-finding', // NEW Phase C
  // Alerts
  ACKNOWLEDGE_ALERT: 'acknowledge-alert',
  RESOLVE_ALERT: 'resolve-alert',
  REPORT_ISSUE: 'report-issue',
  // EDI
  RESPOND_TO_TENDER: 'respond-to-tender',
  MANAGE_AUTO_ACCEPT_RULES: 'manage-auto-accept-rules',
  // Routing
  PLAN_ROUTE: 'plan-route',
  // Driver actions (driver-originated)
  REPORT_DELAY: 'report-delay',
  REPORT_ARRIVAL: 'report-arrival',
  REPORT_FUEL_STOP: 'report-fuel-stop',
  // Documents
  REQUEST_DOCUMENT_UPLOAD: 'request-document-upload',
  // Comms (generic adapters kept for Sally chat / Desk)
  SEND_EMAIL: 'send-email',
  SEND_SMS: 'send-sms',
  // Comms (Phase C new — typed, audit-surfaced)
  SEND_DRIVER_MESSAGE: 'send-driver-message', // NEW Phase C
  SEND_CUSTOMER_MESSAGE: 'send-customer-message', // NEW Phase C
  BULK_BROADCAST_DRIVERS: 'bulk-broadcast-drivers', // NEW Phase C
  // Misc
  GENERATE_CUSTOM_REPORT: 'generate-custom-report',
  REQUEST_DEMO: 'request-demo',
  CREATE_SUPPORT_TICKET: 'create-support-ticket',
  // NOTE: SCHEDULE_PREVENTIVE_MAINTENANCE and FLAG_FOR_REVIEW removed by
  // Desk v3 refactor (PR #637).
} as const;

export type ToolName = (typeof ToolNames)[keyof typeof ToolNames];

export const TOOL_NAMES_LIST: readonly ToolName[] = Object.values(ToolNames) as ToolName[];
