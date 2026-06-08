import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { IAccountingAdapter } from '../accounting-adapter.interface';
import { ExternalCustomer, ExternalVendor, ExternalClass } from '../accounting.types';

/**
 * AccountingMappingService
 *
 * Manages entity mappings between SALLY entities (customers, drivers, vehicles)
 * and their counterparts in external accounting systems (QB customers, vendors, classes).
 *
 * Uses generic integration_entity_mappings and integration_external_entities tables
 * so the same infrastructure can serve TMS, ELD, and future integrations.
 *
 * Also manages account mappings (SALLY line item types → QB chart of accounts).
 *
 * Entity types (lowercase strings): 'customer' | 'vendor' | 'class'
 * Sally entity types: 'customer' | 'driver' | 'vehicle'
 */
@Injectable()
export class AccountingMappingService {
  private readonly logger = new Logger(AccountingMappingService.name);

  // Default account definitions for trucking operations
  private readonly DEFAULT_ACCOUNTS = [
    {
      sallyItemType: 'LINEHAUL',
      direction: 'INCOME',
      name: 'Linehaul Revenue',
      accountType: 'Income',
      classification: 'Revenue',
    },
    {
      sallyItemType: 'FUEL_SURCHARGE',
      direction: 'INCOME',
      name: 'Fuel Surcharge Revenue',
      accountType: 'Income',
      classification: 'Revenue',
    },
    {
      sallyItemType: 'DETENTION_PICKUP',
      direction: 'INCOME',
      name: 'Detention Revenue',
      accountType: 'Income',
      classification: 'Revenue',
    },
    {
      sallyItemType: 'DETENTION_DELIVERY',
      direction: 'INCOME',
      name: 'Detention Revenue',
      accountType: 'Income',
      classification: 'Revenue',
    },
    {
      sallyItemType: 'LAYOVER',
      direction: 'INCOME',
      name: 'Layover Revenue',
      accountType: 'Income',
      classification: 'Revenue',
    },
    {
      sallyItemType: 'LUMPER',
      direction: 'INCOME',
      name: 'Lumper Revenue',
      accountType: 'Income',
      classification: 'Revenue',
    },
    {
      sallyItemType: 'TONU',
      direction: 'INCOME',
      name: 'TONU Revenue',
      accountType: 'Income',
      classification: 'Revenue',
    },
    {
      sallyItemType: 'ACCESSORIAL',
      direction: 'INCOME',
      name: 'Accessorial Revenue',
      accountType: 'Income',
      classification: 'Revenue',
    },
    {
      sallyItemType: 'ADJUSTMENT',
      direction: 'INCOME',
      name: 'Adjustments',
      accountType: 'Income',
      classification: 'Revenue',
    },
    {
      sallyItemType: 'DRIVER_PAY',
      direction: 'EXPENSE',
      name: 'Driver Pay Expense',
      accountType: 'Expense',
      classification: 'Expense',
    },
    {
      sallyItemType: 'FUEL_ADVANCE',
      direction: 'EXPENSE',
      name: 'Fuel Advance Expense',
      accountType: 'Expense',
      classification: 'Expense',
    },
    {
      sallyItemType: 'CASH_ADVANCE',
      direction: 'EXPENSE',
      name: 'Cash Advance Expense',
      accountType: 'Expense',
      classification: 'Expense',
    },
    {
      sallyItemType: 'INSURANCE',
      direction: 'EXPENSE',
      name: 'Insurance Deduction',
      accountType: 'Expense',
      classification: 'Expense',
    },
    {
      sallyItemType: 'EQUIPMENT_LEASE',
      direction: 'EXPENSE',
      name: 'Equipment Lease Expense',
      accountType: 'Expense',
      classification: 'Expense',
    },
    {
      sallyItemType: 'ESCROW',
      direction: 'EXPENSE',
      name: 'Escrow Expense',
      accountType: 'Expense',
      classification: 'Expense',
    },
    {
      sallyItemType: 'OTHER',
      direction: 'EXPENSE',
      name: 'Other Deductions',
      accountType: 'Expense',
      classification: 'Expense',
    },
  ];

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // External Entity Cache
  // ---------------------------------------------------------------------------

