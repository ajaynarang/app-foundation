import { BaseEventPayload } from './base';

export interface DriverCreatedPayload extends BaseEventPayload {
  entityType: 'driver';
  driverNumber: string;
  name: string;
}

export interface DriverUpdatedPayload extends BaseEventPayload {
  entityType: 'driver';
  driverNumber: string;
  changedFields: string[];
}

export interface DriverDeactivatedPayload extends BaseEventPayload {
  entityType: 'driver';
  driverNumber: string;
  reason?: string;
}

export interface DriverReactivatedPayload extends BaseEventPayload {
  entityType: 'driver';
  driverNumber: string;
}

export interface VehicleCreatedPayload extends BaseEventPayload {
  entityType: 'vehicle';
  vehicleNumber: string;
  unitNumber?: string;
}

export interface VehicleUpdatedPayload extends BaseEventPayload {
  entityType: 'vehicle';
  vehicleNumber: string;
  changedFields: string[];
}

export interface VehicleDeactivatedPayload extends BaseEventPayload {
  entityType: 'vehicle';
  vehicleNumber: string;
  reason?: string;
}

export interface CustomerCreatedPayload extends BaseEventPayload {
  entityType: 'customer';
  customerName: string;
}

export interface CustomerUpdatedPayload extends BaseEventPayload {
  entityType: 'customer';
  customerName: string;
  changedFields: string[];
}
