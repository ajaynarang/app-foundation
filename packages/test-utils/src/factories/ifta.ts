import { unique } from './common.js';

// ── Legacy fuel purchase factory ─────────────────────────────────────────────
//
// Kept for back-compat with pre-Phase-3 specs. The shape doesn't match the
// live `CreateFuelPurchaseDto` (see `buildIftaFuelPurchase` below). Phase 3
// specs call the new factory; this one remains so the transitional phases
// don't error on import.

export function buildFuelPurchase(overrides: Record<string, unknown> = {}) {
  return {
    date: new Date().toISOString().split('T')[0],
    state: 'TX',
    vendor: `QA Fuel Stop ${unique('fuel')}`,
    gallons: 150.5,
    amountCents: 62500,
    fuelType: 'DIESEL',
    ...overrides,
  };
}

// ── IFTA factories (Phase 3 Group 3e) ─────────────────────────────────────────
//
// Reconciled against:
//   - apps/backend/.../ifta/dto/create-fuel-purchase.dto.ts → CreateFuelPurchaseDto
//   - apps/backend/.../ifta/dto/create-manual-mileage.dto.ts → CreateManualMileageDto
//   - apps/backend/.../ifta/dto/update-filing-status.dto.ts → UpdateFilingStatusDto
//
// Backend ValidationPipe runs with `whitelist + forbidNonWhitelisted`, so
// factories emit exactly the DTO shape. Unknown keys would cause 400s.

/**
 * POST /ifta/mileage body — `CreateManualMileageDto`.
 *
 * Field mapping:
 *   - `jurisdiction`: 2-letter US state code (Length(2,2))
 *   - `totalMiles`: number, Min(0). Spec calls this `miles`; factory maps.
 *   - `year`: number, Int, Min(2020) Max(2100). Spec `periodYear` → `year`.
 *   - `quarter`: number, Int, Min(1) Max(4). Spec `periodQuarter` → `quarter`.
 *   - `vehicleId`: optional NUMERIC db id (ParseIntPipe-style; NOT `VEH-xxx`).
 *
 * The `vehicleId` parameter is typed as `number | string` for caller
 * ergonomics; the factory coerces via `Number()`. Non-numeric strings emit
 * NaN, which class-validator rejects as 400 — callers MUST pass the numeric
 * primary key.
 */
export interface IftaManualMileagePayload {
  jurisdiction: string;
  totalMiles: number;
  year: number;
  quarter: number;
  vehicleId?: number;
}

export function buildIftaManualMileage(
  vehicleId: number | string | null | undefined,
  overrides: {
    jurisdiction: string;
    miles: number;
    periodYear: number;
    periodQuarter: number;
  },
): IftaManualMileagePayload {
  const payload: IftaManualMileagePayload = {
    jurisdiction: overrides.jurisdiction,
    totalMiles: overrides.miles,
    year: overrides.periodYear,
    quarter: overrides.periodQuarter,
  };
  if (vehicleId !== null && vehicleId !== undefined) {
    payload.vehicleId = Number(vehicleId);
  }
  return payload;
}

/**
 * POST /ifta/fuel body — `CreateFuelPurchaseDto`.
 *
 * Field mapping (spec signature → DTO field):
 *   - `gallons`: Number Min(0.01)
 *   - `pricePerGallonCents`: the DTO accepts DOLLARS (`pricePerGallon`),
 *     not cents. Factory divides by 100 so callers can stay in the
 *     cent-native idiom used elsewhere in the QA code.
 *   - `jurisdiction`: 2-letter state code
 *   - `purchasedAt`: spec name → DTO `purchaseDate` (IsDateString)
 *
 * The fuel-scoped IFTA quarter is resolved server-side from the purchase
 * date (calendar-quarter mapping), and the quarter is auto-upserted if
 * missing — see `IftaFuelService.ensureQuarterExists`.
 */
export interface IftaFuelPurchasePayload {
  purchaseDate: string;
  jurisdiction: string;
  gallons: number;
  pricePerGallon?: number;
  vehicleId?: number;
  driverId?: number;
  stationName?: string;
  vendorName?: string;
  notes?: string;
  source?: 'MANUAL' | 'RECEIPT_SCAN';
}

export function buildIftaFuelPurchase(
  vehicleId: number | string | null | undefined,
  overrides: {
    gallons: number;
    pricePerGallonCents?: number;
    jurisdiction: string;
    purchasedAt?: string;
    driverId?: number | string;
    stationName?: string;
    vendorName?: string;
    notes?: string;
    source?: 'MANUAL' | 'RECEIPT_SCAN';
  },
): IftaFuelPurchasePayload {
  const payload: IftaFuelPurchasePayload = {
    purchaseDate: overrides.purchasedAt ?? new Date().toISOString().split('T')[0],
    jurisdiction: overrides.jurisdiction,
    gallons: overrides.gallons,
  };
  if (overrides.pricePerGallonCents !== undefined) {
    // Wire format is dollars (see DTO). Convert cents → dollars.
    payload.pricePerGallon = overrides.pricePerGallonCents / 100;
  }
  if (vehicleId !== null && vehicleId !== undefined) {
    payload.vehicleId = Number(vehicleId);
  }
  if (overrides.driverId !== undefined) {
    payload.driverId = Number(overrides.driverId);
  }
  if (overrides.stationName !== undefined) {
    payload.stationName = overrides.stationName;
  }
  if (overrides.vendorName !== undefined) {
    payload.vendorName = overrides.vendorName;
  }
  if (overrides.notes !== undefined) payload.notes = overrides.notes;
  if (overrides.source !== undefined) payload.source = overrides.source;
  return payload;
}

/**
 * PATCH /ifta/quarters/:quarterId/status body — `UpdateFilingStatusDto`.
 *
 * `status` is one of DRAFT | REVIEWED | FILED | CONFIRMED | AMENDED. The
 * service enforces the full state machine (see `STATUS_TRANSITIONS` in
 * `ifta.service.ts`) — callers must drive statuses in order for a happy-path
 * test. OPEN → DRAFT is only reachable via `POST /quarters/:id/calculate`.
 */
export type IftaFilingStatus = 'DRAFT' | 'REVIEWED' | 'FILED' | 'CONFIRMED' | 'AMENDED';

export interface IftaFilingStatusUpdatePayload {
  status: IftaFilingStatus;
  confirmationNumber?: string;
  filingMethod?: string;
  notes?: string;
}

export function buildIftaFilingStatusUpdate(
  overrides: { status: IftaFilingStatus } & Partial<Omit<IftaFilingStatusUpdatePayload, 'status'>>,
): IftaFilingStatusUpdatePayload {
  return { ...overrides };
}
