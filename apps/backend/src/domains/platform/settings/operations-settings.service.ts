import { Injectable, Logger } from '@nestjs/common';
import { DOCUMENT_TYPES } from '@sally/shared-types';
import { FleetOperationsSettings } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../infrastructure/cache/sally-cache.service';
import { buildKey } from '../../../infrastructure/cache/cache-key.constants';
import { CACHE_TTL_COLD_30M } from '../../../constants/cache.constants';
import { UpdateOperationsSettingsDto } from './dto/operations-settings.dto';

/**
 * Serialize a FleetOperationsSettings row for API output.
 * Converts Prisma Decimal columns (costPerMile, laborCostPerHour,
 * estimatedDieselPricePerGallon) back to plain JS numbers so the API
 * contract stays `number` (matches camelCase DTO + frontend expectations).
 */
function serializeSettings(row: FleetOperationsSettings) {
  // Decimal columns are NOT NULL in the schema (have @default), but tests mock
  // partial rows. Guard with `!= null` so undefined doesn't become NaN.
  return {
    ...row,
    costPerMile: row.costPerMile != null ? Number(row.costPerMile) : row.costPerMile,
    laborCostPerHour: row.laborCostPerHour != null ? Number(row.laborCostPerHour) : row.laborCostPerHour,
    estimatedDieselPricePerGallon:
      row.estimatedDieselPricePerGallon != null
        ? Number(row.estimatedDieselPricePerGallon)
        : row.estimatedDieselPricePerGallon,
  };
}

@Injectable()
export class OperationsSettingsService {
  private readonly logger = new Logger(OperationsSettingsService.name);

  constructor(
    private prisma: PrismaService,
    private cache: SallyCacheService,
  ) {}

  /**
   * Get operations settings for a tenant (creates defaults if not exist)
   */
  async getSettings(tenantDbId: number) {
    return this.cache.getOrSet(
      buildKey('sally:settings', 'operations', tenantDbId),
      async () => {
        let settings = await this.prisma.fleetOperationsSettings.findUnique({
          where: { tenantId: tenantDbId },
        });

        if (!settings) {
          settings = await this.prisma.fleetOperationsSettings.create({
            data: { tenantId: tenantDbId },
          });
        }

        return serializeSettings(settings);
      },
      CACHE_TTL_COLD_30M,
    );
  }

  /**
   * Update operations settings for a tenant
   */
  async updateSettings(tenantDbId: number, updates: UpdateOperationsSettingsDto) {
    const settings = await this.prisma.fleetOperationsSettings.upsert({
      where: { tenantId: tenantDbId },
      create: { tenantId: tenantDbId, ...updates },
      update: updates,
    });

    await this.cache.del(buildKey('sally:settings', 'operations', tenantDbId));

    return serializeSettings(settings);
  }

  /**
   * Reset operations settings to defaults
   */
  async resetToDefaults(tenantDbId: number) {
    await this.prisma.fleetOperationsSettings.delete({ where: { tenantId: tenantDbId } }).catch(() => {});
    const settings = await this.prisma.fleetOperationsSettings.create({
      data: { tenantId: tenantDbId },
    });

    await this.cache.del(buildKey('sally:settings', 'operations', tenantDbId));

    return serializeSettings(settings);
  }

  /**
   * Get default values for operations settings
   */
  getDefaults() {
    return {
      costPerMile: 1.85,
      laborCostPerHour: 25.0,
      preferFullRest: true,
      allowDockRest: true,
      maxFuelDetour: 10,
      estimatedDieselPricePerGallon: 3.89,
      splitSleeperThresholdHours: 16,
      fuelCards: [],
      shieldAiEnabled: true,
      shieldCustomRulesEnabled: true,
      shieldAuditPeriodDays: 30,
      // Alert Settings
      alertResolveCooldownHours: 4,
      // Lane Generation
      laneGenerationLookaheadDays: 3,
      // Document Compliance
      bolEnforcement: DOCUMENT_TYPES.bol.defaultEnforcement,
      podEnforcement: DOCUMENT_TYPES.pod.defaultEnforcement,
      rateConEnforcement: DOCUMENT_TYPES.rate_confirmation.defaultEnforcement,
      lumperReceiptEnforcement: DOCUMENT_TYPES.lumper_receipt.defaultEnforcement,
      scaleTicketEnforcement: DOCUMENT_TYPES.scale_ticket.defaultEnforcement,
      podGracePeriodHours: 48,
      requireBillableCharge: true,
      allowBillingOverride: false,
    };
  }
}
