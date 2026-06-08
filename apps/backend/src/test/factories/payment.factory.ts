import { recent, dateOnly } from '../helpers/time.helpers';

export function makePayment(overrides?: Record<string, any>) {
  return {
    id: 1,
    paymentId: 'pay-test-001',
    tenantId: 1,
    invoiceId: 1,
    amountCents: 250000,
    paymentMethod: 'ACH',
    referenceNumber: 'REF-001',
    paymentDate: dateOnly(recent()),
    notes: null,
    createdAt: recent(),
    createdBy: 1,
    ...overrides,
  };
}
