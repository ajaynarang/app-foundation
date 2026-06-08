export type AccountingSyncJobType =
  | 'invoice'
  | 'settlement'
  | 'payment'
  | 'settlement-payment'
  | 'webhook-payment'
  | 'webhook-bill-payment'
  | 'initial-sync';

export interface AccountingSyncJobData {
  jobId?: number;
  tenantId: number;
  integrationId: string; // IntegrationConfig.integrationId
  type: AccountingSyncJobType;
  triggerSource: 'manual' | 'webhook' | 'scheduled' | 'auto';
  entityId?: string; // invoiceId, settlementId, paymentId
  webhookPayload?: Record<string, unknown>; // for webhook jobs
  /** Request ID from the originating HTTP request for cross-cutting traceability */
  correlationId?: string;
}

export interface AccountingSyncResult {
  success: boolean;
  externalId?: string; // QB Invoice/Bill/Payment ID
  error?: string;
  details?: Record<string, unknown>;
}
