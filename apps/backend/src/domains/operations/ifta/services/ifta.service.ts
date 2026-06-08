import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { IftaMileageService } from './ifta-mileage.service';
import { IftaFuelService } from './ifta-fuel.service';
import { IftaTaxRateService } from './ifta-tax-rate.service';
import { IftaAnomalyDetectorService } from './ifta-anomaly-detector.service';
import { getIftaFilingDeadline, DEFAULT_FLEET_AVG_MPG, IftaStateCalculation, IftaQuarterSummary } from '../ifta.types';

// Valid status transitions: from → allowed targets
const STATUS_TRANSITIONS: Record<string, string[]> = {
  OPEN: [], // Use calculateQuarter to transition OPEN → DRAFT
  CALCULATING: ['DRAFT'], // Only set by calculateQuarter internally
  DRAFT: ['REVIEWED'],
  REVIEWED: ['FILED', 'DRAFT'],
  FILED: ['CONFIRMED', 'AMENDED'],
  CONFIRMED: ['AMENDED'],
  AMENDED: ['REVIEWED'],
};

@Injectable()
export class IftaService {
  private readonly logger = new Logger(IftaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mileageService: IftaMileageService,
    private readonly fuelService: IftaFuelService,
    private readonly taxRateService: IftaTaxRateService,
    private readonly anomalyDetector: IftaAnomalyDetectorService,
  ) {}

  /**
   * List quarters for a tenant with optional year filter.
   */
  async getQuarters(tenantId: number, filters?: { year?: number; status?: string }) {
    const where: any = { tenantId };
    if (filters?.year) where.year = filters.year;
    if (filters?.status) where.status = filters.status;

    return this.prisma.iftaQuarter.findMany({
      where,
      orderBy: [{ year: 'desc' }, { quarter: 'desc' }],
      include: {
        filing: true,
      },
    });
  }

  /**
   * Get full quarter detail with state mileage, fuel purchases, and filing.
   */
  async getQuarterDetail(tenantId: number, quarterId: number) {
    const quarter = await this.prisma.iftaQuarter.findFirst({
      where: { id: quarterId, tenantId },
      include: {
        stateMileage: { orderBy: { jurisdiction: 'asc' } },
        fuelPurchases: {
          orderBy: { purchaseDate: 'desc' },
          include: {
            vehicle: { select: { unitNumber: true } },
          },
        },
        filing: true,
        filedByUser: { select: { firstName: true, lastName: true } },
      },
    });

    if (!quarter) {
      throw new NotFoundException('Quarter not found');
    }

    return quarter;
  }

