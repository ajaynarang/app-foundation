import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const QB_BASE_URL = 'https://quickbooks.api.intuit.com';
const QB_SANDBOX_URL = 'https://sandbox-quickbooks.api.intuit.com';
const QB_API_VERSION = '73';

/**
 * Custom error for QB API failures that carries the HTTP status code.
 * Allows callers to differentiate auth errors (401), rate limits (429),
 * and transient failures (500+).
 */
export class QuickBooksApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody?: string,
  ) {
    super(message);
    this.name = 'QuickBooksApiError';
    // 401 and invalid_grant errors are non-retryable — user must reconnect
    if (statusCode === 401) {
      (this as any).nonRetryable = true;
    }
  }
}

/**
 * Low-level QuickBooks Online REST API v3 client.
 *
 * All methods accept explicit accessToken and realmId — this class is
 * intentionally stateless. Token management is handled by AccountingSyncService.
 */
@Injectable()
export class QuickBooksApiClient {
  private readonly logger = new Logger(QuickBooksApiClient.name);
  readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    const useSandbox = this.config.get<string>('QUICKBOOKS_SANDBOX', 'true') === 'true';
    this.baseUrl = useSandbox ? QB_SANDBOX_URL : QB_BASE_URL;

    if (useSandbox) {
      this.logger.warn(
        'QuickBooks API client is using SANDBOX mode (QUICKBOOKS_SANDBOX=true). ' +
          'Set QUICKBOOKS_SANDBOX=false for production.',
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Generic API helper
  // ---------------------------------------------------------------------------

  private async request<T>(
    method: 'GET' | 'POST',
    accessToken: string,
    realmId: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}/v3/company/${realmId}/${path}?minorversion=${QB_API_VERSION}`;

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (!res.ok) {
      const errBody = await res.text();
      this.logger.error(`QB API ${method} ${path} failed [${res.status}]: ${errBody}`);

      if (res.status === 401) {
        throw new QuickBooksApiError(
          'QuickBooks authentication failed — token may be expired or revoked',
          401,
          errBody,
        );
      }

      if (res.status === 429) {
        throw new QuickBooksApiError('QuickBooks rate limit exceeded — please retry after a short delay', 429, errBody);
      }

      throw new QuickBooksApiError(`QuickBooks API ${method} ${path} failed [${res.status}]`, res.status, errBody);
    }

    return res.json() as Promise<T>;
  }

  /**
   * Execute a QB SQL query with automatic pagination (QB max page size: 1000).
   * Fetches all pages until no more results.
   */
  private async query<T>(accessToken: string, realmId: string, baseSql: string): Promise<T[]> {
    const PAGE_SIZE = 1000;
    const results: T[] = [];
    let startPosition = 1;

    while (true) {
      const sql = `${baseSql} STARTPOSITION ${startPosition} MAXRESULTS ${PAGE_SIZE}`;
      const url = `${this.baseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent(sql)}&minorversion=${QB_API_VERSION}`;

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        const errBody = await res.text();
        this.logger.error(`QB query failed [${res.status}]: ${errBody}`);

        if (res.status === 401) {
          throw new QuickBooksApiError(
            'QuickBooks authentication failed — token may be expired or revoked',
            401,
            errBody,
          );
        }

        throw new QuickBooksApiError(`QuickBooks query failed [${res.status}]`, res.status, errBody);
      }

      const data = (await res.json()) as { QueryResponse: Record<string, T[]> };
      const key = Object.keys(data.QueryResponse).find(
        (k) => k !== 'startPosition' && k !== 'maxResults' && k !== 'totalCount',
      );
      const page = key ? data.QueryResponse[key] || [] : [];

      results.push(...page);

      if (page.length < PAGE_SIZE) {
        break; // Last page — no more results
      }

      startPosition += PAGE_SIZE;
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Customers
  // ---------------------------------------------------------------------------

  async fetchAllCustomers(accessToken: string, realmId: string): Promise<unknown[]> {
    return this.query(accessToken, realmId, 'SELECT * FROM Customer WHERE Active = true');
  }

  async createCustomer(
    accessToken: string,
    realmId: string,
    body: Record<string, unknown>,
  ): Promise<{ Customer: unknown }> {
    return this.request('POST', accessToken, realmId, 'customer', body);
  }

  // ---------------------------------------------------------------------------
  // Vendors
  // ---------------------------------------------------------------------------

  async fetchAllVendors(accessToken: string, realmId: string): Promise<unknown[]> {
    return this.query(accessToken, realmId, 'SELECT * FROM Vendor WHERE Active = true');
  }

  async createVendor(
    accessToken: string,
    realmId: string,
    body: Record<string, unknown>,
  ): Promise<{ Vendor: unknown }> {
    return this.request('POST', accessToken, realmId, 'vendor', body);
  }

  // ---------------------------------------------------------------------------
  // Classes
  // ---------------------------------------------------------------------------

  async fetchAllClasses(accessToken: string, realmId: string): Promise<unknown[]> {
    return this.query(accessToken, realmId, 'SELECT * FROM Class WHERE Active = true');
  }

  async createClass(accessToken: string, realmId: string, body: Record<string, unknown>): Promise<{ Class: unknown }> {
    return this.request('POST', accessToken, realmId, 'class', body);
  }

  // ---------------------------------------------------------------------------
  // Accounts
  // ---------------------------------------------------------------------------

  async fetchAllAccounts(accessToken: string, realmId: string): Promise<unknown[]> {
    return this.query(accessToken, realmId, 'SELECT * FROM Account WHERE Active = true');
  }

  async createAccount(
    accessToken: string,
    realmId: string,
    body: Record<string, unknown>,
  ): Promise<{ Account: unknown }> {
    return this.request('POST', accessToken, realmId, 'account', body);
  }

  // ---------------------------------------------------------------------------
  // Invoices
  // ---------------------------------------------------------------------------

  async createInvoice(
    accessToken: string,
    realmId: string,
    body: Record<string, unknown>,
  ): Promise<{ Invoice: unknown }> {
    return this.request('POST', accessToken, realmId, 'invoice', body);
  }

  async updateInvoice(
    accessToken: string,
    realmId: string,
    body: Record<string, unknown>,
  ): Promise<{ Invoice: unknown }> {
    return this.request('POST', accessToken, realmId, 'invoice', body);
  }

  async fetchInvoice(accessToken: string, realmId: string, invoiceId: string): Promise<{ Invoice: unknown }> {
    return this.request('GET', accessToken, realmId, `invoice/${invoiceId}`, undefined);
  }

  // ---------------------------------------------------------------------------
  // Bills
  // ---------------------------------------------------------------------------

  async createBill(accessToken: string, realmId: string, body: Record<string, unknown>): Promise<{ Bill: unknown }> {
    return this.request('POST', accessToken, realmId, 'bill', body);
  }

  async updateBill(accessToken: string, realmId: string, body: Record<string, unknown>): Promise<{ Bill: unknown }> {
    return this.request('POST', accessToken, realmId, 'bill', body);
  }

  async fetchBill(accessToken: string, realmId: string, billId: string): Promise<{ Bill: unknown }> {
    return this.request('GET', accessToken, realmId, `bill/${billId}`, undefined);
  }

  // ---------------------------------------------------------------------------
  // Payments
  // ---------------------------------------------------------------------------

  async createPayment(
    accessToken: string,
    realmId: string,
    body: Record<string, unknown>,
  ): Promise<{ Payment: unknown }> {
    return this.request('POST', accessToken, realmId, 'payment', body);
  }

  async fetchPayment(accessToken: string, realmId: string, paymentId: string): Promise<{ Payment: unknown }> {
    return this.request('GET', accessToken, realmId, `payment/${paymentId}`, undefined);
  }

  // ---------------------------------------------------------------------------
  // Bill Payments
  // ---------------------------------------------------------------------------

  async createBillPayment(
    accessToken: string,
    realmId: string,
    body: Record<string, unknown>,
  ): Promise<{ BillPayment: unknown }> {
    return this.request('POST', accessToken, realmId, 'billpayment', body);
  }

  async fetchBillPayment(
    accessToken: string,
    realmId: string,
    billPaymentId: string,
  ): Promise<{ BillPayment: unknown }> {
    return this.request('GET', accessToken, realmId, `billpayment/${billPaymentId}`, undefined);
  }

  // ---------------------------------------------------------------------------
  // Company info (for verifying connection)
  // ---------------------------------------------------------------------------

  async fetchCompanyInfo(
    accessToken: string,
    realmId: string,
  ): Promise<{ CompanyInfo: { CompanyName: string; Id: string } }> {
    return this.request('GET', accessToken, realmId, `companyinfo/${realmId}`, undefined);
  }
}