  async cacheExternalEntities(
    tenantId: number,
    integrationId: string,
    entityType: string,
    entities: Array<{ id: string; name: string }>,
  ) {
    for (const entity of entities) {
      await this.prisma.integrationExternalEntity.upsert({
        where: {
          integrationId_entityType_externalId: {
            integrationId,
            entityType,
            externalId: entity.id,
          },
        },
        create: {
          tenantId,
          integrationId,
          entityType,
          externalId: entity.id,
          externalName: entity.name,
        },
        update: {
          externalName: entity.name,
        },
      });
    }
  }

  async listExternalEntities(integrationId: string, entityType: string) {
    return this.prisma.integrationExternalEntity.findMany({
      where: { integrationId, entityType },
      orderBy: { externalName: 'asc' },
    });
  }

  // ---------------------------------------------------------------------------
  // Entity Mappings
  // ---------------------------------------------------------------------------

  async getEntityMapping(tenantId: number, integrationId: string, entityType: string, sallyEntityId: string) {
    return this.prisma.integrationEntityMapping.findFirst({
      where: { tenantId, integrationId, entityType, sallyEntityId },
    });
  }

  async createEntityMapping(
    tenantId: number,
    integrationId: string,
    entityType: string,
    sallyEntityId: string,
    externalId: string | null,
    externalName: string | null,
    matchConfidence?: number,
  ) {
    return this.prisma.integrationEntityMapping.upsert({
      where: {
        integrationId_entityType_sallyEntityId: {
          integrationId,
          entityType,
          sallyEntityId,
        },
      },
      create: {
        tenantId,
        integrationId,
        entityType,
        sallyEntityId,
        externalId: externalId || null,
        externalName: externalName || null,
        matchConfidence,
      },
      update: {
        externalId: externalId || null,
        externalName: externalName || null,
        matchConfidence,
      },
    });
  }

  async listEntityMappings(tenantId: number, integrationId: string, entityType: string) {
    const mappings = await this.prisma.integrationEntityMapping.findMany({
      where: { tenantId, integrationId, entityType },
      orderBy: { createdAt: 'desc' },
    });

    // Enrich with human-readable SALLY entity names
    const sallyEntityIds = mappings.map((m) => m.sallyEntityId);
    const nameMap = new Map<string, string>();

    if (entityType === 'customer') {
      const customers = await this.prisma.customer.findMany({
        where: { tenantId, customerId: { in: sallyEntityIds } },
        select: { customerId: true, companyName: true },
      });
      customers.forEach((c) => nameMap.set(c.customerId, c.companyName));
    } else if (entityType === 'vendor') {
      const drivers = await this.prisma.driver.findMany({
        where: { tenantId, driverId: { in: sallyEntityIds } },
        select: { driverId: true, name: true },
      });
      drivers.forEach((d) => nameMap.set(d.driverId, d.name));
    } else if (entityType === 'class') {
      const vehicles = await this.prisma.vehicle.findMany({
        where: { tenantId, vehicleId: { in: sallyEntityIds } },
        select: { vehicleId: true, unitNumber: true },
      });
      vehicles.forEach((v) => nameMap.set(v.vehicleId, v.unitNumber));
    }

    return mappings.map((m) => ({
      ...m,
      sallyEntityName: nameMap.get(m.sallyEntityId) ?? m.sallyEntityId,
    }));
  }

  async confirmMapping(id: number, tenantId: number) {
    return this.prisma.integrationEntityMapping.update({
      where: { id, tenantId },
      data: { confirmedAt: new Date() },
    });
  }

  async updateMapping(id: number, tenantId: number, externalId: string, externalName: string) {
    return this.prisma.integrationEntityMapping.update({
      where: { id, tenantId },
      data: { externalId, externalName },
    });
  }