  /**
   * Core calculation: aggregate load mileage + merge manual entries + get fuel by state +
   * look up tax rates + calculate per-state tax. Saves results to DB.
   */
  async calculateQuarter(tenantId: number, quarterId: number) {
    const quarter = await this.prisma.iftaQuarter.findFirst({
      where: { id: quarterId, tenantId },
    });

    if (!quarter) {
      throw new NotFoundException('Quarter not found');
    }

    if (quarter.status === 'CALCULATING') {
      throw new BadRequestException('Quarter is already being calculated');
    }

    // Optimistic lock: only transition if status hasn't changed since we read it
    const updated = await this.prisma.iftaQuarter.updateMany({
      where: { id: quarterId, status: quarter.status },
      data: { status: 'CALCULATING' },
    });

    if (updated.count === 0) {
      throw new BadRequestException('Quarter status changed concurrently, please retry');
    }

    try {
      const { year, quarter: q } = quarter;
      const fleetAvgMpg = DEFAULT_FLEET_AVG_MPG;

      // 1. Aggregate load-derived mileage by state
      const loadMileage = await this.mileageService.aggregateLoadMileageByState(tenantId, year, q);

      // 2. Get existing manual mileage entries
      const existingMileage = await this.mileageService.getMileageForQuarter(tenantId, quarterId);
      const manualEntries = existingMileage.filter((m) => m.source === 'MANUAL');

      // 3. Merge: load-derived + manual (manual overrides for that jurisdiction)
      const manualJurisdictions = new Set(manualEntries.map((m) => m.jurisdiction));
      const mergedMileageMap = new Map<string, { totalMiles: number; loadIds: number[]; source: string }>();

      for (const entry of loadMileage) {
        if (!manualJurisdictions.has(entry.jurisdiction)) {
          mergedMileageMap.set(entry.jurisdiction, {
            totalMiles: entry.totalMiles,
            loadIds: entry.loadIds,
            source: 'LOAD_DERIVED',
          });
        }
      }

      for (const entry of manualEntries) {
        mergedMileageMap.set(entry.jurisdiction, {
          totalMiles: entry.totalMiles,
          loadIds: [],
          source: 'MANUAL',
        });
      }

      // 4. Get fuel by state
      const fuelByState = await this.fuelService.getFuelByState(tenantId, quarterId);
      const fuelMap = new Map(fuelByState.map((f) => [f.jurisdiction, f.totalGallons]));

      // Include fuel-only jurisdictions
      for (const fuel of fuelByState) {
        if (!mergedMileageMap.has(fuel.jurisdiction)) {
          mergedMileageMap.set(fuel.jurisdiction, {
            totalMiles: 0,
            loadIds: [],
            source: 'LOAD_DERIVED',
          });
        }
      }

      // 5. Look up tax rates
      const taxRatesMap = await this.taxRateService.getRatesMap(year, q);

      // 6. Calculate per-state tax
      const stateCalculations: IftaStateCalculation[] = [];
      let totalMiles = 0;
      let totalGallons = 0;
      let totalTaxOwedCents = 0;
      let totalTaxPaidCents = 0;

      for (const [jurisdiction, mileageData] of mergedMileageMap) {
        const miles = mileageData.totalMiles;
        const fuelGallons = fuelMap.get(jurisdiction) ?? 0;
        const taxRate = taxRatesMap.get(jurisdiction);

        const rate = taxRate?.taxRatePerGallon ?? 0;
        const surchargeRate = taxRate?.surchargeRate ?? 0;
        const jurisdictionName = taxRate?.jurisdictionName ?? jurisdiction;

        // taxableGallons = miles / fleet_avg_mpg
        const taxableGallons = fleetAvgMpg > 0 ? miles / fleetAvgMpg : 0;

        // taxOwed = taxableGallons * rate (in cents)
        const taxOwedCents = Math.round(taxableGallons * rate * 100);
        const surchargeOwedCents = Math.round(taxableGallons * surchargeRate * 100);

        // taxPaid = fuelGallons * rate (in cents)
        const taxPaidCents = Math.round(fuelGallons * rate * 100);

        // net = taxOwed - taxPaid
        const netTaxCents = taxOwedCents + surchargeOwedCents - taxPaidCents;

        totalMiles += miles;
        totalGallons += fuelGallons;
        totalTaxOwedCents += taxOwedCents + surchargeOwedCents;
        totalTaxPaidCents += taxPaidCents;

        stateCalculations.push({
          jurisdiction,
          jurisdictionName,
          totalMiles: miles,
          taxableGallons,
          fuelPurchasedGallons: fuelGallons,
          taxRate: rate,
          surchargeRate,
          taxOwedCents,
          surchargeOwedCents,
          taxPaidCents,
          netTaxCents,
        });

        // Upsert state mileage record with calculated tax data
        await this.prisma.iftaStateMileage.upsert({
          where: {
            quarterId_jurisdiction: {
              quarterId,
              jurisdiction,
            },
          },
          create: {
            quarterId,
            tenantId,
            jurisdiction,
            totalMiles: miles,
            taxableGallons,
            taxRatePerGallon: rate,
            surchargeRate,
            taxOwedCents,
            surchargeOwedCents,
            source: mileageData.source as any,
            loadIds: mileageData.loadIds.length > 0 ? mileageData.loadIds : undefined,
          },
          update: {
            totalMiles: miles,
            taxableGallons,
            taxRatePerGallon: rate,
            surchargeRate,
            taxOwedCents,
            surchargeOwedCents,
            source: mileageData.source as any,
            loadIds: mileageData.loadIds.length > 0 ? mileageData.loadIds : undefined,
          },
        });
      }

      // 7. Run anomaly detection
      const filingDeadline = getIftaFilingDeadline(year, q);
      const anomalies = this.anomalyDetector.detectAnomalies({
        stateBreakdown: stateCalculations,
        totalMiles,
        totalGallons,
        fleetAvgMpg,
        filingDeadline,
        currentDate: new Date(),
      });

      // 8. Update quarter totals and move to DRAFT
      const netTaxDueCents = totalTaxOwedCents - totalTaxPaidCents;

      const updated = await this.prisma.iftaQuarter.update({
        where: { id: quarterId },
        data: {
          status: 'DRAFT',
          totalMiles,
          totalGallons,
          totalTaxOwedCents,
          totalTaxPaidCents,
          netTaxDueCents,
          anomalyCount: anomalies.length,
          anomalies: anomalies as any,
        },
        include: {
          stateMileage: { orderBy: { jurisdiction: 'asc' } },
          filing: true,
        },
      });

      this.logger.log(
        `IFTA quarter ${quarterId} calculated: ${stateCalculations.length} states, net tax ${netTaxDueCents}¢`,
      );

      return {
        quarter: updated,
        stateCalculations,
        anomalies,
        summary: {
          totalMiles,
          totalGallons,
          fleetAvgMpg,
          totalTaxOwedCents,
          totalTaxPaidCents,
          netTaxDueCents,
          stateCount: stateCalculations.length,
          anomalyCount: anomalies.length,
        },
      };
    } catch (error) {
      // Revert status on failure
      await this.prisma.iftaQuarter.update({
        where: { id: quarterId },
        data: { status: quarter.status },
      });
      throw error;
    }
  }

