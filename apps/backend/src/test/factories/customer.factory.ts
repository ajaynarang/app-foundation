import { recent } from '../helpers/time.helpers';

export function makeCustomer(overrides?: Record<string, any>) {
  return {
    id: 1,
    customerId: 'cust-test-001',
    tenantId: 1,
    companyName: 'Acme Shipping Inc',
    customerType: 'SHIPPER',
    status: 'ACTIVE',
    paymentTerms: 'NET_30',
    creditLimit: 50000,
    billingEmail: 'billing@acme-shipping.com',
    createdAt: recent(),
    updatedAt: recent(),
    ...overrides,
  };
}
