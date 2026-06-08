import { BaseEventPayload } from './base';

export interface AlertFiredPayload extends BaseEventPayload {
  entityType: 'alert';
  alertType: string;
  priority: string;
  driverId?: string;
  loadId?: string;
  vehicleId?: string;
}

export interface AlertEscalatedPayload extends BaseEventPayload {
  entityType: 'alert';
  priority: string;
  escalationLevel: number;
  escalateTo?: string;
}

export interface AlertResolvedPayload extends BaseEventPayload {
  entityType: 'alert';
  status: string;
  reason?: string;
}

export interface AlertUnsnoozedPayload extends BaseEventPayload {
  entityType: 'alert';
}

export interface ShieldAuditCompletePayload extends BaseEventPayload {
  entityType: 'shield-audit';
  loadId: string;
  score: number;
  issueCount: number;
}

export interface ShieldAuditFailedPayload extends BaseEventPayload {
  entityType: 'shield-audit';
  loadId: string;
  error: string;
}

export interface DriverUnavailabilityPayload extends BaseEventPayload {
  entityType: 'driver-unavailability';
  driverId: string;
  type: string;
  startDate?: string;
  endDate?: string;
}

export interface VehicleUnavailabilityPayload extends BaseEventPayload {
  entityType: 'vehicle-unavailability';
  vehicleId: string;
  type: string;
  startDate?: string;
  endDate?: string;
}
