import { unique } from './common.js';

// ── Horizon unavailability factories (Phase 3 Group 3d) ──────────────────────
//
// Reconciled against:
//   - apps/backend/.../horizon/driver-unavailability/driver-unavailability.dto.ts
//     → CreateDriverUnavailabilityDto (numeric `driverId`, required `type`)
//   - apps/backend/.../horizon/vehicle-unavailability/vehicle-unavailability.dto.ts
//     → CreateVehicleUnavailabilityDto (numeric `vehicleId`, required `type`)
//
// IMPORTANT: the DTO takes the NUMERIC primary key, not the `DRV-xxx` public
// id. Helpers are responsible for resolving the numeric id before calling
// the factory. Caller signature uses `number | string` for ergonomics;
// factory coerces via Number(). TODO(phase-3-verify): confirm ParseIntPipe
// semantics accept a string numeric id from the wire.

/** Prisma `DriverUnavailabilityType` values — reconciled against live backend
 *  enum validator (2026-04-19 QA): `PTO | APPOINTMENT | HOME_TIME | TRAINING | OTHER`.
 *  Earlier drafts had `SICK/HOS_RESET/PERSONAL` — those are not in the live enum. */
export type DriverUnavailabilityType = 'PTO' | 'APPOINTMENT' | 'HOME_TIME' | 'TRAINING' | 'OTHER';

export interface DriverUnavailabilityPayload {
  driverId: number;
  type: DriverUnavailabilityType;
  startDate: string;
  endDate: string;
  note?: string;
}

export function buildDriverUnavailabilityPayload(
  driverId: number | string,
  overrides: {
    startDate: string;
    endDate: string;
    type?: DriverUnavailabilityType;
    reason?: string;
  },
): DriverUnavailabilityPayload {
  return {
    driverId: Number(driverId),
    type: overrides.type ?? 'PTO',
    startDate: overrides.startDate,
    endDate: overrides.endDate,
    note: overrides.reason ?? `QA unavailability ${unique('UN')}`,
  };
}

/** Prisma `VehicleUnavailabilityType` values as of 2026-04-17. */
export type VehicleUnavailabilityType = 'MAINTENANCE' | 'REPAIR' | 'INSPECTION' | 'OUT_OF_SERVICE' | 'OTHER';

export interface VehicleUnavailabilityPayload {
  vehicleId: number;
  type: VehicleUnavailabilityType;
  startDate: string;
  endDate: string;
  note?: string;
}

export function buildVehicleUnavailabilityPayload(
  vehicleId: number | string,
  overrides: {
    startDate: string;
    endDate: string;
    type?: VehicleUnavailabilityType;
    reason?: string;
  },
): VehicleUnavailabilityPayload {
  return {
    vehicleId: Number(vehicleId),
    type: overrides.type ?? 'MAINTENANCE',
    startDate: overrides.startDate,
    endDate: overrides.endDate,
    note: overrides.reason ?? `QA unavailability ${unique('VUN')}`,
  };
}
