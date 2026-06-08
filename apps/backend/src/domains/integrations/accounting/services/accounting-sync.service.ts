import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { IAccountingAdapter } from '../accounting-adapter.interface';
import { QuickBooksAdapter } from '../vendors/quickbooks/quickbooks.adapter';
import { AccountingMappingService } from './accounting-mapping.service';
import { AuthTokenService } from '../../oauth/auth-token.service';
import {
  InvoiceSyncPayload,
  SettlementSyncPayload,
  SettlementLineItemPayload,
  SettlementDeductionPayload,
  PaymentSyncPayload,
  InvoiceLineItemPayload,
} from '../accounting.types';
import { AccountingSyncResult } from '../accounting-job.types';

// ---------------------------------------------------------------------------
// Account name helpers
// ---------------------------------------------------------------------------

const INVOICE_ACCOUNT_NAMES: Record<string, string> = {
  LINEHAUL: 'Linehaul Revenue',
  FUEL_SURCHARGE: 'Fuel Surcharge Revenue',
  DETENTION_PICKUP: 'Detention Revenue',
  DETENTION_DELIVERY: 'Detention Revenue',
  LAYOVER: 'Layover Revenue',
  LUMPER: 'Lumper Revenue',
  TONU: 'TONU Revenue',
  ACCESSORIAL: 'Accessorial Revenue',
  ADJUSTMENT: 'Adjustments',
};

const DEDUCTION_ACCOUNT_NAMES: Record<string, string> = {
  FUEL_ADVANCE: 'Fuel Advance Expense',
  CASH_ADVANCE: 'Cash Advance Expense',
  INSURANCE: 'Insurance Deduction',
  EQUIPMENT_LEASE: 'Equipment Lease Expense',
  ESCROW: 'Escrow Expense',
  OTHER: 'Other Deductions',
};

/**
 * AccountingSyncService
 *
 * Core orchestration service for the QuickBooks integration.
 * Handles token management, entity mapping, and syncing financial records
 * (invoices, settlements, payments) to the external accounting system.
 */
@Injectable()
export class AccountingSyncService {
  private readonly logger = new Logger(AccountingSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mappingService: AccountingMappingService,
    private readonly quickbooksAdapter: QuickBooksAdapter,
    private readonly authTokenService: AuthTokenService,
  ) {}

  // ---------------------------------------------------------------------------
  // Credentials & Token Management
  // ---------------------------------------------------------------------------

  /**
   * Gets adapter, active access token, realmId, and integrationId for a tenant.
   * Token refresh is handled automatically by AuthTokenService.getActiveToken().
   */
  async getAdapterAndToken(tenantId: number): Promise<{
    adapter: IAccountingAdapter;
    accessToken: string;
    realmId: string;
    integrationId: string;
  }> {
    const config = await this.prisma.integrationConfig.findFirst({
      where: {
        tenantId,
        integrationType: 'ACCOUNTING',
        isEnabled: true,
        status: { in: ['ACTIVE', 'CONFIGURED'] },
      },
    });

    if (!config) {
      throw new NotFoundException(`No active ACCOUNTING integration found for tenant ${tenantId}`);
    }

    if (!config.credentials) {
      throw new BadRequestException('QuickBooks integration credentials are not configured');
    }

    const accessToken = await this.authTokenService.getActiveToken({
      id: config.id,
      vendor: config.vendor,
      credentials: config.credentials,
    });

    // Get realmId from credentials or DB
    const creds = this.authTokenService.decryptCredentials(config.credentials);
    const realmId = creds.realmId ?? creds.realm_id ?? config.realmId ?? '';

    const adapter: IAccountingAdapter = this.quickbooksAdapter;

    return {
      adapter,
      accessToken,
      realmId,
      integrationId: config.integrationId,
    };
  }

  // ---------------------------------------------------------------------------
  // Entity Mapping Helpers
  // ---------------------------------------------------------------------------

