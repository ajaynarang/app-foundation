import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { IAccountingAdapter } from '../../accounting-adapter.interface';
import {
  ExternalCustomer,
  ExternalVendor,
  ExternalClass,
  ExternalAccount,
  ExternalInvoice,
  ExternalBill,
  SyncResult,
  InvoiceSyncPayload,
  SettlementSyncPayload,
  PaymentSyncPayload,
  WebhookEvent,
} from '../../accounting.types';
import { QuickBooksApiClient } from './quickbooks-api.client';

/**
 * QuickBooks Online implementation of IAccountingAdapter.
 *
 * Translates between SALLY's generic accounting types and QB's REST API v3 JSON format.
 * Handles QB-specific patterns: SyncToken for optimistic concurrency, CDC webhook events,
 * AccountBasedExpenseLineDetail for bills, SalesItemLineDetail for invoices.
 */
@Injectable()
export class QuickBooksAdapter implements IAccountingAdapter {
  private readonly logger = new Logger(QuickBooksAdapter.name);
  private readonly defaultServiceItemId: string;

  constructor(
    private readonly client: QuickBooksApiClient,
    private readonly config: ConfigService,
  ) {
    // QB item ID for SalesItemLineDetail — configurable, defaults to '1' (QB's built-in Services item)
    this.defaultServiceItemId = this.config.get<string>('QUICKBOOKS_DEFAULT_SERVICE_ITEM_ID', '1');
  }

  // ---------------------------------------------------------------------------
  // Fetch entities
  // ---------------------------------------------------------------------------

  async fetchCustomers(accessToken: string, realmId: string): Promise<ExternalCustomer[]> {
    const raw = (await this.client.fetchAllCustomers(accessToken, realmId)) as Array<{
      Id: string;
      DisplayName: string;
      PrimaryEmailAddr?: { Address: string };
      PrimaryPhone?: { FreeFormNumber: string };
    }>;

    return raw.map((c) => ({
      id: c.Id,
      displayName: c.DisplayName,
      email: c.PrimaryEmailAddr?.Address,
      phone: c.PrimaryPhone?.FreeFormNumber,
    }));
  }

  async fetchVendors(accessToken: string, realmId: string): Promise<ExternalVendor[]> {
    const raw = (await this.client.fetchAllVendors(accessToken, realmId)) as Array<{
      Id: string;
      DisplayName: string;
      PrimaryEmailAddr?: { Address: string };
      PrimaryPhone?: { FreeFormNumber: string };
    }>;

    return raw.map((v) => ({
      id: v.Id,
      displayName: v.DisplayName,
      email: v.PrimaryEmailAddr?.Address,
      phone: v.PrimaryPhone?.FreeFormNumber,
    }));
  }

  async fetchClasses(accessToken: string, realmId: string): Promise<ExternalClass[]> {
    const raw = (await this.client.fetchAllClasses(accessToken, realmId)) as Array<{
      Id: string;
      Name: string;
      ParentRef?: { value: string };
    }>;

    return raw.map((c) => ({
      id: c.Id,
      name: c.Name,
      parentId: c.ParentRef?.value,
    }));
  }

  async fetchAccounts(accessToken: string, realmId: string): Promise<ExternalAccount[]> {
    const raw = (await this.client.fetchAllAccounts(accessToken, realmId)) as Array<{
      Id: string;
      Name: string;
      AccountType: string;
      Classification: string;
    }>;

    return raw.map((a) => ({
      id: a.Id,
      name: a.Name,
      accountType: a.AccountType,
      classification: a.Classification,
    }));
  }

  // ---------------------------------------------------------------------------
  // Create entities
  // ---------------------------------------------------------------------------

  async createCustomer(accessToken: string, realmId: string, name: string, email?: string): Promise<ExternalCustomer> {
    const body: Record<string, unknown> = { DisplayName: name };
    if (email) body.PrimaryEmailAddr = { Address: email };

    const res = (await this.client.createCustomer(accessToken, realmId, body)) as {
      Customer: {
        Id: string;
        DisplayName: string;
        PrimaryEmailAddr?: { Address: string };
      };
    };

    return {
      id: res.Customer.Id,
      displayName: res.Customer.DisplayName,
      email: res.Customer.PrimaryEmailAddr?.Address,
    };
  }

