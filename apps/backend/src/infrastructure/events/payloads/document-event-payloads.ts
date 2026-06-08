import { BaseEventPayload } from './base';

export interface RateconCompletedPayload extends BaseEventPayload {
  entityType: 'ratecon';
  jobId: number;
  loadId: string;
  loadNumber: string;
  fileName: string;
}

export interface RateconFailedPayload extends BaseEventPayload {
  entityType: 'ratecon';
  jobId: number;
  loadId?: string;
  fileName: string;
  error: string;
}

export interface DocumentUploadedPayload extends BaseEventPayload {
  entityType: 'document';
  documentType: string;
  loadId?: string;
  driverId?: string;
  fileName: string;
}

export interface DocumentDeletedPayload extends BaseEventPayload {
  entityType: 'document';
  documentType: string;
  loadId?: string;
  driverId?: string;
}

export interface MessageNewPayload extends BaseEventPayload {
  entityType: 'message';
  loadId: string;
  role: string;
  senderId: string;
}
