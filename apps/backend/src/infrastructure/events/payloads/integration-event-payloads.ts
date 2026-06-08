import { BaseEventPayload } from './base';

export interface SyncStartedPayload extends BaseEventPayload {
  entityType: 'sync';
  jobId: string;
  type: string;
  integrationId: string;
  triggerSource?: string;
}

export interface SyncCompletedPayload extends BaseEventPayload {
  entityType: 'sync';
  jobId: string;
  type: string;
  integrationId: string;
  durationMs: number;
}

export interface SyncFailedPayload extends BaseEventPayload {
  entityType: 'sync';
  jobId: string;
  type: string;
  integrationId: string;
  error: string;
}

export interface EdiTenderReceivedPayload extends BaseEventPayload {
  entityType: 'edi-tender';
  loadId: string;
  partnerId: string;
  partnerName: string;
  brokerReference?: string;
  rateCents?: number;
}

export interface EdiTenderRespondedPayload extends BaseEventPayload {
  entityType: 'edi-tender';
  loadId: string;
  partnerId: string;
  partnerName: string;
  response: 'accepted' | 'declined' | 'countered' | 'expired';
  autoAccepted?: boolean;
  ruleName?: string;
}

export interface EdiMessagePayload extends BaseEventPayload {
  entityType: 'edi-message';
  transactionType: string;
  partnerId: string;
  status: 'sent' | 'failed';
  error?: string;
}

export interface EmailIngestPayload extends BaseEventPayload {
  entityType: 'email-ingest';
  threadId: string;
  messageId?: string;
  senderEmail?: string;
  subject?: string;
  attachmentCount?: number;
}

export interface TelematicsUpdatedPayload extends BaseEventPayload {
  entityType: 'telematics';
  vehicleId: string;
  driverId?: string;
}