  async ensureCustomerMapped(
    tenantId: number,
    customerId: string,
    adapter: IAccountingAdapter,
    accessToken: string,
    realmId: string,
    integrationId: string,
  ): Promise<string> {
    const existing = await this.mappingService.getEntityMapping(tenantId, integrationId, 'customer', customerId);
    if (existing) return existing.externalId;

    const customer = await this.prisma.customer.findFirst({
      where: { customerId, tenantId },
      include: {
        contacts: {
          where: { isPrimary: true, status: 'ACTIVE' },
          take: 1,
        },
      },
    });
    if (!customer) throw new NotFoundException(`Customer ${customerId} not found`);

    const primaryContact = customer.contacts?.[0];
    const external = await adapter.createCustomer(
      accessToken,
      realmId,
      customer.companyName,
      primaryContact?.email ?? undefined,
    );

    await this.mappingService.createEntityMapping(
      tenantId,
      integrationId,
      'customer',
      customerId,
      external.id,
      external.displayName,
      1.0,
    );

    return external.id;
  }

  async ensureVendorMapped(
    tenantId: number,
    driverId: string,
    adapter: IAccountingAdapter,
    accessToken: string,
    realmId: string,
    integrationId: string,
  ): Promise<string> {
    const existing = await this.mappingService.getEntityMapping(tenantId, integrationId, 'vendor', driverId);
    if (existing) return existing.externalId;

    const driver = await this.prisma.driver.findFirst({
      where: { driverId, tenantId },
    });
    if (!driver) throw new NotFoundException(`Driver ${driverId} not found`);

    const external = await adapter.createVendor(accessToken, realmId, driver.name, driver.email ?? undefined);

    await this.mappingService.createEntityMapping(
      tenantId,
      integrationId,
      'vendor',
      driverId,
      external.id,
      external.displayName,
      1.0,
    );

    return external.id;
  }

