import { farFuture, recent, dateOnly } from '../helpers/time.helpers';

export function makeVehicle(overrides?: Record<string, any>) {
  return {
    id: 1,
    vehicleId: 'veh-test-001',
    tenantId: 1,
    unitNumber: 'UNIT-001',
    make: 'Freightliner',
    model: 'Cascadia',
    year: 2023,
    vin: '1FUJGLDR5CLBP8901',
    licensePlate: 'TX-ABC-1234',
    fuelCapacityGallons: 200,
    currentFuelGallons: 150,
    mpg: 6.5,
    hasSleeperBerth: true,
    grossWeightLbs: 80000,
    equipmentType: 'DRY_VAN',
    status: 'AVAILABLE',
    lifecycleStatus: 'ACTIVE',
    registrationExpiry: dateOnly(farFuture()),
    insuranceExpiry: dateOnly(farFuture()),
    annualInspectionDate: dateOnly(recent()),
    nextMaintenanceDate: dateOnly(farFuture()),
    externalSource: null,
    dvirs: [],
    createdAt: recent(),
    updatedAt: recent(),
    ...overrides,
  };
}