  async createVendor(accessToken: string, realmId: string, name: string, email?: string): Promise<ExternalVendor> {
    const body: Record<string, unknown> = { DisplayName: name };
    if (email) body.PrimaryEmailAddr = { Address: email };

    const res = (await this.client.createVendor(accessToken, realmId, body)) as {
      Vendor: {
        Id: string;
        DisplayName: string;
        PrimaryEmailAddr?: { Address: string };
      };
    };

    return {
      id: res.Vendor.Id,
      displayName: res.Vendor.DisplayName,
      email: res.Vendor.PrimaryEmailAddr?.Address,
    };
  }

  async createClass(accessToken: string, realmId: string, name: string): Promise<ExternalClass> {
    const res = (await this.client.createClass(accessToken, realmId, {
      Name: name,
    })) as {
      Class: { Id: string; Name: string };
    };

    return { id: res.Class.Id, name: res.Class.Name };
  }

  async createAccount(
    accessToken: string,
    realmId: string,
    name: string,
    accountType: string,
    classification: string,
  ): Promise<ExternalAccount> {
    const res = (await this.client.createAccount(accessToken, realmId, {
      Name: name,
      AccountType: accountType,
      Classification: classification,
    })) as {
      Account: {
        Id: string;
        Name: string;
        AccountType: string;
        Classification: string;
      };
    };

    return {
      id: res.Account.Id,
      name: res.Account.Name,
      accountType: res.Account.AccountType,
      classification: res.Account.Classification,
    };
  }

  // ---------------------------------------------------------------------------
  // Sync: Invoice → QB Invoice
  // ---------------------------------------------------------------------------

