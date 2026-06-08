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
} from './accounting.types';

/**
 * Generic interface for accounting system adapters.
 *
 * Follows the same pattern as IELDAdapter and ITMSAdapter.
 * Each accounting vendor (QuickBooks, Xero, FreshBooks) implements this.
 *
 * The adapter is stateless — all credentials are passed per-call.
 * The AccountingSyncService handles credential retrieval and token refresh.
 */
export interface IAccountingAdapter {
  // --- Read: Pull entities from accounting system ---
  fetchCustomers(accessToken: string, realmId: string): Promise<ExternalCustomer[]>;
  fetchVendors(accessToken: string, realmId: string): Promise<ExternalVendor[]>;
  fetchClasses(accessToken: string, realmId: string): Promise<ExternalClass[]>;
  fetchAccounts(accessToken: string, realmId: string): Promise<ExternalAccount[]>;

  // --- Write: Create entities in accounting system ---
  createCustomer(accessToken: string, realmId: string, name: string, email?: string): Promise<ExternalCustomer>;
  createVendor(accessToken: string, realmId: string, name: string, email?: string): Promise<ExternalVendor>;
  createClass(accessToken: string, realmId: string, name: string): Promise<ExternalClass>;
  createAccount(
    accessToken: string,
    realmId: string,
    name: string,
    accountType: string,
    classification: string,
  ): Promise<ExternalAccount>;

  // --- Sync: Push financial records ---
  syncInvoice(accessToken: string, realmId: string, payload: InvoiceSyncPayload): Promise<SyncResult>;
  syncBill(accessToken: string, realmId: string, payload: SettlementSyncPayload): Promise<SyncResult>;
  syncPayment(accessToken: string, realmId: string, payload: PaymentSyncPayload): Promise<SyncResult>;
  syncBillPayment(
    accessToken: string,
    realmId: string,
    amount: number,
    billExternalId: string,
    vendorExternalId: string,
    paymentDate: string,
  ): Promise<SyncResult>;

  // --- Read single entity (for webhook processing) ---
  fetchInvoice(accessToken: string, realmId: string, invoiceId: string): Promise<ExternalInvoice | null>;
  fetchBill(accessToken: string, realmId: string, billId: string): Promise<ExternalBill | null>;
  fetchPaymentDetail(
    accessToken: string,
    realmId: string,
    paymentId: string,
  ): Promise<{
    invoiceIds: string[];
    amount: number;
    paymentDate: string;
  } | null>;
  fetchBillPaymentDetail(
    accessToken: string,
    realmId: string,
    billPaymentId: string,
  ): Promise<{ billIds: string[]; amount: number; paymentDate: string } | null>;

  // --- Webhook ---
  validateWebhookSignature(payload: string, signature: string, verifierToken: string): boolean;
  parseWebhookEvents(payload: unknown): WebhookEvent[];
}