  async ensureClassMapped(
    tenantId: number,
    vehicleId: string,
    adapter: IAccountingAdapter,
    accessToken: string,
    realmId: string,
    integrationId: string,
  ): Promise<string | undefined> {
    if (!vehicleId) return undefined;

    const existing = await this.mappingService.getEntityMapping(tenantId, integrationId, 'class', vehicleId);
    if (existing) return existing.externalId;

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { vehicleId, tenantId },
    });
    if (!vehicle) return undefined;

    const external = await adapter.createClass(accessToken, realmId, vehicle.unitNumber);

    await this.mappingService.createEntityMapping(
      tenantId,
      integrationId,
      'class',
      vehicleId,
      external.id,
      external.name,
      1.0,
    );

    return external.id;
  }

  /**
   * Get account reference (ID + name) for a line item type.
   * Returns both so the adapter can set AccountRef.value (ID) and AccountRef.name.
   * If no mapping exists, returns name-only (adapter will use name-based lookup).
   */
  private async getAccountRef(
    tenantId: number,
    integrationId: string,
    sallyItemType: string,
    direction: 'INCOME' | 'EXPENSE',
    defaultNames: Record<string, string>,
    defaultFallback: string,
  ): Promise<{ id?: string; name: string }> {
    const mapping = await this.mappingService.getAccountMapping(tenantId, integrationId, sallyItemType, direction);
    if (mapping) {
      return {
        id: mapping.externalAccountId,
        name: mapping.externalAccountName,
      };
    }

    return { name: defaultNames[sallyItemType] ?? defaultFallback };
  }

  // ---------------------------------------------------------------------------
  // syncInvoice
  // ---------------------------------------------------------------------------

  async syncInvoice(tenantId: number, invoiceNumber: string): Promise<AccountingSyncResult> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { invoiceNumber, tenantId },
      include: {
        customer: {
          include: {
            contacts: {
              where: { isPrimary: true, status: 'ACTIVE' },
              take: 1,
            },
          },
        },
        lineItems: true,
        load: { include: { vehicle: true } },
      },
    });

    if (!invoice) throw new NotFoundException(`Invoice ${invoiceNumber} not found`);

    const {
      adapter,
      accessToken: access_token,
      realmId: realm_id,
      integrationId,
    } = await this.getAdapterAndToken(tenantId);

    // Ensure customer mapped
    await this.ensureCustomerMapped(
      tenantId,
      invoice.customer.customerId,
      adapter,
      access_token,
      realm_id,
      integrationId,
    );
    const customerMapping = await this.mappingService.getEntityMapping(
      tenantId,
      integrationId,
      'customer',
      invoice.customer.customerId,
    );

    // Ensure truck class mapped (optional)
    let truckExternalId: string | undefined;
    if (invoice.load?.vehicle) {
      truckExternalId = await this.ensureClassMapped(
        tenantId,
        invoice.load.vehicle.vehicleId,
        adapter,
        access_token,
        realm_id,
        integrationId,
      );
    }

    // Build line items
    const lineItems: InvoiceLineItemPayload[] = await Promise.all(
      invoice.lineItems.map(async (item) => ({
        description: item.description,
        amount: item.totalCents / 100,
        accountRef: await this.getAccountRef(
          tenantId,
          integrationId,
          item.type,
          'INCOME',
          INVOICE_ACCOUNT_NAMES,
          'Revenue',
        ),
        type: item.type,
      })),
    );

    const payload: InvoiceSyncPayload = {
      invoiceNumber: invoice.invoiceNumber,
      customerExternalId: customerMapping?.externalId ?? invoice.customer.companyName,
      customerEmail: invoice.customer.contacts?.[0]?.email ?? undefined,
      issueDate: invoice.issueDate.toISOString().split('T')[0],
      dueDate: invoice.dueDate.toISOString().split('T')[0],
      lineItems,
      classExternalId: truckExternalId,
      existingExternalId: invoice.externalInvoiceId ?? undefined,
      existingSyncToken: invoice.externalSyncVersion ?? undefined,
    };

    const result = await adapter.syncInvoice(access_token, realm_id, payload);

    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        externalInvoiceId: result.externalId ?? invoice.externalInvoiceId,
        externalSyncVersion: result.success ? (result.syncToken ?? null) : invoice.externalSyncVersion,
        externalSyncedAt: result.success ? new Date() : invoice.externalSyncedAt,
        externalSyncError: result.success ? null : (result.error ?? 'Unknown error'),
      },
    });

    this.logger.log(
      `Invoice ${invoiceNumber} sync ${result.success ? 'completed' : 'failed'}: ${result.externalId ?? result.error}`,
    );

    return {
      success: result.success,
      externalId: result.externalId,
      error: result.error,
    };
  }

  // ---------------------------------------------------------------------------
  // syncSettlement
  // ---------------------------------------------------------------------------

  async syncSettlement(tenantId: number, settlementId: string): Promise<AccountingSyncResult> {
    const settlement = await this.prisma.settlement.findFirst({
      where: { settlementId, tenantId },
      include: {
        driver: true,
        lineItems: true,
        deductions: true,
      },
    });

    if (!settlement) throw new NotFoundException(`Settlement ${settlementId} not found`);

    const {
      adapter,
      accessToken: access_token,
      realmId: realm_id,
      integrationId,
    } = await this.getAdapterAndToken(tenantId);

    // Ensure driver (vendor) mapped
    await this.ensureVendorMapped(tenantId, settlement.driver.driverId, adapter, access_token, realm_id, integrationId);
    const vendorMapping = await this.mappingService.getEntityMapping(
      tenantId,
      integrationId,
      'vendor',
      settlement.driver.driverId,
    );

    // Build line items (driver pay)
    const lineItems: SettlementLineItemPayload[] = await Promise.all(
      settlement.lineItems.map(async (item) => ({
        description: item.description,
        amount: item.payAmountCents / 100,
        accountRef: await this.getAccountRef(
          tenantId,
          integrationId,
          'DRIVER_PAY',
          'EXPENSE',
          {},
          'Driver Pay Expense',
        ),
      })),
    );

    // Build deductions
    const deductions: SettlementDeductionPayload[] = await Promise.all(
      settlement.deductions.map(async (ded) => ({
        description: ded.description,
        amount: ded.amountCents / 100,
        accountRef: await this.getAccountRef(
          tenantId,
          integrationId,
          ded.type,
          'EXPENSE',
          DEDUCTION_ACCOUNT_NAMES,
          'Other Deductions',
        ),
        type: ded.type,
      })),
    );

    const payload: SettlementSyncPayload = {
      settlementNumber: settlement.settlementNumber,
      vendorExternalId: vendorMapping?.externalId ?? settlement.driver.name,
      driverEmail: settlement.driver.email ?? undefined,
      periodEnd: settlement.periodEnd.toISOString().split('T')[0],
      lineItems,
      deductions,
      existingExternalId: settlement.externalBillId ?? undefined,
      existingSyncToken: settlement.externalSyncVersion ?? undefined,
    };

    const result = await adapter.syncBill(access_token, realm_id, payload);

    await this.prisma.settlement.update({
      where: { id: settlement.id },
      data: {
        externalBillId: result.externalId ?? settlement.externalBillId,
        externalSyncVersion: result.success ? (result.syncToken ?? null) : settlement.externalSyncVersion,
        externalSyncedAt: result.success ? new Date() : settlement.externalSyncedAt,
        externalSyncError: result.success ? null : (result.error ?? 'Unknown error'),
      },
    });

    this.logger.log(
      `Settlement ${settlementId} sync ${result.success ? 'completed' : 'failed'}: ${result.externalId ?? result.error}`,
    );

    return {
      success: result.success,
      externalId: result.externalId,
      error: result.error,
    };
  }

  // ---------------------------------------------------------------------------
  // syncPayment
  // ---------------------------------------------------------------------------

  async syncPayment(tenantId: number, paymentId: string): Promise<AccountingSyncResult> {
    const payment = await this.prisma.payment.findFirst({
      where: { paymentId, tenantId },
      include: {
        invoice: {
          include: { customer: true },
        },
      },
    });

    if (!payment) throw new NotFoundException(`Payment ${paymentId} not found`);
    if (!payment.invoice.externalInvoiceId) {
      throw new BadRequestException('This invoice has not been synced to QuickBooks yet');
    }

    const {
      adapter,
      accessToken: access_token,
      realmId: realm_id,
      integrationId,
    } = await this.getAdapterAndToken(tenantId);

    // Ensure customer mapped
    await this.ensureCustomerMapped(
      tenantId,
      payment.invoice.customer.customerId,
      adapter,
      access_token,
      realm_id,
      integrationId,
    );
    const customerMapping = await this.mappingService.getEntityMapping(
      tenantId,
      integrationId,
      'customer',
      payment.invoice.customer.customerId,
    );

    const payload: PaymentSyncPayload = {
      amount: payment.amountCents / 100,
      paymentDate: payment.paymentDate.toISOString().split('T')[0],
      paymentMethod: payment.paymentMethod ?? undefined,
      referenceNumber: payment.referenceNumber ?? undefined,
      linkedInvoiceExternalId: payment.invoice.externalInvoiceId,
      customerExternalId: customerMapping?.externalId ?? payment.invoice.customer.companyName,
    };

    const result = await adapter.syncPayment(access_token, realm_id, payload);

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        externalPaymentId: result.externalId ?? payment.externalPaymentId,
        externalSyncedAt: result.success ? new Date() : payment.externalSyncedAt,
      },
    });

    this.logger.log(
      `Payment ${paymentId} sync ${result.success ? 'completed' : 'failed'}: ${result.externalId ?? result.error}`,
    );

    return {
      success: result.success,
      externalId: result.externalId,
      error: result.error,
    };
  }

  // ---------------------------------------------------------------------------
  // syncSettlementPayment
  // ---------------------------------------------------------------------------

  async syncSettlementPayment(tenantId: number, settlementId: string): Promise<AccountingSyncResult> {
    const settlement = await this.prisma.settlement.findFirst({
      where: { settlementId, tenantId },
      include: { driver: true },
    });

    if (!settlement) throw new NotFoundException(`Settlement ${settlementId} not found`);
    if (!settlement.externalBillId) {
      throw new BadRequestException('This settlement has not been synced to QuickBooks yet');
    }

    const {
      adapter,
      accessToken: access_token,
      realmId: realm_id,
      integrationId,
    } = await this.getAdapterAndToken(tenantId);

    const vendorExternalId = await this.ensureVendorMapped(
      tenantId,
      settlement.driver.driverId,
      adapter,
      access_token,
      realm_id,
      integrationId,
    );

    const amount = settlement.netPayCents / 100;
    const paymentDate = (settlement.paidAt ?? new Date()).toISOString().split('T')[0];

    const result = await adapter.syncBillPayment(
      access_token,
      realm_id,
      amount,
      settlement.externalBillId,
      vendorExternalId,
      paymentDate,
    );

    if (result.success) {
      await this.prisma.settlement.update({
        where: { id: settlement.id },
        data: { externalSyncedAt: new Date() },
      });
    }

    this.logger.log(
      `Settlement payment ${settlementId} sync ${result.success ? 'completed' : 'failed'}: ${result.externalId ?? result.error}`,
    );

    return {
      success: result.success,
      externalId: result.externalId,
      error: result.error,
    };
  }

  // ---------------------------------------------------------------------------
  // runInitialSync
  // ---------------------------------------------------------------------------

  /**
   * Fetch entities from QB and run auto-match against SALLY data.
   * Called once on first connect or manual re-sync.
   */
  async runInitialSync(tenantId: number): Promise<AccountingSyncResult> {
    const {
      adapter,
      accessToken: access_token,
      realmId: realm_id,
      integrationId,
    } = await this.getAdapterAndToken(tenantId);

    const [customers, vendors, classes] = await Promise.all([
      adapter.fetchCustomers(access_token, realm_id),
      adapter.fetchVendors(access_token, realm_id),
      adapter.fetchClasses(access_token, realm_id),
    ]);

    // Cache QB entities in DB so frontend can populate dropdowns
    await Promise.all([
      this.mappingService.cacheExternalEntities(
        tenantId,
        integrationId,
        'customer',
        customers.map((c) => ({
          id: c.id,
          name: c.displayName,
          metadata: { email: c.email, phone: c.phone },
        })),
      ),
      this.mappingService.cacheExternalEntities(
        tenantId,
        integrationId,
        'vendor',
        vendors.map((v) => ({
          id: v.id,
          name: v.displayName,
          metadata: { email: v.email, phone: v.phone },
        })),
      ),
      this.mappingService.cacheExternalEntities(
        tenantId,
        integrationId,
        'class',
        classes.map((c) => ({
          id: c.id,
          name: c.name,
          metadata: { parentId: c.parentId },
        })),
      ),
    ]);

    // Auto-match SALLY entities to QB entities
    await Promise.all([
      this.mappingService.autoMatchCustomers(tenantId, integrationId, customers),
      this.mappingService.autoMatchVendors(tenantId, integrationId, vendors),
      this.mappingService.autoMatchClasses(tenantId, integrationId, classes),
    ]);

    // Update lastSyncAt on the integration config
    await this.prisma.integrationConfig.updateMany({
      where: { tenantId, integrationType: 'ACCOUNTING' },
      data: { lastSyncAt: new Date() },
    });

    // Count actually-saved mapping rows
    const [savedCustomers, savedVendors, savedClasses] = await Promise.all([
      this.prisma.integrationEntityMapping.count({
        where: { tenantId, integrationId, entityType: 'customer' },
      }),
      this.prisma.integrationEntityMapping.count({
        where: { tenantId, integrationId, entityType: 'vendor' },
      }),
      this.prisma.integrationEntityMapping.count({
        where: { tenantId, integrationId, entityType: 'class' },
      }),
    ]);

    this.logger.log(
      `Initial sync complete for tenant ${tenantId}: ${savedCustomers} customers, ${savedVendors} vendors, ${savedClasses} classes saved`,
    );

    return {
      success: true,
      details: {
        customersMatched: savedCustomers,
        vendorsMatched: savedVendors,
        classesMatched: savedClasses,
      },
    };
  }
}
