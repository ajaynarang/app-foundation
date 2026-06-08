import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { QuickBooksApiClient, QuickBooksApiError } from '../quickbooks-api.client';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('QuickBooksApiClient', () => {
  let client: QuickBooksApiClient;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuickBooksApiClient,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              if (key === 'QUICKBOOKS_SANDBOX') return 'true';
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    client = module.get<QuickBooksApiClient>(QuickBooksApiClient);
  });

  describe('constructor', () => {
    it('should use sandbox URL when QUICKBOOKS_SANDBOX is true', () => {
      expect(client.baseUrl).toBe('https://sandbox-quickbooks.api.intuit.com');
    });

    it('should use production URL when QUICKBOOKS_SANDBOX is false', async () => {
      const module = await Test.createTestingModule({
        providers: [
          QuickBooksApiClient,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string, defaultValue?: string) => {
                if (key === 'QUICKBOOKS_SANDBOX') return 'false';
                return defaultValue;
              }),
            },
          },
        ],
      }).compile();

      const prodClient = module.get<QuickBooksApiClient>(QuickBooksApiClient);
      expect(prodClient.baseUrl).toBe('https://quickbooks.api.intuit.com');
    });
  });

  describe('fetchAllCustomers', () => {
    it('should query active customers with pagination', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          QueryResponse: {
            Customer: [
              { Id: '1', DisplayName: 'ABC Corp' },
              { Id: '2', DisplayName: 'XYZ Inc' },
            ],
          },
        }),
      });

      const result = await client.fetchAllCustomers('tok', 'realm-1');

      expect(result).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('query?query='),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer tok',
          }),
        }),
      );
    });

    it('should return empty array when no customers found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          QueryResponse: {},
        }),
      });

      const result = await client.fetchAllCustomers('tok', 'realm-1');

      expect(result).toEqual([]);
    });
  });

  describe('fetchAllVendors', () => {
    it('should query active vendors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          QueryResponse: {
            Vendor: [{ Id: '1', DisplayName: 'Driver John' }],
          },
        }),
      });

      const result = await client.fetchAllVendors('tok', 'realm-1');

      expect(result).toHaveLength(1);
    });
  });

  describe('fetchAllClasses', () => {
    it('should query active classes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          QueryResponse: {
            Class: [{ Id: '1', Name: 'TRUCK-01' }],
          },
        }),
      });

      const result = await client.fetchAllClasses('tok', 'realm-1');

      expect(result).toHaveLength(1);
    });
  });

  describe('fetchAllAccounts', () => {
    it('should query active accounts', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          QueryResponse: {
            Account: [
              { Id: '1', Name: 'Linehaul Revenue' },
              { Id: '2', Name: 'Fuel Revenue' },
            ],
          },
        }),
      });

      const result = await client.fetchAllAccounts('tok', 'realm-1');

      expect(result).toHaveLength(2);
    });
  });

  describe('createCustomer', () => {
    it('should POST customer and return result', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Customer: { Id: 'qb-c1', DisplayName: 'ABC Corp' },
        }),
      });

      const result = await client.createCustomer('tok', 'realm-1', {
        DisplayName: 'ABC Corp',
      });

      expect(result.Customer).toBeDefined();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('customer'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ DisplayName: 'ABC Corp' }),
        }),
      );
    });
  });

  describe('createVendor', () => {
    it('should POST vendor and return result', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Vendor: { Id: 'qb-v1', DisplayName: 'John Driver' },
        }),
      });

      const result = await client.createVendor('tok', 'realm-1', {
        DisplayName: 'John Driver',
      });

      expect(result.Vendor).toBeDefined();
    });
  });

  describe('createInvoice', () => {
    it('should POST invoice and return result', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Invoice: { Id: 'qb-inv-1', DocNumber: 'INV-001' },
        }),
      });

      const result = await client.createInvoice('tok', 'realm-1', {
        DocNumber: 'INV-001',
      });

      expect(result.Invoice).toBeDefined();
    });
  });

  describe('createBill', () => {
    it('should POST bill and return result', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Bill: { Id: 'qb-bill-1' },
        }),
      });

      const result = await client.createBill('tok', 'realm-1', {
        VendorRef: { value: 'v1' },
      });

      expect(result.Bill).toBeDefined();
    });
  });

  describe('createPayment', () => {
    it('should POST payment and return result', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Payment: { Id: 'qb-pay-1' },
        }),
      });

      const result = await client.createPayment('tok', 'realm-1', {
        TotalAmt: 1000,
      });

      expect(result.Payment).toBeDefined();
    });
  });

  describe('createBillPayment', () => {
    it('should POST bill payment and return result', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          BillPayment: { Id: 'qb-bp-1' },
        }),
      });

      const result = await client.createBillPayment('tok', 'realm-1', {
        TotalAmt: 500,
      });

      expect(result.BillPayment).toBeDefined();
    });
  });

  describe('fetchCompanyInfo', () => {
    it('should GET company info', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          CompanyInfo: { CompanyName: 'Test Inc', Id: 'realm-1' },
        }),
      });

      const result = await client.fetchCompanyInfo('tok', 'realm-1');

      expect(result.CompanyInfo.CompanyName).toBe('Test Inc');
    });
  });

  describe('fetchInvoice', () => {
    it('should GET invoice by ID', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Invoice: { Id: '123', DocNumber: 'INV-001' },
        }),
      });

      const result = await client.fetchInvoice('tok', 'realm-1', '123');

      expect(result.Invoice).toBeDefined();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('invoice/123'),
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });

  describe('error handling', () => {
    it('should throw QuickBooksApiError with 401 status on auth failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      try {
        await client.createCustomer('bad-tok', 'realm-1', {});
        fail('Expected QuickBooksApiError');
      } catch (error) {
        expect(error).toBeInstanceOf(QuickBooksApiError);
        expect((error as QuickBooksApiError).statusCode).toBe(401);
        expect(error.nonRetryable).toBe(true);
      }
    });

    it('should throw QuickBooksApiError with 429 on rate limit', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limited',
      });

      await expect(client.createInvoice('tok', 'realm-1', {})).rejects.toThrow(QuickBooksApiError);
    });

    it('should throw QuickBooksApiError on server error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal error',
      });

      await expect(client.createInvoice('tok', 'realm-1', {})).rejects.toThrow(QuickBooksApiError);
    });

    it('should throw QuickBooksApiError with 401 on query auth failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      await expect(client.fetchAllCustomers('bad-tok', 'realm-1')).rejects.toThrow(QuickBooksApiError);
    });

    it('should throw QuickBooksApiError on query non-auth error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Server error',
      });

      await expect(client.fetchAllCustomers('tok', 'realm-1')).rejects.toThrow(QuickBooksApiError);
    });
  });

  describe('pagination', () => {
    it('should paginate through multiple pages', async () => {
      // First page: 1000 results (full page = more to fetch)
      const page1 = Array.from({ length: 1000 }, (_, i) => ({
        Id: String(i + 1),
        DisplayName: `Customer ${i + 1}`,
      }));
      // Second page: fewer than 1000 results (last page)
      const page2 = [{ Id: '1001', DisplayName: 'Customer 1001' }];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ QueryResponse: { Customer: page1 } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ QueryResponse: { Customer: page2 } }),
        });

      const result = await client.fetchAllCustomers('tok', 'realm-1');

      expect(result).toHaveLength(1001);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});

describe('QuickBooksApiError', () => {
  it('should set nonRetryable for 401 errors', () => {
    const error = new QuickBooksApiError('Auth failed', 401);
    expect(error.name).toBe('QuickBooksApiError');
    expect(error.statusCode).toBe(401);
    expect((error as any).nonRetryable).toBe(true);
  });

  it('should not set nonRetryable for non-401 errors', () => {
    const error = new QuickBooksApiError('Server error', 500);
    expect(error.statusCode).toBe(500);
    expect((error as any).nonRetryable).toBeUndefined();
  });

  it('should store response body', () => {
    const error = new QuickBooksApiError('Rate limited', 429, 'Too many requests');
    expect(error.responseBody).toBe('Too many requests');
  });
});
