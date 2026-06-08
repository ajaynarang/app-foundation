import { BaseEventPayload, StatusChangePayload } from './base';

export interface TrailerCreatedPayload extends BaseEventPayload {
  entityType: 'trailer';
}

export interface TrailerUpdatedPayload extends BaseEventPayload {
  entityType: 'trailer';
  changedFields: string[];
}

export interface TrailerAssignedPayload extends BaseEventPayload {
  entityType: 'trailer';
  vehicleId: string;
}

export interface TrailerUnassignedPayload extends BaseEventPayload {
  entityType: 'trailer';
  previousVehicleId?: string;
}

export interface TrailerStatusChangedPayload extends StatusChangePayload {
  entityType: 'trailer';
}
