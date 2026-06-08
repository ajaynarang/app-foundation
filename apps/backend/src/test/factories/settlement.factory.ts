import { recent, dateOnly } from '../helpers/time.helpers';

export function makeSettlement(overrides?: Record<string, any>) {
  return {
    id: 1,
    settlementId: 'stl-test-001',
    settlementNumber: 'STL-1001',
    tenantId: 1,
    status: 'DRAFT',
    driverId: 1,
    periodStart: dateOnly(recent()),
    periodEnd: dateOnly(new Date()),
    grossPayCents: 180000,
    deductionsCents: 0,
    netPayCents: 180000,
    approvedBy: null,
    approvedAt: null,
    paidAt: null,
    lineItems: [],
    deductions: [],
    createdAt: recent(),
    updatedAt: recent(),
    createdBy: 1,
    ...overrides,
  };
}

export function makeDriverPayStructure(overrides?: Record<string, any>) {
  return {
    id: 1,
    driverId: 1,
    tenantId: 1,
    type: 'PER_MILE',
    ratePerMileCents: 55,
    percentage: null,
    flatRateCents: null,
    hybridBaseCents: null,
    hybridPercent: null,
    effectiveFrom: dateOnly(recent()),
    effectiveTo: null,
    isActive: true,
    notes: null,
    createdAt: recent(),
    updatedAt: recent(),
    ...overrides,
  };
}

export function makeSettlementLineItem(overrides?: Record<string, any>) {
  return {
    id: 1,
    settlementId: 1,
    loadId: 1,
    description: 'Mileage pay - LD-1001',
    amountCents: 43175,
    type: 'LOAD_PAY',
    ...overrides,
  };
}