  async syncInvoice(accessToken: string, realmId: string, payload: InvoiceSyncPayload): Promise<SyncResult> {
    try {
      const lines = payload.lineItems.map((item, idx) => ({
        Id: String(idx + 1),
        LineNum: idx + 1,
        Description: item.description,
        Amount: item.amount,
        DetailType: 'SalesItemLineDetail',
        SalesItemLineDetail: {
          ItemRef: { value: this.defaultServiceItemId, name: 'Services' },
          UnitPrice: item.amount,
          Qty: 1,
        },
      }));

      const invoiceBody: Record<string, unknown> = {
        DocNumber: payload.invoiceNumber,
        TxnDate: payload.issueDate,
        DueDate: payload.dueDate,
        CustomerRef: { value: payload.customerExternalId },
        Line: lines,
        CustomerMemo: { value: `SALLY Invoice ${payload.invoiceNumber}` },
      };

      if (payload.classExternalId) {
        invoiceBody.ClassRef = { value: payload.classExternalId };
      }

      let res: { Invoice: { Id: string; SyncToken: string } };

      if (payload.existingExternalId) {
        // UPDATE: QB requires SyncToken for optimistic concurrency
        invoiceBody.Id = payload.existingExternalId;
        invoiceBody.SyncToken = payload.existingSyncToken ?? '0';
        invoiceBody.sparse = true;
        res = (await this.client.updateInvoice(accessToken, realmId, invoiceBody)) as typeof res;
      } else {
        res = (await this.client.createInvoice(accessToken, realmId, invoiceBody)) as typeof res;
      }

      return {
        success: true,
        externalId: res.Invoice.Id,
        syncToken: res.Invoice.SyncToken,
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // ---------------------------------------------------------------------------
  // Sync: Settlement → QB Bill
  // ---------------------------------------------------------------------------

  async syncBill(accessToken: string, realmId: string, payload: SettlementSyncPayload): Promise<SyncResult> {
    try {
      const lines: unknown[] = [];
      let lineNum = 1;

      // Settlement line items (driver pay)
      for (const item of payload.lineItems) {
        const accountRef: Record<string, string> = {};
        if (item.accountRef.id) accountRef.value = item.accountRef.id;
        if (item.accountRef.name) accountRef.name = item.accountRef.name;

        const line: Record<string, unknown> = {
          Id: String(lineNum),
          LineNum: lineNum++,
          Description: item.description,
          Amount: item.amount,
          DetailType: 'AccountBasedExpenseLineDetail',
          AccountBasedExpenseLineDetail: {
            AccountRef: accountRef,
            BillableStatus: 'NotBillable',
          },
        };

        if (item.truckNumber) {
          (line.AccountBasedExpenseLineDetail as Record<string, unknown>).ClassRef = { value: item.truckNumber };
        }

        lines.push(line);
      }

      // Deductions reduce driver pay — must be negative amounts in QB
      for (const deduction of payload.deductions) {
        const accountRef: Record<string, string> = {};
        if (deduction.accountRef.id) accountRef.value = deduction.accountRef.id;
        if (deduction.accountRef.name) accountRef.name = deduction.accountRef.name;

        lines.push({
          Id: String(lineNum),
          LineNum: lineNum++,
          Description: deduction.description,
          Amount: -Math.abs(deduction.amount),
          DetailType: 'AccountBasedExpenseLineDetail',
          AccountBasedExpenseLineDetail: {
            AccountRef: accountRef,
            BillableStatus: 'NotBillable',
          },
        });
      }

      const billBody: Record<string, unknown> = {
        DocNumber: payload.settlementNumber,
        TxnDate: payload.periodEnd,
        VendorRef: { value: payload.vendorExternalId },
        Line: lines,
        PrivateNote: `SALLY Settlement ${payload.settlementNumber}`,
      };

      let res: { Bill: { Id: string; SyncToken: string } };

      if (payload.existingExternalId) {
        billBody.Id = payload.existingExternalId;
        billBody.SyncToken = payload.existingSyncToken ?? '0';
        billBody.sparse = true;
        res = (await this.client.updateBill(accessToken, realmId, billBody)) as typeof res;
      } else {
        res = (await this.client.createBill(accessToken, realmId, billBody)) as typeof res;
      }

      return {
        success: true,
        externalId: res.Bill.Id,
        syncToken: res.Bill.SyncToken,
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // ---------------------------------------------------------------------------
  // Sync: Payment → QB Payment
  // ---------------------------------------------------------------------------

  async syncPayment(accessToken: string, realmId: string, payload: PaymentSyncPayload): Promise<SyncResult> {
    try {
      const paymentBody: Record<string, unknown> = {
        TotalAmt: payload.amount,
        TxnDate: payload.paymentDate,
        CustomerRef: { value: payload.customerExternalId },
        Line: [
          {
            Amount: payload.amount,
            LinkedTxn: [
              {
                TxnId: payload.linkedInvoiceExternalId,
                TxnType: 'Invoice',
              },
            ],
          },
        ],
      };

      if (payload.paymentMethod) {
        paymentBody.PaymentMethodRef = { name: payload.paymentMethod };
      }

      const res = (await this.client.createPayment(accessToken, realmId, paymentBody)) as {
        Payment: { Id: string; SyncToken: string };
      };

      return {
        success: true,
        externalId: res.Payment.Id,
        syncToken: res.Payment.SyncToken,
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // ---------------------------------------------------------------------------
  // Sync: Settlement Payment → QB Bill Payment
  // ---------------------------------------------------------------------------

  async syncBillPayment(
    accessToken: string,
    realmId: string,
    amount: number,
    billExternalId: string,
    vendorExternalId: string,
    paymentDate: string,
  ): Promise<SyncResult> {
    try {
      const billPaymentBody = {
        TotalAmt: amount,
        TxnDate: paymentDate,
        PayType: 'Check',
        VendorRef: { value: vendorExternalId },
        Line: [
          {
            Amount: amount,
            LinkedTxn: [
              {
                TxnId: billExternalId,
                TxnType: 'Bill',
              },
            ],
          },
        ],
      };

      const res = (await this.client.createBillPayment(accessToken, realmId, billPaymentBody)) as {
        BillPayment: { Id: string; SyncToken: string };
      };

      return {
        success: true,
        externalId: res.BillPayment.Id,
        syncToken: res.BillPayment.SyncToken,
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // ---------------------------------------------------------------------------
  // Fetch single entities (for webhook processing)
  // ---------------------------------------------------------------------------

  async fetchInvoice(accessToken: string, realmId: string, invoiceId: string): Promise<ExternalInvoice | null> {
    try {
      const res = (await this.client.fetchInvoice(accessToken, realmId, invoiceId)) as {
        Invoice: {
          Id: string;
          DocNumber: string;
          SyncToken: string;
          Balance: number;
          TotalAmt: number;
        };
      };

      return {
        id: res.Invoice.Id,
        docNumber: res.Invoice.DocNumber,
        syncToken: res.Invoice.SyncToken,
        balance: res.Invoice.Balance,
        totalAmt: res.Invoice.TotalAmt,
      };
    } catch {
      return null;
    }
  }

  async fetchBill(accessToken: string, realmId: string, billId: string): Promise<ExternalBill | null> {
    try {
      const res = (await this.client.fetchBill(accessToken, realmId, billId)) as {
        Bill: {
          Id: string;
          DocNumber: string;
          SyncToken: string;
          Balance: number;
          TotalAmt: number;
        };
      };

      return {
        id: res.Bill.Id,
        docNumber: res.Bill.DocNumber,
        syncToken: res.Bill.SyncToken,
        balance: res.Bill.Balance,
        totalAmt: res.Bill.TotalAmt,
      };
    } catch {
      return null;
    }
  }

  async fetchPaymentDetail(
    accessToken: string,
    realmId: string,
    paymentId: string,
  ): Promise<{
    invoiceIds: string[];
    amount: number;
    paymentDate: string;
  } | null> {
    try {
      const res = (await this.client.fetchPayment(accessToken, realmId, paymentId)) as {
        Payment: {
          TotalAmt: number;
          TxnDate: string;
          Line?: Array<{
            LinkedTxn?: Array<{ TxnId: string; TxnType: string }>;
          }>;
        };
      };

      const payment = res.Payment;
      const invoiceIds = (payment.Line || [])
        .flatMap((l) => l.LinkedTxn || [])
        .filter((t) => t.TxnType === 'Invoice')
        .map((t) => t.TxnId);

      return {
        invoiceIds,
        amount: payment.TotalAmt,
        paymentDate: payment.TxnDate,
      };
    } catch {
      return null;
    }
  }

  async fetchBillPaymentDetail(
    accessToken: string,
    realmId: string,
    billPaymentId: string,
  ): Promise<{
    billIds: string[];
    amount: number;
    paymentDate: string;
  } | null> {
    try {
      const res = (await this.client.fetchBillPayment(accessToken, realmId, billPaymentId)) as {
        BillPayment: {
          TotalAmt: number;
          TxnDate: string;
          Line?: Array<{
            LinkedTxn?: Array<{ TxnId: string; TxnType: string }>;
          }>;
        };
      };

      const payment = res.BillPayment;
      const billIds = (payment.Line || [])
        .flatMap((l) => l.LinkedTxn || [])
        .filter((t) => t.TxnType === 'Bill')
        .map((t) => t.TxnId);

      return {
        billIds,
        amount: payment.TotalAmt,
        paymentDate: payment.TxnDate,
      };
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Webhook
  // ---------------------------------------------------------------------------

  /**
   * Validates QB webhook HMAC-SHA256 signature.
   *
   * QB signs payloads with HMAC-SHA256 using the webhook verifier token.
   * The signature is Base64-encoded and sent in the Intuit-Signature header.
   */
  validateWebhookSignature(payload: string, signature: string, verifierToken: string): boolean {
    try {
      const expected = crypto.createHmac('sha256', verifierToken).update(payload).digest('base64');
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
      return false;
    }
  }

  /**
   * Parses QB webhook CDC (Change Data Capture) events.
   *
   * QB sends a batch of entity change notifications. We extract Payment
   * and BillPayment events for processing.
   */
  parseWebhookEvents(payload: unknown): WebhookEvent[] {
    const events: WebhookEvent[] = [];

    const p = payload as {
      eventNotifications?: Array<{
        realmId: string;
        dataChangeEvent?: {
          entities?: Array<{
            name: string;
            id: string;
            operation: string;
            lastUpdated: string;
          }>;
        };
      }>;
    };

    for (const notification of p.eventNotifications ?? []) {
      const realmId = notification.realmId;
      for (const entity of notification.dataChangeEvent?.entities ?? []) {
        events.push({
          eventType: entity.name,
          operation: entity.operation,
          entityId: entity.id,
          realmId,
        });
      }
    }

    return events;
  }
}
