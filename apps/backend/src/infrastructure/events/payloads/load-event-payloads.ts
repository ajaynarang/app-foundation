import { BaseEventPayload, StatusChangePayload } from './base';

export interface LoadCreatedPayload extends BaseEventPayload {
  entityType: 'load';
  loadNumber: string;
  status: string;
  customerName?: string;
}

export interface LoadUpdatedPayload extends BaseEventPayload {
  entityType: 'load';
  loadNumber: string;
  changedFields: string[];
}

export interface LoadDeletedPayload extends BaseEventPayload {
  entityType: 'load';
  loadNumber: string;
}

export interface LoadAssignedPayload extends BaseEventPayload {
  entityType: 'load';
  loadNumber: string;
  driverId: string;
  vehicleId: string;
  trailerId?: string;
}

export interface LoadStatusChangedPayload extends StatusChangePayload {
  entityType: 'load';
  loadNumber: string;
}

export interface LoadStatusReversedPayload extends StatusChangePayload {
  entityType: 'load';
  loadNumber: string;
}

export interface LoadBillingStatusChangedPayload extends StatusChangePayload {
  entityType: 'load';
  loadNumber: string;
}

export interface LoadStopStatusChangedPayload extends BaseEventPayload {
  entityType: 'load';
  loadNumber: string;
  stopId: string;
  stopType: string;
  previousStatus: string;
  newStatus: string;
}

export interface LoadLegAssignedPayload extends BaseEventPayload {
  entityType: 'load-leg';
  loadId: string;
  legId: string;
  driverId: string;
  vehicleId: string;
}

export interface LoadLegStatusChangedPayload extends StatusChangePayload {
  entityType: 'load-leg';
  loadId: string;
  legId: string;
}

export interface LoadChargeAddedPayload extends BaseEventPayload {
  entityType: 'load';
  loadNumber: string;
  chargeType: string;
  amountCents: number;
}

export interface LoadChargeRemovedPayload extends BaseEventPayload {
  entityType: 'load';
  loadNumber: string;
  chargeType: string;
}