  /**
   * Filing status state machine.
   */
  async updateFilingStatus(
    tenantId: number,
    quarterId: number,
    input: {
      status: string;
      confirmationNumber?: string;
      filingMethod?: string;
      notes?: string;
    },
    userId: number,
  ) {
    const quarter = await this.prisma.iftaQuarter.findFirst({
      where: { id: quarterId, tenantId },
    });

    if (!quarter) {
      throw new NotFoundException('Quarter not found');
    }

    const currentStatus = quarter.status;
    const targetStatus = input.status;

    const allowedTargets = STATUS_TRANSITIONS[currentStatus];
    if (!allowedTargets || !allowedTargets.includes(targetStatus)) {
      throw new BadRequestException(
        `Cannot transition from ${currentStatus} to ${targetStatus}. Allowed: ${allowedTargets?.join(', ') || 'none'}`,
      );
    }

    const updateData: any = { status: targetStatus };

    if (targetStatus === 'FILED') {
      updateData.filedAt = new Date();
      updateData.filedById = userId;

      // Create or update filing record
      const deadline = getIftaFilingDeadline(quarter.year, quarter.quarter);
      await this.prisma.iftaFiling.upsert({
        where: { quarterId },
        create: {
          quarterId,
          tenantId,
          dueDate: deadline,
          filedAt: new Date(),
          filingMethod: input.filingMethod,
          confirmationNumber: input.confirmationNumber,
          amountDueCents: quarter.netTaxDueCents,
          notes: input.notes,
        },
        update: {
          filedAt: new Date(),
          filingMethod: input.filingMethod,
          confirmationNumber: input.confirmationNumber,
          notes: input.notes,
        },
      });
    }

    if (targetStatus === 'CONFIRMED') {
      updateData.confirmedAt = new Date();
    }

    if (input.notes) {
      updateData.notes = input.notes;
    }

    const updated = await this.prisma.iftaQuarter.update({
      where: { id: quarterId },
      data: updateData,
      include: { filing: true },
    });

    this.logger.log(`IFTA quarter ${quarterId} status: ${currentStatus} → ${targetStatus}`);

    return updated;
  }

  /**
   * Summary with deadline countdown.
   */
  async getQuarterSummary(tenantId: number, quarterId: number): Promise<IftaQuarterSummary> {
    const quarter = await this.prisma.iftaQuarter.findFirst({
      where: { id: quarterId, tenantId },
    });

    if (!quarter) {
      throw new NotFoundException('Quarter not found');
    }

    const filingDeadline = getIftaFilingDeadline(quarter.year, quarter.quarter);
    const now = new Date();
    const diffMs = filingDeadline.getTime() - now.getTime();
    const daysUntilDeadline = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    const totalMiles = quarter.totalMiles ?? 0;
    const totalGallons = quarter.totalGallons ?? 0;
    const fleetAvgMpg = totalMiles > 0 && totalGallons > 0 ? totalMiles / totalGallons : DEFAULT_FLEET_AVG_MPG;

    return {
      year: quarter.year,
      quarter: quarter.quarter,
      status: quarter.status,
      totalMiles,
      totalGallons,
      fleetAvgMpg: Math.round(fleetAvgMpg * 100) / 100,
      totalTaxOwedCents: quarter.totalTaxOwedCents ?? 0,
      totalTaxPaidCents: quarter.totalTaxPaidCents ?? 0,
      netTaxDueCents: quarter.netTaxDueCents ?? 0,
      stateCount: 0, // Will be enriched below
      anomalyCount: quarter.anomalyCount,
      filingDeadline,
      daysUntilDeadline,
    };
  }
}
