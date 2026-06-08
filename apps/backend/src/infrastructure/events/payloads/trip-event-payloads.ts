import { BaseEventPayload, StatusChangePayload } from './base';

export interface TripCreatedPayload extends BaseEventPayload {
  entityType: 'trip';
  loadCount: number;
  status: string;
}

export interface TripAssignedPayload extends BaseEventPayload {
  entityType: 'trip';
  driverId: string;
  vehicleId: string;
}

export interface TripStatusChangedPayload extends StatusChangePayload {
  entityType: 'trip';
}

export interface TripLoadAddedPayload extends BaseEventPayload {
  entityType: 'trip';
  loadId: string;
}

export interface TripLoadRemovedPayload extends BaseEventPayload {
  entityType: 'trip';
  loadId: string;
}

export interface TripRouteStalePayload extends BaseEventPayload {
  entityType: 'trip';
  routePlanId: string;
}