  // ---------------------------------------------------------------------------
  // Auto-Match: Customers
  // ---------------------------------------------------------------------------

  async autoMatchCustomers(tenantId: number, integrationId: string, externalCustomers: ExternalCustomer[]) {
    const sallyCustomers = await this.prisma.customer.findMany({
      where: { tenantId },
      select: {
        id: true,
        customerId: true,
        companyName: true,
        contacts: {
          where: { isPrimary: true, status: 'ACTIVE' },
          select: { email: true },
          take: 1,
        },
      },
    });

    const candidates = externalCustomers.map((c) => ({
      id: c.id,
      name: c.displayName,
      email: c.email,
    }));

    await Promise.all(
      sallyCustomers.map(async (sally) => {
        const primaryEmail = sally.contacts?.[0]?.email ?? undefined;
        const { match, confidence } = this.findBestMatch(sally.companyName, primaryEmail, candidates);

        const hasMatch = match !== null && confidence >= 0.85;
        await this.createEntityMapping(
          tenantId,
          integrationId,
          'customer',
          sally.customerId,
          hasMatch ? match.id : null,
          hasMatch ? match.name : null,
          hasMatch ? confidence : undefined,
        );
        if (hasMatch) {
          this.logger.log(`Auto-matched customer ${sally.companyName} → ${match.name} (${confidence})`);
        }
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Auto-Match: Vendors (Drivers)
  // ---------------------------------------------------------------------------

  async autoMatchVendors(tenantId: number, integrationId: string, externalVendors: ExternalVendor[]) {
    const sallyDrivers = await this.prisma.driver.findMany({
      where: { tenantId },
      select: { id: true, driverId: true, name: true, email: true },
    });

    const candidates = externalVendors.map((v) => ({
      id: v.id,
      name: v.displayName,
      email: v.email,
    }));

    await Promise.all(
      sallyDrivers.map(async (sally) => {
        const { match, confidence } = this.findBestMatch(sally.name, sally.email ?? undefined, candidates);

        const hasMatch = match !== null && confidence >= 0.85;
        await this.createEntityMapping(
          tenantId,
          integrationId,
          'vendor',
          sally.driverId,
          hasMatch ? match.id : null,
          hasMatch ? match.name : null,
          hasMatch ? confidence : undefined,
        );
        if (hasMatch) {
          this.logger.log(`Auto-matched driver ${sally.name} → ${match.name} (${confidence})`);
        }
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Auto-Match: Classes (Vehicles)
  // ---------------------------------------------------------------------------

  async autoMatchClasses(tenantId: number, integrationId: string, externalClasses: ExternalClass[]) {
    const sallyVehicles = await this.prisma.vehicle.findMany({
      where: { tenantId },
      select: { id: true, vehicleId: true, unitNumber: true },
    });

    const candidates = externalClasses.map((c) => ({
      id: c.id,
      name: c.name,
      email: undefined,
    }));

    await Promise.all(
      sallyVehicles.map(async (vehicle) => {
        const { match, confidence } = this.findBestMatch(vehicle.unitNumber, undefined, candidates);

        const hasMatch = match !== null && confidence >= 0.85;
        await this.createEntityMapping(
          tenantId,
          integrationId,
          'class',
          vehicle.vehicleId,
          hasMatch ? match.id : null,
          hasMatch ? match.name : null,
          hasMatch ? confidence : undefined,
        );
        if (hasMatch) {
          this.logger.log(`Auto-matched vehicle ${vehicle.unitNumber} → ${match.name} (${confidence})`);
        }
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Account Mappings
  // ---------------------------------------------------------------------------

  async getAccountMapping(tenantId: number, integrationId: string, sallyItemType: string, direction: string) {
    return this.prisma.accountingAccountMapping.findFirst({
      where: { tenantId, integrationId, sallyItemType, direction },
    });
  }

  async listAccountMappings(tenantId: number, integrationId: string) {
    return this.prisma.accountingAccountMapping.findMany({
      where: { tenantId, integrationId },
      orderBy: [{ direction: 'asc' }, { sallyItemType: 'asc' }],
    });
  }

  async updateAccountMapping(id: number, tenantId: number, externalAccountId: string, externalAccountName: string) {
    return this.prisma.accountingAccountMapping.update({
      where: { id, tenantId },
      data: { externalAccountId, externalAccountName },
    });
  }

  async createDefaultAccountMappings(
    tenantId: number,
    integrationId: string,
    adapter: IAccountingAdapter,
    accessToken: string,
    realmId: string,
  ) {
    const createdAccounts = new Map<string, string>();

    for (const def of this.DEFAULT_ACCOUNTS) {
      const existing = await this.prisma.accountingAccountMapping.findFirst({
        where: {
          tenantId,
          integrationId,
          sallyItemType: def.sallyItemType,
          direction: def.direction,
        },
      });
      if (existing) continue;

      let externalAccountId: string;

      if (createdAccounts.has(def.name)) {
        externalAccountId = createdAccounts.get(def.name)!;
      } else {
        try {
          const account = await adapter.createAccount(
            accessToken,
            realmId,
            def.name,
            def.accountType,
            def.classification,
          );
          externalAccountId = account.id;
          createdAccounts.set(def.name, account.id);
          this.logger.log(`Created QB account: ${def.name} (${account.id})`);
        } catch (err) {
          this.logger.warn(`Failed to create QB account ${def.name}: ${(err as Error).message}`);
          continue;
        }
      }

      await this.prisma.accountingAccountMapping.upsert({
        where: {
          tenantId_integrationId_sallyItemType_direction: {
            tenantId,
            integrationId,
            sallyItemType: def.sallyItemType,
            direction: def.direction,
          },
        },
        create: {
          tenantId,
          integrationId,
          sallyItemType: def.sallyItemType,
          direction: def.direction,
          externalAccountId,
          externalAccountName: def.name,
          isDefault: true,
        },
        update: {
          externalAccountId,
          externalAccountName: def.name,
        },
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Fuzzy matching helper
  // ---------------------------------------------------------------------------

  private findBestMatch(
    sallyName: string,
    sallyEmail: string | undefined,
    candidates: Array<{ id: string; name: string; email?: string }>,
  ): { match: { id: string; name: string } | null; confidence: number } {
    let bestMatch: { id: string; name: string } | null = null;
    let bestConfidence = 0;

    const normalizedSally = sallyName.toLowerCase().trim();

    for (const candidate of candidates) {
      const normalizedCandidate = candidate.name.toLowerCase().trim();
      let confidence = 0;

      if (normalizedSally === normalizedCandidate) {
        confidence = 1.0;
      } else if (sallyEmail && candidate.email && sallyEmail.toLowerCase() === candidate.email.toLowerCase()) {
        confidence = 0.9;
      } else {
        confidence = this.diceCoefficient(normalizedSally, normalizedCandidate);
        if (confidence >= 0.85) {
          confidence = Math.min(0.99, confidence);
        }
      }

      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestMatch = { id: candidate.id, name: candidate.name };
      }
    }

    return { match: bestMatch, confidence: bestConfidence };
  }

  private diceCoefficient(a: string, b: string): number {
    if (a === b) return 1.0;
    if (a.length < 2 || b.length < 2) return 0.0;

    const bigramsA = new Map<string, number>();
    for (let i = 0; i < a.length - 1; i++) {
      const bigram = a.slice(i, i + 2);
      bigramsA.set(bigram, (bigramsA.get(bigram) ?? 0) + 1);
    }

    let intersection = 0;
    for (let i = 0; i < b.length - 1; i++) {
      const bigram = b.slice(i, i + 2);
      const count = bigramsA.get(bigram) ?? 0;
      if (count > 0) {
        intersection++;
        bigramsA.set(bigram, count - 1);
      }
    }

    return (2 * intersection) / (a.length - 1 + (b.length - 1));
  }
}
