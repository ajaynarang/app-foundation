import crypto from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { QuickBooksAdapter } from '../vendors/quickbooks/quickbooks.adapter';
import { QuickBooksApiClient } from '../vendors/quickbooks/quickbooks-api.client';
import { InvoiceSyncPayload, SettlementSyncPayload, PaymentSyncPayload } from '../accounting.types';

const mockClient = {
  fetchAllCustomers: jest.fn(),
  fetchAllVendors: jest.fn(),
  fetchAllClasses: jest.fn(),
  fetchAllAccounts: jest.fn(),
  createCustomer: jest.fn(),
  createVendor: jest.fn(),
  createClass: jest.fn(),
  createAccount: jest.fn(),
  createInvoice: jest.fn(),
  updateInvoice: jest.fn(),
  createBill: jest.fn(),
  updateBill: jest.fn(),
  createPayment: jest.fn(),
  createBillPayment: jest.fn(),
  fetchInvoice: jest.fn(),
  fetchBill: jest.fn(),
  fetchPayment: jest.fn(),
  fetchBillPayment: jest.fn(),
};

describe('QuickBooksAdapter', () => {
  let adapter: QuickBooksAdapter;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuickBooksAdapter,
        { provide: QuickBooksApiClient, useValue: mockClient },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('1') },
        },
      ],
    }).compile();

    adapter = module.get<QuickBooksAdapter>(QuickBooksAdapter);
  });

  // ---------------------------------------------------------------------------
  // syncInvoice — Invoice JSON payload construction
  // ---------------------------------------------------------------------------

  describe('syncInvoice', () => {
    const basePayload: InvoiceSyncPayload = {
      invoiceNumber: 'INV-001',
      customerExternalId: 'qb_cust_1',
      customerEmail: 'abc@logistics.com',
      issueDate: '2026-03-01',
      dueDate: '2026-03-31',
      lineItems: [
        {
          description: 'Linehaul',
          amount: 1000.0,
          accountRef: { id: '80', name: 'Linehaul Revenue' },
          type: 'LINEHAUL',
        },
        {
          description: 'Fuel Surcharge',
          amount: 200.0,
          accountRef: { id: '81', name: 'Fuel Surcharge Revenue' },
          type: 'FUEL_SURCHARGE',
        },
      ],
    };

    it('should create invoice with correct QB SalesItemLineDetail structure', async () => {
      mockClient.createInvoice.mockResolvedValue({
        Invoice: { Id: 'qb_inv_1', SyncToken: '0' },
      });

      const result = await adapter.syncInvoice('tok', 'realm', basePayload);

      expect(result.success).toBe(true);
      expect(result.externalId).toBe('qb_inv_1');

      const body = mockClient.createInvoice.mock.calls[0][2] as Record<string, unknown>;
      expect(body.DocNumber).toBe('INV-001');
      expect(body.TxnDate).toBe('2026-03-01');
      expect(body.DueDate).toBe('2026-03-31');
      expect(body.CustomerRef).toEqual({ value: 'qb_cust_1' });

      const lines = body.Line as Array<Record<string, unknown>>;
      expect(lines).toHaveLength(2);
      expect(lines[0].DetailType).toBe('SalesItemLineDetail');
      expect(lines[0].Amount).toBe(1000.0);
    });

    it('should include ClassRef when truckNumber provided', async () => {
      mockClient.createInvoice.mockResolvedValue({
        Invoice: { Id: 'qb_inv_1', SyncToken: '0' },
      });

      await adapter.syncInvoice('tok', 'realm', {
        ...basePayload,
        classExternalId: 'qb_class_1',
      });

      const body = mockClient.createInvoice.mock.calls[0][2] as Record<string, unknown>;
      expect(body.ClassRef).toEqual({ value: 'qb_class_1' });
    });

    it('should update invoice when existingExternalId is set', async () => {
      mockClient.updateInvoice.mockResolvedValue({
        Invoice: { Id: 'qb_inv_existing', SyncToken: '1' },
      });

      const result = await adapter.syncInvoice('tok', 'realm', {
        ...basePayload,
        existingExternalId: 'qb_inv_existing',
        existingSyncToken: '0',
      });

      expect(result.success).toBe(true);
      expect(mockClient.updateInvoice).toHaveBeenCalled();
      expect(mockClient.createInvoice).not.toHaveBeenCalled();

      const body = mockClient.updateInvoice.mock.calls[0][2] as Record<string, unknown>;
      expect(body.Id).toBe('qb_inv_existing');
      expect(body.sparse).toBe(true);
    });

    it('should return success:false when client throws', async () => {
      mockClient.createInvoice.mockRejectedValue(new Error('QB 400 Bad Request'));

      const result = await adapter.syncInvoice('tok', 'realm', basePayload);

      expect(result.success).toBe(false);
      expect(result.error).toBe('QB 400 Bad Request');
    });
  });

  // ---------------------------------------------------------------------------
  // syncBill — Bill JSON payload construction
  // ---------------------------------------------------------------------------

  describe('syncBill', () => {
    const basePayload: SettlementSyncPayload = {
      settlementNumber: 'SET-001',
      vendorExternalId: 'qb_vend_1',
      driverEmail: 'driver@test.com',
      periodEnd: '2026-03-15',
      lineItems: [
        {
          description: 'Linehaul Pay',
          amount: 2000.0,
          accountRef: { id: '90', name: 'Driver Pay Expense' },
        },
      ],
      deductions: [
        {
          description: 'Fuel Advance',
          amount: 200.0,
          accountRef: { id: '91', name: 'Fuel Advance Expense' },
          type: 'FUEL_ADVANCE',
        },
      ],
    };

    it('should create bill with AccountBasedExpenseLineDetail', async () => {
      mockClient.createBill.mockResolvedValue({
        Bill: { Id: 'qb_bill_1', SyncToken: '0' },
      });

      const result = await adapter.syncBill('tok', 'realm', basePayload);

      expect(result.success).toBe(true);
      expect(result.externalId).toBe('qb_bill_1');

      const body = mockClient.createBill.mock.calls[0][2] as Record<string, unknown>;
      expect(body.DocNumber).toBe('SET-001');
      expect(body.VendorRef).toEqual({ value: 'qb_vend_1' });

      const lines = body.Line as Array<Record<string, unknown>>;
      expect(lines).toHaveLength(2); // 1 line item + 1 deduction
      expect(lines[0].DetailType).toBe('AccountBasedExpenseLineDetail');
    });

    it('should return success:false when client throws', async () => {
      mockClient.createBill.mockRejectedValue(new Error('QB API error'));

      const result = await adapter.syncBill('tok', 'realm', basePayload);

      expect(result.success).toBe(false);
      expect(result.error).toBe('QB API error');
    });
  });

  // ---------------------------------------------------------------------------
  // syncPayment — Payment payload
  // ---------------------------------------------------------------------------

  describe('syncPayment', () => {
    it('should create payment with LinkedTxn to invoice', async () => {
      mockClient.createPayment.mockResolvedValue({
        Payment: { Id: 'qb_pay_1', SyncToken: '0' },
      });

      const payload: PaymentSyncPayload = {
        amount: 1000.0,
        paymentDate: '2026-03-10',
        paymentMethod: 'ACH',
        referenceNumber: 'REF-001',
        linkedInvoiceExternalId: 'qb_inv_1',
        customerExternalId: 'qb_cust_1',
      };

      const result = await adapter.syncPayment('tok', 'realm', payload);

      expect(result.success).toBe(true);
      expect(result.externalId).toBe('qb_pay_1');

      const body = mockClient.createPayment.mock.calls[0][2] as Record<string, unknown>;
      expect(body.TotalAmt).toBe(1000.0);
      expect(body.CustomerRef).toEqual({ value: 'qb_cust_1' });

      const lines = body.Line as Array<{
        Amount: number;
        LinkedTxn: Array<{ TxnId: string; TxnType: string }>;
      }>;
      expect(lines[0].LinkedTxn[0].TxnId).toBe('qb_inv_1');
      expect(lines[0].LinkedTxn[0].TxnType).toBe('Invoice');
    });
  });

  // ---------------------------------------------------------------------------
  // syncBillPayment
  // ---------------------------------------------------------------------------

  describe('syncBillPayment', () => {
    it('should create bill payment with LinkedTxn to bill', async () => {
      mockClient.createBillPayment.mockResolvedValue({
        BillPayment: { Id: 'qb_bp_1', SyncToken: '0' },
      });

      const result = await adapter.syncBillPayment('tok', 'realm', 500.0, 'qb_bill_1', 'qb_vend_1', '2026-03-20');

      expect(result.success).toBe(true);
      expect(result.externalId).toBe('qb_bp_1');

      const body = mockClient.createBillPayment.mock.calls[0][2] as Record<string, unknown>;
      expect(body.TotalAmt).toBe(500.0);
      expect(body.VendorRef).toEqual({ value: 'qb_vend_1' });
    });

    it('should return success:false on error', async () => {
      mockClient.createBillPayment.mockRejectedValue(new Error('BP failed'));

      const result = await adapter.syncBillPayment('tok', 'realm', 500, 'b1', 'v1', '2026-03-20');

      expect(result.success).toBe(false);
      expect(result.error).toBe('BP failed');
    });
  });

  // ---------------------------------------------------------------------------
  // Fetch entities
  // ---------------------------------------------------------------------------

  describe('fetchCustomers', () => {
    it('should fetch and map customers', async () => {
      mockClient.fetchAllCustomers.mockResolvedValue([
        {
          Id: '1',
          DisplayName: 'Customer A',
          PrimaryEmailAddr: { Address: 'a@test.com' },
          PrimaryPhone: { FreeFormNumber: '555-1234' },
        },
        { Id: '2', DisplayName: 'Customer B' },
      ]);

      const result = await adapter.fetchCustomers('tok', 'realm');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: '1',
        displayName: 'Customer A',
        email: 'a@test.com',
        phone: '555-1234',
      });
      expect(result[1].email).toBeUndefined();
    });
  });

  describe('fetchVendors', () => {
    it('should fetch and map vendors', async () => {
      mockClient.fetchAllVendors.mockResolvedValue([{ Id: '1', DisplayName: 'Vendor A' }]);

      const result = await adapter.fetchVendors('tok', 'realm');

      expect(result[0]).toEqual({
        id: '1',
        displayName: 'Vendor A',
        email: undefined,
        phone: undefined,
      });
    });
  });

  describe('fetchClasses', () => {
    it('should fetch and map classes', async () => {
      mockClient.fetchAllClasses.mockResolvedValue([
        { Id: '1', Name: 'Class A', ParentRef: { value: 'p1' } },
        { Id: '2', Name: 'Class B' },
      ]);

      const result = await adapter.fetchClasses('tok', 'realm');

      expect(result[0]).toEqual({
        id: '1',
        name: 'Class A',
        parentId: 'p1',
      });
      expect(result[1].parentId).toBeUndefined();
    });
  });

  describe('fetchAccounts', () => {
    it('should fetch and map accounts', async () => {
      mockClient.fetchAllAccounts.mockResolvedValue([
        {
          Id: '1',
          Name: 'Revenue',
          AccountType: 'Income',
          Classification: 'Revenue',
        },
      ]);

      const result = await adapter.fetchAccounts('tok', 'realm');

      expect(result[0]).toEqual({
        id: '1',
        name: 'Revenue',
        accountType: 'Income',
        classification: 'Revenue',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Create entities
  // ---------------------------------------------------------------------------

  describe('createCustomer', () => {
    it('should create customer with email', async () => {
      mockClient.createCustomer.mockResolvedValue({
        Customer: {
          Id: '10',
          DisplayName: 'New Cust',
          PrimaryEmailAddr: { Address: 'cust@test.com' },
        },
      });

      const result = await adapter.createCustomer('tok', 'realm', 'New Cust', 'cust@test.com');

      expect(result.id).toBe('10');
      expect(result.displayName).toBe('New Cust');
      expect(result.email).toBe('cust@test.com');
    });
  });

  describe('createVendor', () => {
    it('should create vendor', async () => {
      mockClient.createVendor.mockResolvedValue({
        Vendor: { Id: '20', DisplayName: 'New Vendor' },
      });

      const result = await adapter.createVendor('tok', 'realm', 'New Vendor');

      expect(result.id).toBe('20');
    });
  });

  describe('createClass', () => {
    it('should create class', async () => {
      mockClient.createClass.mockResolvedValue({
        Class: { Id: '30', Name: 'TRK-001' },
      });

      const result = await adapter.createClass('tok', 'realm', 'TRK-001');

      expect(result.id).toBe('30');
      expect(result.name).toBe('TRK-001');
    });
  });

  describe('createAccount', () => {
    it('should create account', async () => {
      mockClient.createAccount.mockResolvedValue({
        Account: {
          Id: '40',
          Name: 'Driver Pay',
          AccountType: 'Expense',
          Classification: 'Expense',
        },
      });

      const result = await adapter.createAccount('tok', 'realm', 'Driver Pay', 'Expense', 'Expense');

      expect(result.id).toBe('40');
    });
  });

  // ---------------------------------------------------------------------------
  // Fetch single entities
  // ---------------------------------------------------------------------------

  describe('fetchInvoice', () => {
    it('should fetch and map invoice', async () => {
      mockClient.fetchInvoice.mockResolvedValue({
        Invoice: {
          Id: 'inv-1',
          DocNumber: 'INV-001',
          SyncToken: '2',
          Balance: 500,
          TotalAmt: 1000,
        },
      });

      const result = await adapter.fetchInvoice('tok', 'realm', 'inv-1');

      expect(result).toEqual({
        id: 'inv-1',
        docNumber: 'INV-001',
        syncToken: '2',
        balance: 500,
        totalAmt: 1000,
      });
    });

    it('should return null on error', async () => {
      mockClient.fetchInvoice.mockRejectedValue(new Error('Not found'));

      const result = await adapter.fetchInvoice('tok', 'realm', 'x');
      expect(result).toBeNull();
    });
  });

  describe('fetchBill', () => {
    it('should fetch and map bill', async () => {
      mockClient.fetchBill.mockResolvedValue({
        Bill: {
          Id: 'bill-1',
          DocNumber: 'BILL-001',
          SyncToken: '1',
          Balance: 200,
          TotalAmt: 2000,
        },
      });

      const result = await adapter.fetchBill('tok', 'realm', 'bill-1');

      expect(result.id).toBe('bill-1');
    });

    it('should return null on error', async () => {
      mockClient.fetchBill.mockRejectedValue(new Error('err'));
      expect(await adapter.fetchBill('tok', 'realm', 'x')).toBeNull();
    });
  });

  describe('fetchPaymentDetail', () => {
    it('should extract invoice IDs from payment lines', async () => {
      mockClient.fetchPayment.mockResolvedValue({
        Payment: {
          TotalAmt: 1500,
          TxnDate: '2026-03-01',
          Line: [
            {
              LinkedTxn: [
                { TxnId: 'inv-1', TxnType: 'Invoice' },
                { TxnId: 'cr-1', TxnType: 'CreditMemo' },
              ],
            },
          ],
        },
      });

      const result = await adapter.fetchPaymentDetail('tok', 'realm', 'pay-1');

      expect(result.invoiceIds).toEqual(['inv-1']);
      expect(result.amount).toBe(1500);
    });

    it('should return null on error', async () => {
      mockClient.fetchPayment.mockRejectedValue(new Error('err'));
      expect(await adapter.fetchPaymentDetail('tok', 'realm', 'x')).toBeNull();
    });
  });

  describe('fetchBillPaymentDetail', () => {
    it('should extract bill IDs from bill payment lines', async () => {
      mockClient.fetchBillPayment.mockResolvedValue({
        BillPayment: {
          TotalAmt: 2000,
          TxnDate: '2026-03-05',
          Line: [
            {
              LinkedTxn: [{ TxnId: 'bill-1', TxnType: 'Bill' }],
            },
          ],
        },
      });

      const result = await adapter.fetchBillPaymentDetail('tok', 'realm', 'bp-1');

      expect(result.billIds).toEqual(['bill-1']);
    });

    it('should return null on error', async () => {
      mockClient.fetchBillPayment.mockRejectedValue(new Error('err'));
      expect(await adapter.fetchBillPaymentDetail('tok', 'realm', 'x')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // syncBill — update existing bill
  // ---------------------------------------------------------------------------

  describe('syncBill — update', () => {
    it('should update bill when existingExternalId is set', async () => {
      mockClient.updateBill.mockResolvedValue({
        Bill: { Id: 'qb_bill_existing', SyncToken: '2' },
      });

      const result = await adapter.syncBill('tok', 'realm', {
        settlementNumber: 'SET-002',
        vendorExternalId: 'qb_vend_1',
        driverEmail: 'driver@test.com',
        periodEnd: '2026-03-20',
        lineItems: [
          {
            description: 'Pay',
            amount: 1000,
            accountRef: { id: '90', name: 'Account' },
            truckNumber: 'qb_class_1',
          },
        ],
        deductions: [],
        existingExternalId: 'qb_bill_existing',
        existingSyncToken: '1',
      });

      expect(result.success).toBe(true);
      expect(mockClient.updateBill).toHaveBeenCalled();
      expect(mockClient.createBill).not.toHaveBeenCalled();

      const body = mockClient.updateBill.mock.calls[0][2] as Record<string, unknown>;
      expect(body.Id).toBe('qb_bill_existing');
      expect(body.sparse).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // syncPayment — error handling
  // ---------------------------------------------------------------------------

  describe('syncPayment — error', () => {
    it('should return success:false when client throws', async () => {
      mockClient.createPayment.mockRejectedValue(new Error('Payment failed'));

      const result = await adapter.syncPayment('tok', 'realm', {
        amount: 100,
        paymentDate: '2026-03-01',
        linkedInvoiceExternalId: 'inv-1',
        customerExternalId: 'cust-1',
      } as PaymentSyncPayload);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Payment failed');
    });
  });

  // ---------------------------------------------------------------------------
  // Webhook — validateWebhookSignature
  // ---------------------------------------------------------------------------

  describe('validateWebhookSignature', () => {
    const verifierToken = 'super_secret_token';

    it('should return true for valid HMAC-SHA256 signature', () => {
      const payload = '{"test":"data"}';
      const validSignature = crypto.createHmac('sha256', verifierToken).update(payload).digest('base64');

      const result = adapter.validateWebhookSignature(payload, validSignature, verifierToken);

      expect(result).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const result = adapter.validateWebhookSignature('{"test":"data"}', 'invalid_signature_xyz', verifierToken);

      expect(result).toBe(false);
    });

    it('should return false for empty signature', () => {
      const result = adapter.validateWebhookSignature('{"test":"data"}', '', verifierToken);

      expect(result).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Webhook — parseWebhookEvents
  // ---------------------------------------------------------------------------

  describe('parseWebhookEvents', () => {
    it('should parse CDC event notifications', () => {
      const payload = {
        eventNotifications: [
          {
            realmId: 'realm_123',
            dataChangeEvent: {
              entities: [
                {
                  name: 'Payment',
                  id: 'pay_1',
                  operation: 'Create',
                  lastUpdated: '2026-03-03T10:00:00Z',
                },
                {
                  name: 'BillPayment',
                  id: 'billpay_1',
                  operation: 'Update',
                  lastUpdated: '2026-03-03T10:00:00Z',
                },
              ],
            },
          },
        ],
      };

      const events = adapter.parseWebhookEvents(payload);

      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({
        eventType: 'Payment',
        operation: 'Create',
        entityId: 'pay_1',
        realmId: 'realm_123',
      });
      expect(events[1]).toEqual({
        eventType: 'BillPayment',
        operation: 'Update',
        entityId: 'billpay_1',
        realmId: 'realm_123',
      });
    });

    it('should return empty array for empty payload', () => {
      const events = adapter.parseWebhookEvents({});

      expect(events).toHaveLength(0);
    });

    it('should handle multiple realms in one batch', () => {
      const payload = {
        eventNotifications: [
          {
            realmId: 'realm_1',
            dataChangeEvent: {
              entities: [
                {
                  name: 'Payment',
                  id: 'p1',
                  operation: 'Create',
                  lastUpdated: '2026-03-03T10:00:00Z',
                },
              ],
            },
          },
          {
            realmId: 'realm_2',
            dataChangeEvent: {
              entities: [
                {
                  name: 'Invoice',
                  id: 'i1',
                  operation: 'Update',
                  lastUpdated: '2026-03-03T10:00:00Z',
                },
              ],
            },
          },
        ],
      };

      const events = adapter.parseWebhookEvents(payload);

      expect(events).toHaveLength(2);
      expect(events[0].realmId).toBe('realm_1');
      expect(events[1].realmId).toBe('realm_2');
    });
  });
});
