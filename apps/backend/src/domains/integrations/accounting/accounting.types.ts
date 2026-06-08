export interface ExternalCustomer {
  id: string;
  displayName: string;
  email?: string;
  phone?: string;
}

export interface ExternalVendor {
  id: string;
  displayName: string;
  email?: string;
  phone?: string;
}

export interface ExternalClass {
  id: string;
  name: string;
  parentId?: string;
}

export interface ExternalAccount {
  id: string;
  name: string;
  accountType: string; // Income, Expense, etc.
  classification: string; // Revenue, Expense, Asset, Liability, Equity
}

export interface ExternalInvoice {
  id: string;
  docNumber: string;
  syncToken: string;
  balance: number;
  totalAmt: number;
}

export interface ExternalBill {
  id: string;
  docNumber: string;
  syncToken: string;
  balance: number;
  totalAmt: number;
}

export interface ExternalPayment {
  id: string;
  totalAmt: number;
  invoiceId?: string;
  paymentDate: string;
}

export interface ExternalBillPayment {
  id: string;
  totalAmt: number;
  billId?: string;
  paymentDate: string;
}

export interface SyncResult {
  success: boolean;
  externalId?: string;
  syncToken?: string;
  error?: string;
}

export interface WebhookEvent {
  eventType: string; // e.g., 'Payment', 'BillPayment'
  operation: string; // 'Create', 'Update', 'Delete'
  entityId: string;
  realmId: string;
}

export interface AccountRef {
  id?: string; // QB Account ID (required for AccountRef.value)
  name: string; // QB Account display name (fallback for AccountRef.name)
}

export interface InvoiceLineItemPayload {
  description: string;
  amount: number; // dollars, not cents
  accountRef: AccountRef;
  type: string;
}

export interface InvoiceSyncPayload {
  invoiceNumber: string;
  customerExternalId: string; // QB Customer ID from entity mapping
  customerEmail?: string;
  issueDate: string;
  dueDate: string;
  lineItems: InvoiceLineItemPayload[];
  classExternalId?: string; // QB Class ID (truck/vehicle) from entity mapping
  existingExternalId?: string; // for updates
  existingSyncToken?: string;
}

export interface SettlementLineItemPayload {
  description: string;
  amount: number; // dollars
  accountRef: AccountRef;
  truckNumber?: string;
}

export interface SettlementDeductionPayload {
  description: string;
  amount: number; // positive dollars (will be negated in QB)
  accountRef: AccountRef;
  type: string;
}

export interface SettlementSyncPayload {
  settlementNumber: string;
  vendorExternalId: string; // QB Vendor ID (driver) from entity mapping
  driverEmail?: string;
  periodEnd: string;
  lineItems: SettlementLineItemPayload[];
  deductions: SettlementDeductionPayload[];
  existingExternalId?: string;
  existingSyncToken?: string;
}

export interface PaymentSyncPayload {
  amount: number; // dollars
  paymentDate: string;
  paymentMethod?: string;
  referenceNumber?: string;
  linkedInvoiceExternalId: string;
  customerExternalId: string;
}
