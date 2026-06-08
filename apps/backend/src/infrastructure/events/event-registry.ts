export type EventCategory =
  | 'Load'
  | 'Fleet'
  | 'Financials'
  | 'Operations'
  | 'Documents'
  | 'Integrations'
  | 'Platform'
  | 'Trip'
  | 'Trailer'
  | 'Desk'
  | 'AI';

export interface EventDefinition {
  readonly key: string;
  readonly constantName: string;
  readonly label: string;
  readonly description: string;
  readonly category: EventCategory;
  readonly visibility: 'external' | 'internal';
  readonly aggregateType: string;
}

export const EVENT_REGISTRY = [
  // ─── Load Lifecycle ────────────────────────────────────────────────
  {
    key: 'sally.load.created',
    constantName: 'LOAD_CREATED',
    label: 'Load Created',
    description: 'A new load is created',
    category: 'Load' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'load',
  },
  {
    key: 'sally.load.updated',
    constantName: 'LOAD_UPDATED',
    label: 'Load Updated',
    description: 'A load is updated',
    category: 'Load' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'load',
  },
  {
    key: 'sally.load.deleted',
    constantName: 'LOAD_DELETED',
    label: 'Load Deleted',
    description: 'A load is deleted',
    category: 'Load' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'load',
  },
  {
    key: 'sally.load.assigned',
    constantName: 'LOAD_ASSIGNED',
    label: 'Load Assigned',
    description: 'A load is assigned to a driver and vehicle',
    category: 'Load' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'load',
  },
  {
    key: 'sally.load.status-changed',
    constantName: 'LOAD_STATUS_CHANGED',
    label: 'Load Status Changed',
    description: 'A load transitions to a new status',
    category: 'Load' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'load',
  },
  {
    key: 'sally.load.status-reversed',
    constantName: 'LOAD_STATUS_REVERSED',
    label: 'Load Status Reversed',
    description: 'A load status is reversed to a previous state',
    category: 'Load' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'load',
  },
  {
    key: 'sally.load.billing-status-changed',
    constantName: 'LOAD_BILLING_STATUS_CHANGED',
    label: 'Load Billing Status Changed',
    description: 'A load billing status changes (approved, invoiced, etc.)',
    category: 'Load' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'load',
  },
  {
    key: 'sally.load.stop-status-changed',
    constantName: 'LOAD_STOP_STATUS_CHANGED',
    label: 'Load Stop Status Changed',
    description: 'A pickup or delivery stop status changes',
    category: 'Load' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'load',
  },
  {
    key: 'sally.load.leg-assigned',
    constantName: 'LOAD_LEG_ASSIGNED',
    label: 'Load Leg Assigned',
    description: 'A multi-stop load leg is assigned to a driver',
    category: 'Load' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'load',
  },
  {
    key: 'sally.load.leg-status-changed',
    constantName: 'LOAD_LEG_STATUS_CHANGED',
    label: 'Load Leg Status Changed',
    description: 'A load leg transitions to a new status',
    category: 'Load' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'load',
  },
  {
    key: 'sally.load.exchange-removed',
    constantName: 'LOAD_EXCHANGE_REMOVED',
    label: 'Load Exchange Point Removed',
    description: 'An exchange point on a relay load was removed; legs were recomputed',
    category: 'Load' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'load',
  },
  {
    key: 'sally.load.charge-added',
    constantName: 'LOAD_CHARGE_ADDED',
    label: 'Load Charge Added',
    description: 'A charge is added to a load',
    category: 'Financials' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'load',
  },
  {
    key: 'sally.load.charge-removed',
    constantName: 'LOAD_CHARGE_REMOVED',
    label: 'Load Charge Removed',
    description: 'A charge is removed from a load',
    category: 'Financials' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'load',
  },
  {
    key: 'sally.load.share-link-issued',
    constantName: 'LOAD_SHARE_LINK_ISSUED',
    label: 'Load Share Link Issued',
    description: 'A public tracking share link is issued for a load. Admin-only audit event; no SSE bridge.',
    category: 'Load' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'load',
  },
  {
    key: 'sally.load.share-link-revoked',
    constantName: 'LOAD_SHARE_LINK_REVOKED',
    label: 'Load Share Link Revoked',
    description: 'A previously-issued public tracking share link is revoked. Admin-only audit event; no SSE bridge.',
    category: 'Load' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'load',
  },
  {
    key: 'sally.load.mileage-calculated',
    constantName: 'LOAD_MILEAGE_CALCULATED',
    label: 'Load Mileage Calculated',
    description: 'System-computed total miles + drive hours have been written for a load',
    category: 'Load' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'load',
  },
  {
    key: 'sally.stop.place-resolved',
    constantName: 'STOP_PLACE_RESOLVED',
    label: 'Stop Place Resolved',
    description: 'A Stop was found-or-created from an external Places suggestion',
    category: 'Fleet' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'stop',
  },
  {
    key: 'sally.conversation.session-issued',
    constantName: 'CONVERSATION_SESSION_ISSUED',
    label: 'Conversation Session Issued',
    description:
      'An opaque session token is issued for a (typically anonymous prospect) conversation. Internal audit event; no SSE bridge.',
    category: 'Platform' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'conversation',
  },
  {
    key: 'sally.conversation.session-revoked',
    constantName: 'CONVERSATION_SESSION_REVOKED',
    label: 'Conversation Session Revoked',
    description: 'A previously-issued conversation session token is revoked. Internal audit event; no SSE bridge.',
    category: 'Platform' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'conversation',
  },

  // ─── Route ─────────────────────────────────────────────────────────
  {
    key: 'sally.route.planned',
    constantName: 'ROUTE_PLANNED',
    label: 'Route Planned',
    description: 'A route plan is generated',
    category: 'Operations' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'route',
  },

  // ─── Fleet: Drivers ────────────────────────────────────────────────
  {
    key: 'sally.driver.created',
    constantName: 'DRIVER_CREATED',
    label: 'Driver Created',
    description: 'A new driver is added to the fleet',
    category: 'Fleet' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'driver',
  },
  {
    key: 'sally.driver.updated',
    constantName: 'DRIVER_UPDATED',
    label: 'Driver Updated',
    description: 'A driver record is updated',
    category: 'Fleet' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'driver',
  },
  {
    key: 'sally.driver.deactivated',
    constantName: 'DRIVER_DEACTIVATED',
    label: 'Driver Deactivated',
    description: 'A driver is deactivated from the fleet',
    category: 'Fleet' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'driver',
  },
  {
    key: 'sally.driver.reactivated',
    constantName: 'DRIVER_REACTIVATED',
    label: 'Driver Reactivated',
    description: 'A previously deactivated driver is reactivated',
    category: 'Fleet' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'driver',
  },

  // ─── Fleet: Vehicles ───────────────────────────────────────────────
  {
    key: 'sally.vehicle.created',
    constantName: 'VEHICLE_CREATED',
    label: 'Vehicle Created',
    description: 'A new vehicle is added to the fleet',
    category: 'Fleet' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'vehicle',
  },
  {
    key: 'sally.vehicle.updated',
    constantName: 'VEHICLE_UPDATED',
    label: 'Vehicle Updated',
    description: 'A vehicle record is updated',
    category: 'Fleet' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'vehicle',
  },
  {
    key: 'sally.vehicle.deactivated',
    constantName: 'VEHICLE_DEACTIVATED',
    label: 'Vehicle Deactivated',
    description: 'A vehicle is deactivated from the fleet',
    category: 'Fleet' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'vehicle',
  },
  {
    key: 'sally.vehicle.maintenance-scheduled',
    constantName: 'VEHICLE_MAINTENANCE_SCHEDULED',
    label: 'Vehicle Maintenance Scheduled',
    description: 'A preventive-maintenance appointment was scheduled on a vehicle',
    category: 'Fleet' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'vehicle',
  },

  // ─── Fleet: Customers ──────────────────────────────────────────────
  {
    key: 'sally.customer.created',
    constantName: 'CUSTOMER_CREATED',
    label: 'Customer Created',
    description: 'A new customer is created',
    category: 'Fleet' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'customer',
  },
  {
    key: 'sally.customer.updated',
    constantName: 'CUSTOMER_UPDATED',
    label: 'Customer Updated',
    description: 'A customer record is updated',
    category: 'Fleet' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'customer',
  },

  // ─── Alerts ────────────────────────────────────────────────────────
  {
    key: 'sally.alert.fired',
    constantName: 'ALERT_FIRED',
    label: 'Alert Fired',
    description: 'A new alert is triggered',
    category: 'Operations' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'alert',
  },
  {
    key: 'sally.alert.escalated',
    constantName: 'ALERT_ESCALATED',
    label: 'Alert Escalated',
    description: 'An alert is escalated to a higher priority',
    category: 'Operations' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'alert',
  },
  {
    key: 'sally.alert.resolved',
    constantName: 'ALERT_RESOLVED',
    label: 'Alert Resolved',
    description: 'An alert is resolved',
    category: 'Operations' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'alert',
  },
  {
    key: 'sally.alert.unsnoozed',
    constantName: 'ALERT_UNSNOOZED',
    label: 'Alert Unsnoozed',
    description: 'A snoozed alert is reactivated by the scheduler',
    category: 'Operations' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'alert',
  },

  // ─── Shield ────────────────────────────────────────────────────────
  {
    key: 'sally.shield.audit-complete',
    constantName: 'SHIELD_AUDIT_COMPLETE',
    label: 'Shield Audit Complete',
    description: 'A compliance audit is completed for a load',
    category: 'Operations' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'shield-audit',
  },
  {
    key: 'sally.shield.audit-failed',
    constantName: 'SHIELD_AUDIT_FAILED',
    label: 'Shield Audit Failed',
    description: 'A compliance audit failed to process',
    category: 'Operations' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'shield-audit',
  },

  // ─── Sync ──────────────────────────────────────────────────────────
  {
    key: 'sally.sync.started',
    constantName: 'SYNC_STARTED',
    label: 'Sync Started',
    description: 'An integration sync job has started',
    category: 'Integrations' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'sync',
  },
  {
    key: 'sally.sync.completed',
    constantName: 'SYNC_COMPLETED',
    label: 'Sync Completed',
    description: 'An integration sync job completed successfully',
    category: 'Integrations' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'sync',
  },
  {
    key: 'sally.sync.failed',
    constantName: 'SYNC_FAILED',
    label: 'Sync Failed',
    description: 'An integration sync job failed',
    category: 'Integrations' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'sync',
  },

  // ─── Telematics ────────────────────────────────────────────────────
  {
    key: 'sally.telematics.updated',
    constantName: 'TELEMATICS_UPDATED',
    label: 'Telematics Updated',
    description: 'Telematics data received for a vehicle',
    category: 'Integrations' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'telematics',
  },

  // ─── Documents ─────────────────────────────────────────────────────
  {
    key: 'sally.ratecon.completed',
    constantName: 'RATECON_COMPLETED',
    label: 'Rate Confirmation Parsed',
    description: 'A rate confirmation document is successfully parsed',
    category: 'Documents' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'ratecon',
  },
  {
    key: 'sally.ratecon.failed',
    constantName: 'RATECON_FAILED',
    label: 'Rate Confirmation Parse Failed',
    description: 'A rate confirmation document failed to parse',
    category: 'Documents' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'ratecon',
  },
  {
    key: 'sally.document.uploaded',
    constantName: 'DOCUMENT_UPLOADED',
    label: 'Document Uploaded',
    description: 'A document is uploaded and confirmed',
    category: 'Documents' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'document',
  },
  {
    key: 'sally.document.deleted',
    constantName: 'DOCUMENT_DELETED',
    label: 'Document Deleted',
    description: 'A document is deleted',
    category: 'Documents' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'document',
  },

  // ─── Messages ──────────────────────────────────────────────────────
  {
    key: 'sally.message.new',
    constantName: 'MESSAGE_NEW',
    label: 'New Message',
    description: 'A new message is posted on a load',
    category: 'Operations' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'message',
  },

  // ─── Accounting ────────────────────────────────────────────────────
  {
    key: 'sally.accounting.started',
    constantName: 'ACCOUNTING_STARTED',
    label: 'Accounting Sync Started',
    description: 'An accounting sync job has started',
    category: 'Financials' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'accounting-sync',
  },
  {
    key: 'sally.accounting.completed',
    constantName: 'ACCOUNTING_COMPLETED',
    label: 'Accounting Sync Completed',
    description: 'An accounting sync job completed successfully',
    category: 'Financials' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'accounting-sync',
  },
  {
    key: 'sally.accounting.failed',
    constantName: 'ACCOUNTING_FAILED',
    label: 'Accounting Sync Failed',
    description: 'An accounting sync job failed',
    category: 'Financials' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'accounting-sync',
  },

  // ─── Invoicing ─────────────────────────────────────────────────────
  {
    key: 'sally.invoice.created',
    constantName: 'INVOICE_CREATED',
    label: 'Invoice Created',
    description: 'A new invoice is generated',
    category: 'Financials' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'invoice',
  },
  {
    key: 'sally.invoice.updated',
    constantName: 'INVOICE_UPDATED',
    label: 'Invoice Updated',
    description: 'An invoice is updated',
    category: 'Financials' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'invoice',
  },
  {
    key: 'sally.invoice.sent',
    constantName: 'INVOICE_SENT',
    label: 'Invoice Sent',
    description: 'An invoice is marked as sent',
    category: 'Financials' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'invoice',
  },
  {
    key: 'sally.invoice.voided',
    constantName: 'INVOICE_VOIDED',
    label: 'Invoice Voided',
    description: 'An invoice is voided',
    category: 'Financials' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'invoice',
  },

  // ─── NOA (Notice of Assignment) ────────────────────────────────────
  {
    key: 'sally.noa.created',
    constantName: 'NOA_CREATED',
    label: 'NOA Created',
    description: 'A NOA record is auto-created when a customer is first invoiced through a factor',
    category: 'Financials' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'noa-record',
  },
  {
    key: 'sally.noa.sent',
    constantName: 'NOA_SENT',
    label: 'NOA Sent',
    description: 'A NOA letter is emailed to the broker',
    category: 'Financials' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'noa-record',
  },
  {
    key: 'sally.noa.acknowledged',
    constantName: 'NOA_ACKNOWLEDGED',
    label: 'NOA Acknowledged',
    description: 'The broker acknowledged the NOA — invoices to this customer can now be submitted to the factor',
    category: 'Financials' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'noa-record',
  },
  {
    key: 'sally.noa.rejected',
    constantName: 'NOA_REJECTED',
    label: 'NOA Rejected',
    description: 'The broker rejected the NOA — the carrier must invoice direct or escalate',
    category: 'Financials' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'noa-record',
  },

  // ─── Settlements ───────────────────────────────────────────────────
  {
    key: 'sally.settlement.created',
    constantName: 'SETTLEMENT_CREATED',
    label: 'Settlement Created',
    description: 'A new driver settlement is calculated',
    category: 'Financials' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'settlement',
  },
  {
    key: 'sally.settlement.approved',
    constantName: 'SETTLEMENT_APPROVED',
    label: 'Settlement Approved',
    description: 'A settlement is approved for payment',
    category: 'Financials' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'settlement',
  },
  {
    key: 'sally.settlement.paid',
    constantName: 'SETTLEMENT_PAID',
    label: 'Settlement Paid',
    description: 'A settlement is marked as paid',
    category: 'Financials' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'settlement',
  },

  // ─── Close-Out ─────────────────────────────────────────────────────
  {
    key: 'sally.closeout.completed',
    constantName: 'CLOSEOUT_COMPLETED',
    label: 'Close-Out Completed',
    description: 'A load close-out process is completed',
    category: 'Financials' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'closeout',
  },
  {
    key: 'sally.closeout.reopened',
    constantName: 'CLOSEOUT_REOPENED',
    label: 'Close-Out Reopened',
    description: 'A previously closed load is reopened for review',
    category: 'Financials' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'closeout',
  },

  // ─── EDI ───────────────────────────────────────────────────────────
  {
    key: 'sally.edi.tender-received',
    constantName: 'EDI_TENDER_RECEIVED',
    label: 'EDI Tender Received',
    description: 'An EDI 204 load tender is received from a broker',
    category: 'Integrations' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'edi-tender',
  },
  {
    key: 'sally.edi.tender-accepted',
    constantName: 'EDI_TENDER_ACCEPTED',
    label: 'EDI Tender Accepted',
    description: 'An EDI load tender is accepted',
    category: 'Integrations' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'edi-tender',
  },
  {
    key: 'sally.edi.tender-declined',
    constantName: 'EDI_TENDER_DECLINED',
    label: 'EDI Tender Declined',
    description: 'An EDI load tender is declined',
    category: 'Integrations' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'edi-tender',
  },
  {
    key: 'sally.edi.tender-countered',
    constantName: 'EDI_TENDER_COUNTERED',
    label: 'EDI Tender Countered',
    description: 'An EDI load tender is countered with a new rate',
    category: 'Integrations' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'edi-tender',
  },
  {
    key: 'sally.edi.tender-expired',
    constantName: 'EDI_TENDER_EXPIRED',
    label: 'EDI Tender Expired',
    description: 'An EDI load tender has expired without response',
    category: 'Integrations' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'edi-tender',
  },
  {
    key: 'sally.edi.message-sent',
    constantName: 'EDI_MESSAGE_SENT',
    label: 'EDI Message Sent',
    description: 'An EDI message is sent to a trading partner',
    category: 'Integrations' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'edi-message',
  },
  {
    key: 'sally.edi.message-failed',
    constantName: 'EDI_MESSAGE_FAILED',
    label: 'EDI Message Failed',
    description: 'An EDI message failed to send',
    category: 'Integrations' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'edi-message',
  },

  // ─── Email Intake ──────────────────────────────────────────────────
  {
    key: 'sally.email-ingest.received',
    constantName: 'EMAIL_INGEST_RECEIVED',
    label: 'Email Received',
    description: 'An inbound email is received for processing',
    category: 'Integrations' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'email-ingest',
  },
  {
    key: 'sally.email-ingest.parsed',
    constantName: 'EMAIL_INGEST_PARSED',
    label: 'Email Parsed',
    description: 'An inbound email is successfully parsed',
    category: 'Integrations' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'email-ingest',
  },
  {
    key: 'sally.email-ingest.failed',
    constantName: 'EMAIL_INGEST_FAILED',
    label: 'Email Parse Failed',
    description: 'An inbound email failed to parse',
    category: 'Integrations' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'email-ingest',
  },
  {
    key: 'sally.email-ingest.confirmed',
    constantName: 'EMAIL_INGEST_CONFIRMED',
    label: 'Email Confirmed',
    description: 'A parsed email result is confirmed by the user',
    category: 'Integrations' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'email-ingest',
  },

  // ─── Feature Flags (internal) ──────────────────────────────────────
  {
    key: 'sally.feature-flag.toggled',
    constantName: 'FEATURE_FLAG_TOGGLED',
    label: 'Feature Flag Toggled',
    description: 'A feature flag is enabled or disabled',
    category: 'Platform' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'feature-flag',
  },

  // ─── Preferences (internal) ────────────────────────────────────────
  {
    key: 'sally.preferences.updated',
    constantName: 'USER_PREFERENCES_UPDATED',
    label: 'User Preferences Updated',
    description: 'A user updates their preferences',
    category: 'Platform' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'preferences',
  },

  // ─── Tenant settings (internal) ────────────────────────────────────
  {
    key: 'sally.tenant.factoring-default-changed',
    constantName: 'TENANT_FACTORING_DEFAULT_CHANGED',
    label: 'Tenant Factoring Default Changed',
    description: 'A tenant pinned, unpinned, or replaced their default factoring company',
    category: 'Platform' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'tenant',
  },

  // ─── Factoring money lifecycle (Phase 4) ───────────────────────────────
  {
    key: 'sally.factoring.advance-recorded',
    constantName: 'FACTORING_ADVANCE_RECORDED',
    label: 'Factoring Advance Recorded',
    description: 'A factoring advance was recorded against an invoice',
    category: 'Financials' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'invoice',
  },
  {
    key: 'sally.factoring.fee-recorded',
    constantName: 'FACTORING_FEE_RECORDED',
    label: 'Factoring Fee Recorded',
    description: 'A factoring fee was recorded against an invoice',
    category: 'Financials' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'invoice',
  },
  {
    key: 'sally.factoring.reserve-released',
    constantName: 'FACTORING_RESERVE_RELEASED',
    label: 'Factoring Reserve Released',
    description: 'A factor released the reserve to the carrier (broker has paid)',
    category: 'Financials' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'invoice',
  },
  {
    key: 'sally.factoring.chargeback-received',
    constantName: 'FACTORING_CHARGEBACK_RECEIVED',
    label: 'Factoring Chargeback Received',
    description: 'A factor charged back an advance — invoice is in recourse',
    category: 'Financials' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'invoice',
  },
  {
    key: 'sally.factoring.chargeback-reversed',
    constantName: 'FACTORING_CHARGEBACK_REVERSED',
    label: 'Factoring Chargeback Reversed',
    description: 'A previously charged-back advance was reversed by the factor',
    category: 'Financials' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'invoice',
  },
  {
    key: 'sally.factoring.transaction-deleted',
    constantName: 'FACTORING_TRANSACTION_DELETED',
    label: 'Factoring Transaction Deleted',
    description: 'A factoring transaction was soft-deleted (audit-preserving correction)',
    category: 'Financials' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'invoice',
  },

  // ─── Unavailability ────────────────────────────────────────────────
  {
    key: 'sally.driver-unavailability.created',
    constantName: 'DRIVER_UNAVAILABILITY_CREATED',
    label: 'Driver Unavailability Created',
    description: 'A driver unavailability period is scheduled',
    category: 'Fleet' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'driver-unavailability',
  },
  {
    key: 'sally.driver-unavailability.updated',
    constantName: 'DRIVER_UNAVAILABILITY_UPDATED',
    label: 'Driver Unavailability Updated',
    description: 'A driver unavailability period is updated',
    category: 'Fleet' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'driver-unavailability',
  },
  {
    key: 'sally.driver-unavailability.deleted',
    constantName: 'DRIVER_UNAVAILABILITY_DELETED',
    label: 'Driver Unavailability Deleted',
    description: 'A driver unavailability period is removed',
    category: 'Fleet' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'driver-unavailability',
  },
  {
    key: 'sally.vehicle-unavailability.created',
    constantName: 'VEHICLE_UNAVAILABILITY_CREATED',
    label: 'Vehicle Unavailability Created',
    description: 'A vehicle unavailability period is scheduled',
    category: 'Fleet' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'vehicle-unavailability',
  },
  {
    key: 'sally.vehicle-unavailability.updated',
    constantName: 'VEHICLE_UNAVAILABILITY_UPDATED',
    label: 'Vehicle Unavailability Updated',
    description: 'A vehicle unavailability period is updated',
    category: 'Fleet' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'vehicle-unavailability',
  },
  {
    key: 'sally.vehicle-unavailability.deleted',
    constantName: 'VEHICLE_UNAVAILABILITY_DELETED',
    label: 'Vehicle Unavailability Deleted',
    description: 'A vehicle unavailability period is removed',
    category: 'Fleet' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'vehicle-unavailability',
  },

  // ─── Trip ────────────────────────────────────────────────────────
  {
    key: 'sally.trip.created',
    constantName: 'TRIP_CREATED',
    label: 'Trip Created',
    description: 'A new trip is created',
    category: 'Trip' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'trip',
  },
  {
    key: 'sally.trip.assigned',
    constantName: 'TRIP_ASSIGNED',
    label: 'Trip Assigned',
    description: 'A trip is assigned to a driver and vehicle',
    category: 'Trip' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'trip',
  },
  {
    key: 'sally.trip.started',
    constantName: 'TRIP_STARTED',
    label: 'Trip Started',
    description: 'A trip begins its route',
    category: 'Trip' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'trip',
  },
  {
    key: 'sally.trip.completed',
    constantName: 'TRIP_COMPLETED',
    label: 'Trip Completed',
    description: 'A trip completes all deliveries',
    category: 'Trip' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'trip',
  },
  {
    key: 'sally.trip.cancelled',
    constantName: 'TRIP_CANCELLED',
    label: 'Trip Cancelled',
    description: 'A trip is cancelled',
    category: 'Trip' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'trip',
  },
  {
    key: 'sally.trip.load-added',
    constantName: 'TRIP_LOAD_ADDED',
    label: 'Trip Load Added',
    description: 'A load is added to a trip',
    category: 'Trip' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'trip',
  },
  {
    key: 'sally.trip.load-removed',
    constantName: 'TRIP_LOAD_REMOVED',
    label: 'Trip Load Removed',
    description: 'A load is removed from a trip',
    category: 'Trip' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'trip',
  },
  {
    key: 'sally.trip.route-stale',
    constantName: 'TRIP_ROUTE_STALE',
    label: 'Trip Route Stale',
    description: 'A trip route needs recalculation',
    category: 'Trip' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'trip',
  },

  // ─── Trailers ──────────────────────────────────────────────────────
  {
    key: 'sally.trailer.created',
    constantName: 'TRAILER_CREATED',
    label: 'Trailer Created',
    description: 'A new trailer is added to the fleet',
    category: 'Trailer' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'trailer',
  },
  {
    key: 'sally.trailer.updated',
    constantName: 'TRAILER_UPDATED',
    label: 'Trailer Updated',
    description: 'A trailer record is updated',
    category: 'Trailer' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'trailer',
  },
  {
    key: 'sally.trailer.assigned',
    constantName: 'TRAILER_ASSIGNED',
    label: 'Trailer Assigned',
    description: 'A trailer is assigned to a vehicle',
    category: 'Trailer' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'trailer',
  },
  {
    key: 'sally.trailer.unassigned',
    constantName: 'TRAILER_UNASSIGNED',
    label: 'Trailer Unassigned',
    description: 'A trailer is unassigned from a vehicle',
    category: 'Trailer' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'trailer',
  },
  {
    key: 'sally.trailer.deactivated',
    constantName: 'TRAILER_DEACTIVATED',
    label: 'Trailer Deactivated',
    description: 'A trailer is deactivated',
    category: 'Trailer' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'trailer',
  },
  {
    key: 'sally.trailer.reactivated',
    constantName: 'TRAILER_REACTIVATED',
    label: 'Trailer Reactivated',
    description: 'A deactivated trailer is reactivated',
    category: 'Trailer' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'trailer',
  },
  {
    key: 'sally.trailer.decommissioned',
    constantName: 'TRAILER_DECOMMISSIONED',
    label: 'Trailer Decommissioned',
    description: 'A trailer is permanently decommissioned',
    category: 'Trailer' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'trailer',
  },
  {
    key: 'sally.trailer.status-changed',
    constantName: 'TRAILER_STATUS_CHANGED',
    label: 'Trailer Status Changed',
    description: 'A trailer status changes',
    category: 'Trailer' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'trailer',
  },

  // ─── Platform (internal) ──────────────────────────────────────────
  {
    key: 'sally.user.created',
    constantName: 'USER_CREATED',
    label: 'User Created',
    description: 'A new user account is created',
    category: 'Platform' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'user',
  },
  {
    key: 'sally.user.invited',
    constantName: 'USER_INVITED',
    label: 'User Invited',
    description: 'A user invitation is sent',
    category: 'Platform' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'user',
  },
  {
    key: 'sally.user.deactivated',
    constantName: 'USER_DEACTIVATED',
    label: 'User Deactivated',
    description: 'A user account is deactivated',
    category: 'Platform' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'user',
  },

  // ─── Recurring Lanes ──────────────────────────────────────────────
  {
    key: 'sally.recurring-lane.created',
    constantName: 'RECURRING_LANE_CREATED',
    label: 'Recurring Lane Created',
    description: 'A recurring lane is created',
    category: 'Fleet' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'recurring-lane',
  },
  {
    key: 'sally.recurring-lane.updated',
    constantName: 'RECURRING_LANE_UPDATED',
    label: 'Recurring Lane Updated',
    description: 'A recurring lane is updated',
    category: 'Fleet' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'recurring-lane',
  },
  {
    key: 'sally.recurring-lane.deleted',
    constantName: 'RECURRING_LANE_DELETED',
    label: 'Recurring Lane Deleted',
    description: 'A recurring lane is deleted',
    category: 'Fleet' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'recurring-lane',
  },

  // ─── Sally's Desk ─────────────────────────────────────────────────
  {
    key: 'sally.desk.decision-created',
    constantName: 'DESK_DECISION_CREATED',
    label: 'Desk Decision Created',
    description: 'A new desk decision is created for dispatcher review',
    category: 'Desk' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'desk-decision',
  },
  {
    key: 'sally.desk.decision-superseded',
    constantName: 'DESK_DECISION_SUPERSEDED',
    label: 'Desk Decision Superseded',
    description: 'Pending desk decisions are superseded by a newer action',
    category: 'Desk' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'desk-decision',
  },
  {
    key: 'sally.desk.decision-resolved',
    constantName: 'DESK_DECISION_RESOLVED',
    label: 'Desk Decision Resolved',
    description: 'A desk decision is resolved by a dispatcher',
    category: 'Desk' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'desk-decision',
  },
  {
    key: 'sally.desk.auto-approved',
    constantName: 'DESK_AUTO_APPROVED',
    label: 'Desk Auto-Approved',
    description: 'A desk decision is auto-approved based on trust level',
    category: 'Desk' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'desk-decision',
  },
  {
    key: 'sally.desk.action-executed',
    constantName: 'DESK_ACTION_EXECUTED',
    label: 'Desk Action Executed',
    description: 'A desk decision action is successfully executed',
    category: 'Desk' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'desk-decision',
  },
  {
    key: 'sally.desk.action-failed',
    constantName: 'DESK_ACTION_FAILED',
    label: 'Desk Action Failed',
    description: 'A desk decision action failed to execute',
    category: 'Desk' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'desk-decision',
  },
  {
    key: 'sally.desk.feedback-captured',
    constantName: 'DESK_FEEDBACK_CAPTURED',
    label: 'Desk Feedback Captured',
    description: 'Dispatcher feedback is captured for a desk decision',
    category: 'Desk' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'desk-decision',
  },
  {
    key: 'sally.desk.memory-created',
    constantName: 'DESK_MEMORY_CREATED',
    label: 'Desk Memory Created',
    description: 'A new desk memory is created from a decision outcome',
    category: 'Desk' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'desk-memory',
  },
  {
    key: 'sally.desk.outcome-evaluated',
    constantName: 'DESK_OUTCOME_EVALUATED',
    label: 'Desk Outcome Evaluated',
    description: 'A desk decision outcome is evaluated for learning',
    category: 'Desk' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'desk-decision',
  },
  {
    key: 'sally.desk.responsibility-toggled',
    constantName: 'DESK_RESPONSIBILITY_TOGGLED',
    label: 'Desk Responsibility Toggled',
    description: 'A desk responsibility is enabled or disabled',
    category: 'Desk' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'desk-responsibility',
  },
  {
    key: 'sally.desk.trust-changed',
    constantName: 'DESK_TRUST_CHANGED',
    label: 'Desk Trust Changed',
    description: 'A desk responsibility trust level is changed',
    category: 'Desk' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'desk-responsibility',
  },

  {
    key: 'sally.desk.activity',
    constantName: 'DESK_ACTIVITY',
    label: 'Desk Activity',
    description: 'A desk activity feed entry is logged',
    category: 'Desk' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'desk-activity',
  },
  {
    key: 'sally.desk.trigger-gated',
    constantName: 'DESK_TRIGGER_GATED',
    label: 'Desk Trigger Gated',
    description: 'A desk capability trigger was blocked by the feature flag, plan tier, or tenant capability state',
    category: 'Desk' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'desk-capability',
  },
  {
    key: 'sally.desk.episode-snoozed',
    constantName: 'DESK_EPISODE_SNOOZED',
    label: 'Desk Episode Snoozed',
    description:
      'An operator snoozed a desk episode — the matching entity suppression blocks new episodes on the same (responsibility, entity) tuple until the window elapses or the suppression is cleared',
    category: 'Desk' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'desk-episode',
  },
  {
    key: 'sally.desk.suppression-cleared',
    constantName: 'DESK_SUPPRESSION_CLEARED',
    label: 'Desk Suppression Cleared',
    description: 'An operator un-snoozed a desk entity suppression — the next scheduled sweep may re-open an episode',
    category: 'Desk' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'desk-suppression',
  },
  {
    key: 'sally.desk.episode-changed',
    constantName: 'DESK_EPISODE_CHANGED',
    label: 'Desk Episode Changed',
    description:
      "A desk episode opened, closed, or was resolved — invalidates the Needs-you + Handled lists and the handoff counts so the operator's view refreshes live without a page reload",
    category: 'Desk' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'desk-episode',
  },

  // HOS near-limit — emitted by the HOS sync pipeline when a driver's on-duty
  // or driving clock crosses a configurable threshold (default ~90 min of
  // remaining on-duty). The hos_monitoring Desk responsibility subscribes to
  // this event to spin up a review-flagging episode.
  //
  // Producer is not wired in this PR — the responsibility also has a manual
  // trigger, so the desk UI can run it on-demand. Full HOS producer lands
  // alongside the HOS compliance work in a later PR.
  {
    key: 'sally.hos.near-limit',
    constantName: 'HOS_NEAR_LIMIT',
    label: 'HOS Near Limit',
    description: "A driver's on-duty or driving clock crossed the HOS near-limit threshold",
    category: 'Fleet' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'driver-hos',
  },

  // Findings-only responsibilities (closeout, settlement, deadhead, HOS)
  // write to the desk_review_items table via `flag-for-review`. The review
  // inbox UI listens to these events to keep its list fresh without polling.
  {
    key: 'sally.desk.review-item-created',
    constantName: 'DESK_REVIEW_ITEM_CREATED',
    label: 'Desk Review Item Created',
    description: 'A findings-only responsibility flagged something for dispatcher review',
    category: 'Desk' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'desk-review-item',
  },
  {
    key: 'sally.desk.review-item-resolved',
    constantName: 'DESK_REVIEW_ITEM_RESOLVED',
    label: 'Desk Review Item Resolved',
    description: 'A dispatcher acknowledged, resolved, or dismissed a desk review item',
    category: 'Desk' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'desk-review-item',
  },

  // ─── Agent Contract ────────────────────────────────────────────────
  {
    key: 'sally.agent.invocation-completed',
    constantName: 'AGENT_INVOCATION_COMPLETED',
    label: 'Agent Invocation Completed',
    description: 'An agent tool invocation finished (success or failure). Carries redacted args.',
    category: 'Platform' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'agent-invocation',
  },
  {
    key: 'sally.agent.hitl-challenge-issued',
    constantName: 'AGENT_HITL_CHALLENGE_ISSUED',
    label: 'Agent HITL Challenge Issued',
    description: 'A third-party principal hit a standard or sensitive tier tool; a challenge token was issued.',
    category: 'Platform' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'agent-invocation',
  },
  {
    key: 'sally.agent.hitl-challenge-completed',
    constantName: 'AGENT_HITL_CHALLENGE_COMPLETED',
    label: 'Agent HITL Challenge Completed',
    description: 'A HITL challenge token was re-presented within TTL (and step-up OTP verified for sensitive tier).',
    category: 'Platform' as EventCategory,
    visibility: 'external' as const,
    aggregateType: 'agent-invocation',
  },

  // ─── Notifications (internal) ─────────────────────────────────────
  {
    key: 'sally.notification.sent',
    constantName: 'NOTIFICATION_SENT',
    label: 'Notification Sent',
    description: 'A notification is delivered',
    category: 'Operations' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'notification',
  },

  // ─── Load Board ───────────────────────────────────────────────────
  {
    key: 'sally.load-board.alert-fired',
    constantName: 'LOAD_BOARD_ALERT_FIRED',
    label: 'Load Board Alert Fired',
    description: 'A saved load-board search found new matching listings',
    category: 'Integrations' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'load-board-search',
  },

  // ─── Monitoring (internal) ────────────────────────────────────────
  {
    key: 'sally.monitoring.cycle-completed',
    constantName: 'MONITORING_CYCLE_COMPLETED',
    label: 'Monitoring Cycle Completed',
    description: 'A scheduled monitoring cycle finished evaluating loads/drivers',
    category: 'Operations' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'monitoring',
  },

  // ─── Route lifecycle (internal) ───────────────────────────────────
  {
    key: 'sally.route.event-recorded',
    constantName: 'ROUTE_EVENT_RECORDED',
    label: 'Route Event Recorded',
    description: 'A route event was recorded (driver/dispatcher/monitoring/system)',
    category: 'Operations' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'route-plan',
  },
  {
    key: 'sally.route.replan-recommended',
    constantName: 'ROUTE_REPLAN_RECOMMENDED',
    label: 'Route Replan Recommended',
    description: 'Monitoring detected the route needs replanning',
    category: 'Operations' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'route-plan',
  },
  {
    key: 'sally.route.eta-shifted',
    constantName: 'ROUTE_ETA_SHIFTED',
    label: 'Route ETA Shifted',
    description: 'Monitoring detected a meaningful ETA shift on the route',
    category: 'Operations' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'route-plan',
  },

  // ─── API Keys (Phase D) ───────────────────────────────────────────
  {
    key: 'sally.api-key.rotated',
    constantName: 'API_KEY_ROTATED',
    label: 'API Key Rotated',
    description: 'An API key was rotated — the old key is revoked and a new plaintext key was returned once.',
    category: 'Platform' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'api-key',
  },
  {
    key: 'sally.api-key.revoked',
    constantName: 'API_KEY_REVOKED',
    label: 'API Key Revoked',
    description: 'An API key was revoked; further calls with that key will fail.',
    category: 'Platform' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'api-key',
  },
  {
    key: 'sally.api-key.scopes-updated',
    constantName: 'API_KEY_SCOPES_UPDATED',
    label: 'API Key Scopes Updated',
    description: 'The scopes (or IP allowlist / rate limit) on an API key were updated.',
    category: 'Platform' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'api-key',
  },
  {
    key: 'sally.api-key.paused',
    constantName: 'API_KEY_PAUSED',
    label: 'API Key Paused',
    description: 'An API key was temporarily paused (isActive=false); can be resumed.',
    category: 'Platform' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'api-key',
  },
  {
    key: 'sally.api-key.resumed',
    constantName: 'API_KEY_RESUMED',
    label: 'API Key Resumed',
    description: 'A paused API key was resumed (isActive=true).',
    category: 'Platform' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'api-key',
  },

  // ─── OAuth Clients (Phase D) ──────────────────────────────────────
  {
    key: 'sally.oauth-client.rotated',
    constantName: 'OAUTH_CLIENT_ROTATED',
    label: 'OAuth Client Secret Rotated',
    description:
      'An OAuth client secret was rotated. Existing access/refresh tokens are not cascaded (OAuth 2.1 convention).',
    category: 'Platform' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'oauth-client',
  },
  {
    key: 'sally.oauth-client.revoked',
    constantName: 'OAUTH_CLIENT_REVOKED',
    label: 'OAuth Client Revoked',
    description: 'An OAuth client was revoked. Active access + refresh tokens were cascaded-revoked.',
    category: 'Platform' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'oauth-client',
  },
  {
    key: 'sally.oauth-client.scopes-updated',
    constantName: 'OAUTH_CLIENT_SCOPES_UPDATED',
    label: 'OAuth Client Scopes Updated',
    description: 'The grantable scope set on an OAuth client was updated.',
    category: 'Platform' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'oauth-client',
  },
  {
    key: 'sally.oauth-client.paused',
    constantName: 'OAUTH_CLIENT_PAUSED',
    label: 'OAuth Client Paused',
    description: 'An OAuth client was paused (isActive=false); can be resumed.',
    category: 'Platform' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'oauth-client',
  },
  {
    key: 'sally.oauth-client.resumed',
    constantName: 'OAUTH_CLIENT_RESUMED',
    label: 'OAuth Client Resumed',
    description: 'A paused OAuth client was resumed (isActive=true).',
    category: 'Platform' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'oauth-client',
  },

  // ─── AI Cost Telemetry ─────────────────────────────────────────────
  {
    key: 'sally.ai.invocation-recorded',
    constantName: 'AI_INVOCATION_RECORDED',
    label: 'AI Invocation Recorded',
    description:
      'An LLM or embedding call was recorded to the AiInvocation ledger. Hot-path listeners use this to invalidate per-tenant cost aggregates (cost-budget cache, super-admin spend view).',
    category: 'AI' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'ai-invocation',
  },
  {
    key: 'sally.ai.budget-soft-breached',
    constantName: 'AI_BUDGET_SOFT_BREACHED',
    label: 'AI Budget Soft Cap Breached',
    description:
      "A tenant's AI spend crossed its soft daily or monthly cap. The call still proceeds; the UI surfaces a banner. Useful for proactive upsell / cost-review signals.",
    category: 'AI' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'tenant-ai-budget',
  },
  {
    key: 'sally.ai.budget-hard-breached',
    constantName: 'AI_BUDGET_HARD_BREACHED',
    label: 'AI Budget Hard Cap Breached',
    description:
      "A tenant's AI spend hit its hard daily or monthly cap. The call is blocked and the surface falls back. Pages cost/abuse monitoring.",
    category: 'AI' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'tenant-ai-budget',
  },
  {
    key: 'sally.ai.zero-retention-unavailable',
    constantName: 'AI_ZERO_RETENTION_UNAVAILABLE',
    label: 'AI Zero-Retention Route Unavailable',
    description:
      'A tenant requires zero-data-retention AI routing but no ZDR-eligible model is configured for the requested tier. The call was blocked (fail-closed). Signals an ops gap to wire a compliant route.',
    category: 'AI' as EventCategory,
    visibility: 'internal' as const,
    aggregateType: 'tenant',
  },
] as const satisfies readonly EventDefinition[];

// ─── Lookup Helpers ──────────────────────────────────────────────────

const registryMap = new Map<string, EventDefinition>(EVENT_REGISTRY.map((e) => [e.key, e]));

export function getEventDefinition(key: string): EventDefinition | undefined {
  return registryMap.get(key);
}

export function getExternalEvents(): EventDefinition[] {
  return EVENT_REGISTRY.filter((e) => e.visibility === 'external');
}

export interface EventCatalogCategory {
  label: EventCategory;
  events: {
    name: string;
    label: string;
    description: string;
  }[];
}

export function getExternalEventsByCategory(): EventCatalogCategory[] {
  const categoryMap = new Map<EventCategory, EventCatalogCategory>();

  for (const def of EVENT_REGISTRY) {
    if (def.visibility === 'internal') continue;

    let cat = categoryMap.get(def.category);
    if (!cat) {
      cat = { label: def.category, events: [] };
      categoryMap.set(def.category, cat);
    }
    cat.events.push({
      name: def.key,
      label: def.label,
      description: def.description,
    });
  }

  return Array.from(categoryMap.values());
}
