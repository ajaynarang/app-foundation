import { CustomerTool } from '../customer.tool';

describe('CustomerTool', () => {
  let tool: CustomerTool;
  let mockCustomersService: any;
  let mockInvoicingService: any;

  beforeEach(() => {
    mockCustomersService = {
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
    };
    mockInvoicingService = {
      getCustomerPaymentStats: jest.fn(),
    };
    tool = new CustomerTool(mockCustomersService, mockInvoicingService);
  });

  describe('queryCustomers', () => {
    it('returns error when no tenant context', async () => {
      const result = await tool.queryCustomers({ limit: 20 });
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('No tenant context');
    });

    it('returns customers with card data', async () => {
      mockCustomersService.findAll.mockResolvedValue([
        {
          customerId: 'cust_1',
          companyName: 'Acme Corp',
          contacts: [{ isPrimary: true, email: 'contact@acme.com', phone: '555-1234' }],
          paymentTerms: 'Net 30',
          status: 'ACTIVE',
        },
      ]);

      const result = await tool.queryCustomers({
        limit: 20,
        _tenantId: 1,
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.count).toBe(1);
      expect(data.customers[0].companyName).toBe('Acme Corp');
      expect(result._card.type).toBe('customer_list');
    });

    it('filters by search term', async () => {
      mockCustomersService.findAll.mockResolvedValue([
        { customerId: 'cust_1', companyName: 'Acme Corp', status: 'ACTIVE' },
        {
          customerId: 'cust_2',
          companyName: 'Beta Logistics',
          status: 'ACTIVE',
        },
      ]);

      const result = await tool.queryCustomers({
        search: 'acme',
        limit: 20,
        _tenantId: 1,
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.count).toBe(1);
      expect(data.customers[0].companyName).toBe('Acme Corp');
    });
  });

  describe('getCustomerDetail', () => {
    it('returns error when no tenant context', async () => {
      const result = await tool.getCustomerDetail({ customerId: 'cust_1' });
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('No tenant context');
    });

    it('returns customer details with card', async () => {
      mockCustomersService.findOne.mockResolvedValue({
        customerId: 'cust_1',
        companyName: 'Acme Corp',
        contacts: [{ isPrimary: true, email: 'contact@acme.com', phone: '555-1234' }],
        paymentTerms: 'Net 30',
        status: 'ACTIVE',
      });

      const result = await tool.getCustomerDetail({
        customerId: 'cust_1',
        _tenantId: 1,
      });

      expect(result._card.type).toBe('customer');
      expect(result._card.data.companyName).toBe('Acme Corp');
    });

    it('returns error when customer not found', async () => {
      mockCustomersService.findOne.mockRejectedValue(new Error('Not found'));

      const result = await tool.getCustomerDetail({
        customerId: 'cust_x',
        _tenantId: 1,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('Not found');
    });
  });

  describe('getCustomerPaymentStats', () => {
    it('returns error when no tenant context', async () => {
      const result = await tool.getCustomerPaymentStats({
        customerId: 'cust_1',
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('No tenant context');
    });

    it('returns payment stats', async () => {
      mockCustomersService.findOne.mockResolvedValue({
        id: 42,
        customerId: 'cust_1',
      });
      mockInvoicingService.getCustomerPaymentStats.mockResolvedValue({
        avgDaysToPay: 25,
        totalPaid: 100000,
        outstandingBalance: 5000,
      });

      const result = await tool.getCustomerPaymentStats({
        customerId: 'cust_1',
        _tenantId: 1,
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.avgDaysToPay).toBe(25);
    });

    it('returns error when service fails', async () => {
      mockCustomersService.findOne.mockRejectedValue(new Error('Customer not found'));

      const result = await tool.getCustomerPaymentStats({
        customerId: 'cust_x',
        _tenantId: 1,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('Customer not found');
    });
  });
});
