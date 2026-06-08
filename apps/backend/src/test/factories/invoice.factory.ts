import { recent, farFuture, dateOnly } from '../helpers/time.helpers';

export function makeInvoice(overrides?: Record<string, any>) {
  return {
    id: 1,
    invoiceNumber: 'INV-1001',
    tenantId: 1,
    status: 'DRAFT',
    customerId: 1,
    loadId: 1,
    subtotalCents: 250000,
    adjustmentCents: 0,
    totalCents: 250000,
    paidCents: 0,
    balanceCents: 250000,
    issueDate: dateOnly(recent()),
    dueDate: dateOnly(farFuture()),
    paymentTermsDays: 30,
    lineItems: [],
    payments: [],
    createdAt: recent(),
    updatedAt: recent(),
    createdBy: 1,
    ...overrides,
  };
}

export function makeInvoiceLineItem(overrides?: Record<string, any>) {
  return {
    id: 1,
    invoiceId: 1,
    description: 'Freight Charges',
    amountCents: 250000,
    quantity: 1,
    ...overrides,
  };
}
