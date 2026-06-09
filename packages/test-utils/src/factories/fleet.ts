import { randomBytes } from 'node:crypto';
import { unique, futureDate } from './common.js';

/**
 * Build a POST /drivers payload matching CreateDriverDto.
 * Required backend fields: name, cdlClass, licenseNumber. At least one of
 * phone OR email is required (controller enforces). All other fields are
 * optional. Backend uses `whitelist: true, forbidNonWhitelisted: true`, so
 * this factory must NOT emit unknown keys.
 */
export function buildDriver(overrides: Record<string, unknown> = {}) {
  return {
    name: `TestDriver ${unique('Last')}`,
    email: `driver-${unique('d')}@test.example.com`,
    phone: `+1555${String(Date.now()).slice(-7)}`,
    cdlClass: 'A' as const,
    licenseNumber: unique('DL'),
    licenseState: 'TX',
    ...overrides,
  };
}

/**
 * Generate a backend-valid VIN (17 chars from [A-HJ-NPR-Z0-9] — no I/O/Q).
 * Pulls directly from crypto.randomBytes so collisions across parallel
 * Playwright workers are vanishingly unlikely (uniform over 33^17).
 */
function generateVin(): string {
  const alphabet = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
  const bytes = randomBytes(17);
  let out = '';
  for (let i = 0; i < 17; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

export function buildVehicle(overrides: Record<string, unknown> = {}) {
  return {
    unitNumber: unique('UNIT'),
    vin: generateVin(),
    equipmentType: 'DRY_VAN' as const,
    fuelCapacityGallons: 150,
    make: 'Freightliner',
    model: 'Cascadia',
    year: 2024,
    ...overrides,
  };
}

export function buildCustomer(overrides: Record<string, unknown> = {}) {
  return {
    companyName: `Test Customer ${unique('c')}`,
    customerType: 'SHIPPER' as const,
    billingEmail: `customer-${unique('c')}@test.example.com`,
    paymentTerms: 'NET_30' as const,
    creditLimit: 50000,
    address: '100 Main St',
    city: 'Dallas',
    state: 'TX',
    ...overrides,
  };
}

/**
 * Contact payload for POST /customers/:id/contacts.
 * Role enum from shared-types: 'PRIMARY' | 'OPERATIONS' | 'BILLING' | 'CLAIMS' | 'AFTER_HOURS' | 'OTHER'.
 */
export function buildCustomerContact(overrides: Record<string, unknown> = {}) {
  return {
    firstName: 'TestContact',
    lastName: unique('Last'),
    role: 'OPERATIONS' as const,
    email: `contact-${unique('cc')}@test.example.com`,
    phone: `+1555${String(Date.now()).slice(-7)}`,
    title: 'Operations Manager',
    ...overrides,
  };
}

export function buildTrailer(overrides: Record<string, unknown> = {}) {
  return {
    unitNumber: unique('TRL'),
    equipmentType: 'DRY_VAN',
    lengthFeet: 53,
    maxPayloadLbs: 44000,
    make: 'Great Dane',
    model: 'Everest',
    year: 2024,
    ...overrides,
  };
}

/**
 * Build a POST /stops payload matching `CreateStopDto`.
 *
 * Backend uses `whitelist: true, forbidNonWhitelisted: true`, so this factory
 * must NOT emit unknown keys. `name` is the only required field; everything
 * else is optional but we populate address+zip so the stops service can run
 * its dedup + (attempted) geocoding paths during tests.
 */
export function buildStop(overrides: Record<string, unknown> = {}) {
  return {
    name: `QA Stop ${unique('S')}`,
    address: `${unique('Addr').slice(0, 40)} Industrial Pkwy`,
    city: 'Dallas',
    state: 'TX',
    zipCode: '75201',
    locationType: 'WAREHOUSE' as const,
    contactName: 'QA Dock Manager',
    contactPhone: '+15551234567',
    contactEmail: `dock-${unique('s')}@test.example.com`,
    appointmentRequired: false,
    notes: 'Created by QA suite',
    ...overrides,
  };
}

/**
 * Build a POST /customer/loads/request payload.
 *
 * Matches `CustomerLoadService.createFromCustomerRequest` required fields
 * (`pickupAddress`, `pickupCity`, `pickupState`, `deliveryAddress`,
 * `deliveryCity`, `deliveryState`, `weightLbs`). The controller uses
 * `@Body() body: any` so there is no DTO validation and no whitelist —
 * but we still only emit the documented keys to keep the shape disciplined.
 */
export function buildCustomerLoadRequest(overrides: Record<string, unknown> = {}) {
  return {
    pickupAddress: '100 Main St',
    pickupCity: 'Dallas',
    pickupState: 'TX',
    deliveryAddress: '200 Commerce St',
    deliveryCity: 'Houston',
    deliveryState: 'TX',
    pickupDate: futureDate(2),
    deliveryDate: futureDate(3),
    weightLbs: 38000,
    commodityType: 'General Freight',
    notes: `QA customer request ${unique('cr')}`,
    ...overrides,
  };
}

/**
 * Build a POST /loads payload matching the real `CreateLoadDto`.
 *
 * Requires `customerId` explicitly — manual load creation is customer-linked
 * at the DTO level. See:
 *   apps/backend/src/domains/fleet/loads/dto/create-load.dto.ts
 *   apps/backend/src/domains/fleet/loads/services/load-creation.service.ts
 *     (stops with an unrecognized `stopId` string trigger find-or-create)
 *
 * Backend uses `whitelist: true, forbidNonWhitelisted: true`, so this factory
 * must NOT emit unknown keys.
 */
export function buildLoad(customerId: number, overrides: Record<string, unknown> = {}) {
  const ts = Date.now();
  return {
    weightLbs: 42000,
    commodityType: 'General Freight',
    customerName: 'QA Tracking Customer',
    customerId,
    rateCents: 275000,
    requiredEquipmentType: 'DRY_VAN',
    referenceNumber: unique('REF'),
    stops: [
      {
        stopId: `qa-pickup-${ts}-${Math.floor(Math.random() * 1e6)}`,
        sequenceOrder: 1,
        actionType: 'pickup',
        name: 'QA Pickup Warehouse',
        address: '100 Main St',
        city: 'Dallas',
        state: 'TX',
        zipCode: '75201',
        estimatedDockHours: 2,
      },
      {
        stopId: `qa-delivery-${ts}-${Math.floor(Math.random() * 1e6)}`,
        sequenceOrder: 2,
        actionType: 'delivery',
        name: 'QA Delivery Center',
        address: '200 Commerce St',
        city: 'Houston',
        state: 'TX',
        zipCode: '77001',
        estimatedDockHours: 3,
      },
    ],
    ...overrides,
  };
}

/**
 * Build a POST /loads payload for a relay-capable load.
 *
 * Relay loads require ≥ 3 stops so there is room for at least one intermediate
 * exchange point (first stop is the origin pickup, last stop is the final
 * delivery — the exchange boundary must be strictly between them per
 * `LoadLegService.createLegsFromExchangePoints` validation).
 *
 * Note: `CreateLoadDto` does NOT accept `isRelay` directly — backend sets
 * `isRelay` via PATCH /loads/:id after create. Flow for relay tests:
 *   1) createLoad(this factory payload) → PENDING non-relay load with 3 stops.
 *   2) PATCH /loads/:id { isRelay: true } → promote to relay.
 *   3) POST /loads/:id/legs { exchangeStopIds: [<mid LoadStop.id>] } → creates legs.
 *
 * `seededStopFields` — optional `{ pickup, mid, delivery }` triples with
 * real address fields. Prefer passing seeded tenant stops here so the
 * `findOrCreate` dedup lookup (address + zip → existing Stop) lights up and
 * the load inherits pre-geocoded lat/lon. Without that, the factory's
 * default addresses will create fresh Stop rows that lack coordinates —
 * fine for pure relay flows but incompatible with route-planning
 * endpoints that require GPS on every stop.
 */
export function buildRelayLoad(
  customerId: number,
  overrides: {
    seededStopFields?: {
      pickup: { address: string; city: string; state: string; zipCode: string };
      mid: { address: string; city: string; state: string; zipCode: string };
      delivery: {
        address: string;
        city: string;
        state: string;
        zipCode: string;
      };
    };
  } & Record<string, unknown> = {},
) {
  const { seededStopFields, ...restOverrides } = overrides;
  const ts = Date.now();
  const rand = () => Math.floor(Math.random() * 1e6);
  const pickup = seededStopFields?.pickup ?? {
    address: '100 Main St',
    city: 'Dallas',
    state: 'TX',
    zipCode: '75201',
  };
  const mid = seededStopFields?.mid ?? {
    address: '150 Relay Exchange Pkwy',
    city: 'Texarkana',
    state: 'TX',
    zipCode: '75501',
  };
  const delivery = seededStopFields?.delivery ?? {
    address: '200 Commerce St',
    city: 'Houston',
    state: 'TX',
    zipCode: '77001',
  };
  return {
    weightLbs: 42000,
    commodityType: 'General Freight',
    customerName: 'QA Relay Customer',
    customerId,
    rateCents: 325000,
    requiredEquipmentType: 'DRY_VAN',
    referenceNumber: unique('RELREF'),
    stops: [
      {
        stopId: `qa-relay-pickup-${ts}-${rand()}`,
        sequenceOrder: 1,
        actionType: 'pickup',
        name: 'QA Relay Pickup Warehouse',
        ...pickup,
        estimatedDockHours: 2,
      },
      {
        stopId: `qa-relay-mid-${ts}-${rand()}`,
        sequenceOrder: 2,
        actionType: 'delivery',
        name: 'QA Relay Exchange Point',
        ...mid,
        estimatedDockHours: 1,
      },
      {
        stopId: `qa-relay-delivery-${ts}-${rand()}`,
        sequenceOrder: 3,
        actionType: 'delivery',
        name: 'QA Relay Final Delivery',
        ...delivery,
        estimatedDockHours: 3,
      },
    ],
    ...restOverrides,
  };
}

/**
 * Build a POST /loads/:load_id/generate-route payload matching
 * `GenerateRouteDto`. Required: driverId (STRING public id), vehicleId
 * (STRING public id), departureTime (ISO 8601), optimizationPriority
 * ('minimize_time' | 'minimize_cost' | 'balance').
 *
 * Backend uses `whitelist: true, forbidNonWhitelisted: true`, so this
 * factory must NOT emit unknown keys.
 *
 * See:
 *   apps/backend/src/domains/fleet/loads/dto/generate-route.dto.ts
 */
export function buildRoutePlanRequest(overrides: {
  driverId: string;
  vehicleId: string;
  departureTime?: string;
  optimizationPriority?: 'minimize_time' | 'minimize_cost' | 'balance';
  restPreference?: 'auto' | 'full' | 'split_8_2' | 'split_7_3';
  avoidTolls?: boolean;
  maxFuelDetourMiles?: number;
}) {
  const base: {
    driverId: string;
    vehicleId: string;
    departureTime: string;
    optimizationPriority: 'minimize_time' | 'minimize_cost' | 'balance';
    restPreference?: 'auto' | 'full' | 'split_8_2' | 'split_7_3';
    avoidTolls?: boolean;
    maxFuelDetourMiles?: number;
  } = {
    driverId: overrides.driverId,
    vehicleId: overrides.vehicleId,
    departureTime: overrides.departureTime ?? new Date(Date.now() + 2 * 86_400_000).toISOString(),
    optimizationPriority: overrides.optimizationPriority ?? 'balance',
  };
  if (overrides.restPreference !== undefined) {
    base.restPreference = overrides.restPreference;
  }
  if (overrides.avoidTolls !== undefined) base.avoidTolls = overrides.avoidTolls;
  if (overrides.maxFuelDetourMiles !== undefined) {
    base.maxFuelDetourMiles = overrides.maxFuelDetourMiles;
  }
  return base;
}

/**
 * Build a POST /recurring-lanes payload matching `CreateRecurringLaneDto`.
 *
 * The DTO requires `stops: Array<{ stopId: number, ... }>` where `stopId` is
 * the numeric Stop.id primary key (NOT the string stopId like "STOP-0001").
 * Callers MUST supply pickupStopId + deliveryStopId from real POST /stops
 * responses — recurring lanes are keyed to persisted Stop rows.
 *
 * Backend uses `whitelist: true, forbidNonWhitelisted: true`, so this factory
 * must NOT emit unknown keys. See:
 *   apps/backend/src/domains/fleet/recurring-lanes/dto/create-recurring-lane.dto.ts
 */
export function buildRecurringLane(
  pickupStopId: number,
  deliveryStopId: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    name: `QA Recurring Lane ${unique('RL')}`,
    customerName: 'QA Repeat Shipper',
    commodityType: 'General Freight',
    weightLbs: 42000,
    rateCents: 275000,
    requiredEquipmentType: 'DRY_VAN',
    scheduleType: 'weekly' as const,
    scheduleDays: [1],
    autoCreate: false,
    stops: [
      {
        stopId: pickupStopId,
        sequenceOrder: 1,
        actionType: 'pickup' as const,
        estimatedDockHours: 2,
        dayOffset: 0,
      },
      {
        stopId: deliveryStopId,
        sequenceOrder: 2,
        actionType: 'delivery' as const,
        estimatedDockHours: 2,
        dayOffset: 0,
      },
    ],
    ...overrides,
  };
}

/**
 * Build a POST /trips payload matching `CreateTripDto`.
 *
 * `loadIds` is the canonical field — each entry is the STRING load id
 * (e.g. "LOAD-0042"), not the numeric Load.id PK. The backend validates
 * that every load exists on the tenant, is DRAFT or PENDING, is not
 * already in another trip, and is not a relay leg. Trips require
 * 2-10 loads.
 *
 * `driverId` + `vehicleId` (when both supplied together) promote the
 * trip to ASSIGNED at create time and sync the driver/vehicle down to
 * each member load. Omit both for the default DRAFT path.
 *
 * Backend uses `whitelist: true, forbidNonWhitelisted: true`, so this
 * factory must NOT emit unknown keys. See:
 *   apps/backend/src/domains/fleet/trips/dto/create-trip.dto.ts
 */
export function buildTrip(
  loadIds: string[],
  overrides: {
    driverId?: string;
    vehicleId?: string;
    generateRoute?: boolean;
  } = {},
) {
  const payload: {
    loadIds: string[];
    driverId?: string;
    vehicleId?: string;
    generateRoute?: boolean;
  } = { loadIds };
  if (overrides.driverId !== undefined) payload.driverId = overrides.driverId;
  if (overrides.vehicleId !== undefined) payload.vehicleId = overrides.vehicleId;
  if (overrides.generateRoute !== undefined) {
    payload.generateRoute = overrides.generateRoute;
  }
  return payload;
}

/**
 * Build a POST /custom-fields/definitions payload matching
 * `CreateCustomFieldDefinitionDto`. SELECT fields require a non-empty
 * `options` array; other field types accept an empty array.
 *
 * The backend slugifies `name` → `fieldKey`, so tests that need a predictable
 * fieldKey should pass a known name via `overrides.name`. Using `unique()` in
 * the default name keeps parallel runs from colliding on the
 * `(tenantId, entityType, fieldKey)` unique index.
 *
 * See:
 *   apps/backend/src/domains/fleet/custom-fields/dto/create-custom-field-definition.dto.ts
 */
export function buildCustomField(
  overrides: {
    entityType?: 'LOAD' | 'DRIVER' | 'VEHICLE' | 'CUSTOMER';
    fieldType?: 'TEXT' | 'NUMBER' | 'DATE' | 'SELECT';
    name?: string;
    options?: string[];
    isRequired?: boolean;
    driverEditable?: boolean;
    showOnInvoice?: boolean;
    showOnBol?: boolean;
  } = {},
) {
  const entityType = overrides.entityType ?? 'LOAD';
  const fieldType = overrides.fieldType ?? 'TEXT';
  const defaultOptions = fieldType === 'SELECT' ? ['East', 'West', 'Central'] : [];
  return {
    entityType,
    fieldType,
    name: overrides.name ?? `QA Field ${unique('CF')}`,
    options: overrides.options ?? defaultOptions,
    isRequired: overrides.isRequired ?? false,
    driverEditable: overrides.driverEditable ?? false,
    showOnInvoice: overrides.showOnInvoice ?? false,
    showOnBol: overrides.showOnBol ?? false,
  };
}

/**
 * Build a PUT /fleet/lane-rate-targets payload matching
 * `UpsertLaneRateTargetDto`. The upsert key is
 * `(tenantId, originState, destinationState, equipmentType)` — passing
 * `equipmentType` as undefined persists the "ALL" wildcard target.
 *
 * See:
 *   apps/backend/src/domains/fleet/lane-intelligence/lane-intelligence.dto.ts
 */
export function buildLaneRateTarget(
  overrides: {
    originState?: string;
    destinationState?: string;
    targetRateCentsPerMile?: number;
    notes?: string;
    equipmentType?: string;
  } = {},
) {
  return {
    originState: overrides.originState ?? 'TX',
    destinationState: overrides.destinationState ?? 'CA',
    targetRateCentsPerMile: overrides.targetRateCentsPerMile ?? 285,
    notes: overrides.notes,
    equipmentType: overrides.equipmentType,
  };
}

/**
 * Build a POST /loads/:load_id/charges payload matching `CreateLoadChargeDto`.
 *
 * `chargeType` must be in the VALID_CHARGE_TYPES list (see
 * `apps/backend/src/domains/fleet/loads/dto/load-charge.dto.ts`):
 *   linehaul, fuel_surcharge, detention_pickup, detention_delivery, layover,
 *   lumper, tonu, accessorial, adjustment.
 *
 * `quantity` defaults to 1 on the backend when omitted; `unitPriceCents` is
 * required (0..9,999,999). `isBillable`/`isPayable` are optional booleans
 * (service defaults: isBillable=true, isPayable=false).
 *
 * Backend uses `whitelist: true, forbidNonWhitelisted: true`, so this
 * factory must NOT emit unknown keys.
 */
export function buildLoadCharge(
  overrides: {
    chargeType?: string;
    description?: string;
    quantity?: number;
    unitPriceCents?: number;
    isBillable?: boolean;
    isPayable?: boolean;
  } = {},
) {
  const base: {
    chargeType: string;
    description: string;
    unitPriceCents: number;
    quantity?: number;
    isBillable?: boolean;
    isPayable?: boolean;
  } = {
    chargeType: overrides.chargeType ?? 'accessorial',
    description: overrides.description ?? `QA charge ${unique('CHG')}`,
    unitPriceCents: overrides.unitPriceCents ?? 7500,
  };
  if (overrides.quantity !== undefined) base.quantity = overrides.quantity;
  if (overrides.isBillable !== undefined) base.isBillable = overrides.isBillable;
  if (overrides.isPayable !== undefined) base.isPayable = overrides.isPayable;
  return base;
}

/**
 * Build a POST /loads/:load_id/notes payload matching `CreateLoadNoteDto`.
 *
 * `content` is required. `noteType` (optional) must be one of:
 *   note, dispatch_update, driver_update, customer_update, system. Omitted
 *   noteType becomes `note` on the backend.
 *
 * Backend uses `whitelist: true, forbidNonWhitelisted: true`.
 */
export function buildLoadNote(overrides: { content?: string; noteType?: string } = {}) {
  const base: { content: string; noteType?: string } = {
    content: overrides.content ?? `QA load note ${unique('LN')}`,
  };
  if (overrides.noteType !== undefined) base.noteType = overrides.noteType;
  return base;
}

/**
 * Build a POST /loads/:load_id/messages payload matching the inline
 * `SendMessageDto` in `load-messages.controller.ts`:
 *   `{ content: string (1..2000 chars) }`.
 *
 * That controller is NOT whitelisted with `forbidNonWhitelisted: true`
 * (no @UsePipes there), but staying disciplined and emitting only the
 * documented key keeps the payload shape stable.
 */
export function buildLoadMessage(overrides: { content?: string } = {}) {
  return {
    content: overrides.content ?? `QA load message ${unique('MSG')}`,
  };
}

/**
 * Build a POST /loads/:loadId/driver-actions payload matching
 * `CreateDriverActionDto`. `actionType` is one of
 * `DRIVER_ACTION_TYPES` = ['detention','scale_ticket','fuel_receipt','issue_report'].
 * `stopId` / `note` / `metadata` are optional.
 *
 * Backend uses `whitelist: true, forbidNonWhitelisted: true`.
 */
export function buildDriverAction(
  overrides: {
    actionType?: 'detention' | 'scale_ticket' | 'fuel_receipt' | 'issue_report';
    stopId?: number;
    note?: string;
    metadata?: Record<string, unknown>;
  } = {},
) {
  const base: {
    actionType: string;
    stopId?: number;
    note?: string;
    metadata?: Record<string, unknown>;
  } = {
    actionType: overrides.actionType ?? 'detention',
    note: overrides.note ?? `QA driver action ${unique('DA')}`,
  };
  if (overrides.stopId !== undefined) base.stopId = overrides.stopId;
  if (overrides.metadata !== undefined) base.metadata = overrides.metadata;
  return base;
}

/**
 * Build a POST /loads/:loadId/money-codes payload matching
 * `CreateMoneyCodeDto`. `requestedCents` (100..9,999,999) + `method`
 * (one of MONEY_CODE_METHODS: 'comchek'|'efs'|'cash') are required.
 * `stopId` / `driverNote` are optional.
 *
 * Backend uses `whitelist: true, forbidNonWhitelisted: true`.
 */
export function buildMoneyCodeRequest(
  overrides: {
    requestedCents?: number;
    method?: 'comchek' | 'efs' | 'cash';
    stopId?: number;
    driverNote?: string;
  } = {},
) {
  const base: {
    requestedCents: number;
    method: string;
    stopId?: number;
    driverNote?: string;
  } = {
    requestedCents: overrides.requestedCents ?? 15000,
    method: overrides.method ?? 'comchek',
    driverNote: overrides.driverNote ?? `QA lumper request ${unique('MC')}`,
  };
  if (overrides.stopId !== undefined) base.stopId = overrides.stopId;
  return base;
}

/**
 * Build a POST /loads/:loadId/money-codes/issue payload matching
 * `IssueMoneyCodeDto` (dispatcher-issued, not requested). `code`,
 * `amountCents`, `method` are required. `stopId`/`dispatcherNote`/
 * `expiresInHours` (1..168) are optional.
 */
export function buildMoneyCodeIssue(
  overrides: {
    code?: string;
    amountCents?: number;
    method?: 'comchek' | 'efs' | 'cash';
    stopId?: number;
    dispatcherNote?: string;
    expiresInHours?: number;
  } = {},
) {
  const base: {
    code: string;
    amountCents: number;
    method: string;
    stopId?: number;
    dispatcherNote?: string;
    expiresInHours?: number;
  } = {
    code: overrides.code ?? unique('CODE').slice(0, 20).toUpperCase(),
    amountCents: overrides.amountCents ?? 12500,
    method: overrides.method ?? 'comchek',
    dispatcherNote: overrides.dispatcherNote ?? `QA issued code ${unique('MCI')}`,
  };
  if (overrides.stopId !== undefined) base.stopId = overrides.stopId;
  if (overrides.expiresInHours !== undefined) base.expiresInHours = overrides.expiresInHours;
  return base;
}

/**
 * Build a POST /documents/presign-upload payload matching
 * `PresignUploadDto`. Entity types are lowercase snake: `load`, `load_stop`,
 * `driver`, `vehicle`, `recurring_lane`. `entityId` is a STRING on the wire
 * (controller converts via `Number()`), so callers pass the numeric DB id
 * stringified.
 *
 * `mimeType` defaults to application/pdf (allowed by service). File size is
 * always under the 10MB cap. `documentType` must be from
 * `getAllDocumentTypeCodes()` in shared-types — default `rate_confirmation`
 * is the broadest match across entity types, but callers should override
 * with the type that actually applies to their entity (e.g. `medical_card`
 * for DRIVER, `registration` for VEHICLE).
 *
 * See:
 *   apps/backend/src/domains/fleet/documents/dto/presign-upload.dto.ts
 */
export function buildDocumentPresignRequest(
  overrides: {
    entityType?: 'load' | 'load_stop' | 'driver' | 'vehicle' | 'recurring_lane';
    entityId?: number | string;
    documentType?: string;
    fileName?: string;
    mimeType?: string;
    fileSize?: number;
    relatedStopId?: string;
    description?: string;
  } = {},
) {
  const entityType = overrides.entityType ?? 'load';
  const ext = 'pdf';
  return {
    fileName: overrides.fileName ?? `qa-${entityType}-${unique('doc')}.${ext}`,
    mimeType: overrides.mimeType ?? 'application/pdf',
    fileSize: overrides.fileSize ?? 245_000,
    entityType,
    entityId: String(overrides.entityId ?? ''),
    documentType: overrides.documentType ?? 'rate_confirmation',
    relatedStopId: overrides.relatedStopId,
    description: overrides.description,
  };
}
