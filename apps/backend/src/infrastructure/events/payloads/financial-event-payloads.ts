import { BaseEventPayload } from './base';

export interface InvoiceCreatedPayload extends BaseEventPayload {
  entityType: 'invoice';
  invoiceNumber: string;
  loadId: string;
  amount: number;
}

export interface InvoiceUpdatedPayload extends BaseEventPayload {
  entityType: 'invoice';
  invoiceNumber: string;
  changedFields: string[];
}

export interface InvoiceSentPayload extends BaseEventPayload {
  entityType: 'invoice';
  invoiceNumber: string;
  loadId: string;
  recipientEmail?: string;
}

export interface InvoiceVoidedPayload extends BaseEventPayload {
  entityType: 'invoice';
  invoiceNumber: string;
  reason?: string;
}

export interface SettlementCreatedPayload extends BaseEventPayload {
  entityType: 'settlement';
  settlementNumber: string;
  driverId: string;
  totalAmount: number;
}

export interface SettlementApprovedPayload extends BaseEventPayload {
  entityType: 'settlement';
  settlementNumber: string;
  driverId: string;
}

export interface SettlementPaidPayload extends BaseEventPayload {
  entityType: 'settlement';
  settlementNumber: string;
  driverId: string;
  paidAmount: number;
}

export interface CloseoutCompletedPayload extends BaseEventPayload {
  entityType: 'closeout';
  loadId: string;
  loadNumber: string;
}

export interface CloseoutReopenedPayload extends BaseEventPayload {
  entityType: 'closeout';
  loadId: string;
  loadNumber: string;
  reason?: string;
}

export interface AccountingStartedPayload extends BaseEventPayload {
  entityType: 'accounting-sync';
  jobId: string;
  integrationId: string;
}

export interface AccountingCompletedPayload extends BaseEventPayload {
  entityType: 'accounting-sync';
  jobId: string;
  integrationId: string;
  durationMs: number;
}

export interface AccountingFailedPayload extends BaseEventPayload {
  entityType: 'accounting-sync';
  jobId: string;
  integrationId: string;
  error: string;
}
