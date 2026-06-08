import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { ShieldCategoryResult, ShieldCoverageItem, ShieldFindingInput, computeCategoryScore } from '../shield.types';

interface ExpiryCheckOptions {
  /** The expiry date to check (null triggers a data-gap finding) */
  date: Date | null;
  /** Entity info for the finding */
  entityType: 'driver' | 'vehicle';
  entityId: string;
  entityName: string;
  /** Finding category */
  category: 'DRIVERS' | 'VEHICLES' | 'HOS' | 'LOADS';
  /** What document/item is expiring (e.g. "Medical card", "Registration") */
  label: string;
  /** CFR regulation reference */
  regulation: string;
  /** Impact text when expired */
  expiredImpact?: string;
  /** Recommendation when expired */
  expiredRecommendation?: string;
  /** Whether to generate a data-gap finding when date is null */
  flagNullDate?: boolean;
  /** Severity for null-date finding (default: WARNING) */
  nullDateSeverity?: 'CRITICAL' | 'WARNING';
  /** Custom description for null-date finding */
  nullDateDescription?: string;
}

function checkExpiryDate(options: ExpiryCheckOptions): ShieldFindingInput[] {
  const findings: ShieldFindingInput[] = [];
  const {
    date,
    entityType,
    entityId,
    entityName,
    category,
    label,
    regulation,
    expiredImpact,
    expiredRecommendation,
    flagNullDate = false,
    nullDateSeverity = 'WARNING',
    nullDateDescription,
  } = options;

  if (!date) {
    if (flagNullDate) {
      findings.push({
        category,
        severity: nullDateSeverity,
        title: `No ${label.toLowerCase()} on file — ${entityName}`,
        description: nullDateDescription ?? `${label} expiry date is not recorded for this ${entityType}.`,
        entityType,
        entityId,
        entityName,
        recommendation: `Obtain and record ${label.toLowerCase()} information.`,
        regulation,
      });
    }
    return findings;
  }

  const now = new Date();
  const daysUntilExpiry = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysUntilExpiry <= 0) {
    findings.push({
      category,
      severity: 'CRITICAL',
      title: `${label} expired — ${entityName}`,
      description: `${label} expired ${Math.abs(daysUntilExpiry)} days ago.`,
      entityType,
      entityId,
      entityName,
      impact: expiredImpact,
      recommendation: expiredRecommendation ?? `Renew ${label.toLowerCase()} immediately.`,
      dueDate: date,
      regulation,
    });
  } else if (daysUntilExpiry <= 14) {
    findings.push({
      category,
      severity: 'CRITICAL',
      title: `${label} expires in ${daysUntilExpiry} days — ${entityName}`,
      description: `${label} expires on ${date.toISOString().split('T')[0]}.`,
      entityType,
      entityId,
      entityName,
      recommendation: `Schedule ${label.toLowerCase()} renewal immediately.`,
      dueDate: date,
      regulation,
    });
  } else if (daysUntilExpiry <= 30) {
    findings.push({
      category,
      severity: 'WARNING',
      title: `${label} expires in ${daysUntilExpiry} days — ${entityName}`,
      description: `${label} expires on ${date.toISOString().split('T')[0]}.`,
      entityType,
      entityId,
      entityName,
      recommendation: `Schedule ${label.toLowerCase()} renewal.`,
      dueDate: date,
      regulation,
    });
  }

  return findings;
}

@Injectable()
export class ShieldRuleEngine {
  private readonly logger = new Logger(ShieldRuleEngine.name);

  constructor(private readonly prisma: PrismaService) {}

  async checkHOS(tenantId: number): Promise<ShieldCategoryResult> {
    const findings: ShieldFindingInput[] = [];

    const drivers = await this.prisma.driver.findMany({
      where: { tenantId, status: { in: ['ACTIVE', 'PENDING_ACTIVATION'] } },
      select: {
        driverId: true,
        name: true,
        currentHoursDriven: true,
        currentOnDutyTime: true,
        currentHoursSinceBreak: true,
        cycleHoursUsed: true,
        hosDataSyncedAt: true,
      },
    });

    for (const driver of drivers) {
      const hoursDriven = driver.currentHoursDriven ?? 0;
      if (hoursDriven > 10) {
        findings.push({
          category: 'HOS',
          severity: 'CRITICAL',
          title: `Drive hours critical — ${driver.name}`,
          description: `Driver has ${hoursDriven.toFixed(1)}h of driving (limit: 11h). Less than 1 hour remaining.`,
          entityType: 'driver',
          entityId: driver.driverId,
          entityName: driver.name,
          impact: 'Driver must stop driving immediately or risk HOS violation.',
          recommendation: 'Insert rest stop or reassign remaining loads.',
          regulation: '49 CFR 395.3(a)',
        });
      } else if (hoursDriven > 9) {
        findings.push({
          category: 'HOS',
          severity: 'WARNING',
          title: `Drive hours approaching limit — ${driver.name}`,
          description: `Driver has ${hoursDriven.toFixed(1)}h of driving (limit: 11h). Less than 2 hours remaining.`,
          entityType: 'driver',
          entityId: driver.driverId,
          entityName: driver.name,
          recommendation: 'Monitor closely. Plan a rest stop if more than 2 hours of driving remain on route.',
          regulation: '49 CFR 395.3(a)',
        });
      }

      const onDutyTime = driver.currentOnDutyTime ?? 0;
      if (onDutyTime > 13) {
        findings.push({
          category: 'HOS',
          severity: 'CRITICAL',
          title: `Duty window critical — ${driver.name}`,
          description: `On-duty time: ${onDutyTime.toFixed(1)}h (limit: 14h). Window closing.`,
          entityType: 'driver',
          entityId: driver.driverId,
          entityName: driver.name,
          impact: 'Driver cannot perform any on-duty activity once 14h window closes.',
          recommendation: 'Driver must take 10-hour off-duty rest to reset.',
          regulation: '49 CFR 395.3(a)',
        });
      }

      const hoursSinceBreak = driver.currentHoursSinceBreak ?? 0;
      if (hoursSinceBreak > 7.5) {
        findings.push({
          category: 'HOS',
          severity: hoursSinceBreak >= 8 ? 'CRITICAL' : 'WARNING',
          title: `Break required — ${driver.name}`,
          description: `${hoursSinceBreak.toFixed(1)}h since last break (required every 8h).`,
          entityType: 'driver',
          entityId: driver.driverId,
          entityName: driver.name,
          recommendation: 'Driver must take a 30-minute break before continuing to drive.',
          regulation: '49 CFR 395.3(a)(3)',
        });
      }

      const cycleHours = driver.cycleHoursUsed ?? 0;
      if (cycleHours > 65) {
        findings.push({
          category: 'HOS',
          severity: cycleHours > 68 ? 'CRITICAL' : 'WARNING',
          title: `Cycle hours ${cycleHours > 68 ? 'critical' : 'approaching limit'} — ${driver.name}`,
          description: `Cycle hours used: ${cycleHours.toFixed(1)}h of 70h.`,
          entityType: 'driver',
          entityId: driver.driverId,
          entityName: driver.name,
          recommendation:
            cycleHours > 68
              ? 'Driver needs a 34-hour restart to reset cycle.'
              : 'Plan rest day soon to avoid hitting cycle limit.',
          regulation: '49 CFR 395.3(b)',
        });
      }

      if (driver.hosDataSyncedAt) {
        const hoursSinceSync = (Date.now() - driver.hosDataSyncedAt.getTime()) / (1000 * 60 * 60);
        if (hoursSinceSync > 4) {
          findings.push({
            category: 'HOS',
            severity: 'WARNING',
            title: `Stale ELD data — ${driver.name}`,
            description: `HOS data last synced ${Math.round(hoursSinceSync)}h ago. Data may be outdated.`,
            entityType: 'driver',
            entityId: driver.driverId,
            entityName: driver.name,
            recommendation: 'Check ELD integration status. Data older than 4 hours may not reflect current compliance.',
            regulation: '49 CFR 395.8',
          });
        }
      }
    }

    const coverage: ShieldCoverageItem[] = [
      {
        check: '11-hour drive limit',
        regulation: '49 CFR 395.3(a)',
        source: 'rule',
      },
      {
        check: '14-hour duty window',
        regulation: '49 CFR 395.3(a)',
        source: 'rule',
      },
      {
        check: '30-minute break rule',
        regulation: '49 CFR 395.3(a)(3)',
        source: 'rule',
      },
      {
        check: '70-hour/8-day cycle',
        regulation: '49 CFR 395.3(b)',
        source: 'rule',
      },
      {
        check: 'ELD data freshness',
        regulation: '49 CFR 395.8',
        source: 'rule',
      },
      {
        check: 'HOS violation detection',
        regulation: 'Samsara webhook',
        source: 'rule',
      },
      {
        check: 'Fatigue pattern detection',
        regulation: '49 CFR Part 395',
        source: 'ai',
      },
      {
        check: 'Scheduling risk assessment',
        regulation: '49 CFR Part 395',
        source: 'ai',
      },
    ];

    return {
      category: 'HOS',
      score: computeCategoryScore(findings),
      findings,
      coverage,
    };
  }

  async checkDrivers(tenantId: number): Promise<ShieldCategoryResult> {
    const findings: ShieldFindingInput[] = [];
    const now = new Date();

    const drivers = await this.prisma.driver.findMany({
      where: { tenantId, status: { in: ['ACTIVE', 'PENDING_ACTIVATION'] } },
      select: {
        driverId: true,
        name: true,
        medicalCardExpiry: true,
        cdlClass: true,
        cdlExpiry: true,
        endorsements: true,
        hireDate: true,
        mvrDate: true,
        drugTestDate: true,
        annualReviewDate: true,
        _count: {
          select: {
            loads: {
              where: {
                status: {
                  in: ['ASSIGNED', 'IN_TRANSIT'],
                },
              },
            },
          },
        },
      },
    });

    for (const driver of drivers) {
      const hasActiveLoads = (driver._count?.loads ?? 0) > 0;
      const activeLoadCount = driver._count?.loads ?? 0;

      // --- Medical card (context-aware: uses helper + custom null handling) ---
      if (driver.medicalCardExpiry) {
        findings.push(
          ...checkExpiryDate({
            date: driver.medicalCardExpiry,
            entityType: 'driver',
            entityId: driver.driverId,
            entityName: driver.name,
            category: 'DRIVERS',
            label: 'Medical card',
            regulation: '49 CFR 391.41',
            expiredImpact: 'Driver cannot legally operate a CMV until medical card is renewed.',
            expiredRecommendation: 'Remove driver from active loads and schedule medical exam immediately.',
          }),
        );
      } else {
        // Context-aware: CRITICAL if hauling, WARNING if just data gap
        findings.push({
          category: 'DRIVERS',
          severity: hasActiveLoads ? 'CRITICAL' : 'WARNING',
          title: `No medical card on file — ${driver.name}`,
          description: hasActiveLoads
            ? `Driver has no medical card expiry recorded. Currently assigned to ${activeLoadCount} active load${activeLoadCount > 1 ? 's' : ''} — cannot verify medical qualification.`
            : 'Driver has no medical card expiry date recorded.',
          entityType: 'driver',
          entityId: driver.driverId,
          entityName: driver.name,
          impact: hasActiveLoads ? 'Cannot verify medical qualification for DOT compliance.' : undefined,
          recommendation: 'Obtain and record medical card information.',
          regulation: '49 CFR 391.41',
        });
      }

      // --- CDL expiry ---
      findings.push(
        ...checkExpiryDate({
          date: driver.cdlExpiry,
          entityType: 'driver',
          entityId: driver.driverId,
          entityName: driver.name,
          category: 'DRIVERS',
          label: 'CDL',
          regulation: '49 CFR 391.11',
          expiredImpact: 'Immediate out-of-service order if stopped by DOT.',
          expiredRecommendation: 'Remove from all loads. Driver must renew CDL before returning to duty.',
        }),
      );

      // --- CDL class missing (existing, now with regulation) ---
      if (!driver.cdlClass) {
        findings.push({
          category: 'DRIVERS',
          severity: 'WARNING',
          title: `CDL class not recorded — ${driver.name}`,
          description: 'Driver CDL class is not in the system.',
          entityType: 'driver',
          entityId: driver.driverId,
          entityName: driver.name,
          recommendation: 'Record driver CDL class for compliance tracking.',
          regulation: '49 CFR 383.91',
        });
      }

      // --- MVR staleness (NEW) ---
      if (driver.mvrDate) {
        const daysSinceMvr = Math.ceil((now.getTime() - driver.mvrDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceMvr > 365) {
          findings.push({
            category: 'DRIVERS',
            severity: 'WARNING',
            title: `MVR overdue — ${driver.name}`,
            description: `Last MVR was ${daysSinceMvr} days ago. Annual review required.`,
            entityType: 'driver',
            entityId: driver.driverId,
            entityName: driver.name,
            recommendation: 'Pull a new Motor Vehicle Record for this driver.',
            regulation: '49 CFR 391.25',
          });
        }
      }

      // --- Drug test staleness (NEW) ---
      if (driver.drugTestDate) {
        const daysSinceTest = Math.ceil((now.getTime() - driver.drugTestDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceTest > 730) {
          findings.push({
            category: 'DRIVERS',
            severity: 'WARNING',
            title: `Drug test overdue — ${driver.name}`,
            description: `Last drug/alcohol test was ${daysSinceTest} days ago (${Math.round((daysSinceTest / 365) * 10) / 10} years).`,
            entityType: 'driver',
            entityId: driver.driverId,
            entityName: driver.name,
            recommendation: 'Schedule random or follow-up drug/alcohol test.',
            regulation: '49 CFR Part 382',
          });
        }
      }

      // --- Annual DQ file review staleness (NEW) ---
      if (driver.annualReviewDate) {
        const daysSinceReview = Math.ceil((now.getTime() - driver.annualReviewDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceReview > 365) {
          findings.push({
            category: 'DRIVERS',
            severity: 'WARNING',
            title: `Annual review overdue — ${driver.name}`,
            description: `Last DQ file annual review was ${daysSinceReview} days ago.`,
            entityType: 'driver',
            entityId: driver.driverId,
            entityName: driver.name,
            recommendation: 'Conduct annual driver qualification file review.',
            regulation: '49 CFR 391.51',
          });
        }
      }
    }

    // Coverage manifest
    const coverage: ShieldCoverageItem[] = [
      {
        check: 'Medical certificate valid',
        regulation: '49 CFR 391.41',
        source: 'rule',
      },
      {
        check: 'CDL valid & not expired',
        regulation: '49 CFR 391.11',
        source: 'rule',
      },
      {
        check: 'CDL class recorded',
        regulation: '49 CFR 383.91',
        source: 'rule',
      },
      {
        check: 'MVR annual review',
        regulation: '49 CFR 391.25',
        source: 'rule',
      },
      {
        check: 'Drug & alcohol testing',
        regulation: '49 CFR Part 382',
        source: 'rule',
      },
      {
        check: 'Annual DQ file review',
        regulation: '49 CFR 391.51',
        source: 'rule',
      },
      {
        check: 'Hazmat endorsement ↔ load',
        regulation: '49 CFR 383.93',
        source: 'rule',
      },
      {
        check: 'DQ file completeness patterns',
        regulation: '49 CFR 391.51',
        source: 'ai',
      },
      {
        check: 'Qualification ↔ cargo risk',
        regulation: '49 CFR 383.93',
        source: 'ai',
      },
    ];

    return {
      category: 'DRIVERS',
      score: computeCategoryScore(findings),
      findings,
      coverage,
    };
  }

  async checkVehicles(tenantId: number): Promise<ShieldCategoryResult> {
    const findings: ShieldFindingInput[] = [];
    const now = new Date();

    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        tenantId,
        status: { in: ['AVAILABLE', 'ASSIGNED'] },
      },
      select: {
        vehicleId: true,
        unitNumber: true,
        equipmentType: true,
        vin: true,
        status: true,
        registrationExpiry: true,
        insuranceExpiry: true,
        annualInspectionDate: true,
        nextMaintenanceDate: true,
        dvirs: {
          orderBy: { inspectedAt: 'desc' },
          take: 1,
          select: {
            inspectedAt: true,
            condition: true,
            defectsCount: true,
            mechanicSignedOff: true,
          },
        },
      },
    });

    if (vehicles.length === 0) {
      findings.push({
        category: 'VEHICLES',
        severity: 'INFO',
        title: 'No active vehicles',
        description: 'No active vehicles found for this fleet.',
      });
    }

    for (const vehicle of vehicles) {
      const displayName = vehicle.unitNumber || vehicle.vehicleId;

      // --- Registration expiry (flags null date on ASSIGNED vehicles) ---
      const isAssigned = vehicle.status === 'ASSIGNED';
      findings.push(
        ...checkExpiryDate({
          date: vehicle.registrationExpiry,
          entityType: 'vehicle',
          entityId: vehicle.vehicleId,
          entityName: displayName,
          category: 'VEHICLES',
          label: 'Registration',
          regulation: '49 CFR 390.21',
          expiredImpact: 'Immediate out-of-service if stopped. Fines up to $16,000.',
          expiredRecommendation: 'Renew registration immediately. Remove from active loads until renewed.',
          flagNullDate: isAssigned,
          nullDateSeverity: 'WARNING',
          nullDateDescription: `Assigned vehicle has no registration expiry date recorded. Cannot verify registration compliance.`,
        }),
      );

      // --- Insurance expiry (flags null date on ASSIGNED vehicles) ---
      findings.push(
        ...checkExpiryDate({
          date: vehicle.insuranceExpiry,
          entityType: 'vehicle',
          entityId: vehicle.vehicleId,
          entityName: displayName,
          category: 'VEHICLES',
          label: 'Insurance',
          regulation: '49 CFR Part 387',
          expiredImpact: 'Operating without insurance violates federal law. Carrier authority at risk.',
          expiredRecommendation: 'Contact insurer immediately. Do not dispatch until coverage is confirmed.',
          flagNullDate: isAssigned,
          nullDateSeverity: 'WARNING',
          nullDateDescription: `Assigned vehicle has no insurance expiry date recorded. Cannot verify insurance compliance.`,
        }),
      );

      // --- Annual inspection ---
      if (vehicle.annualInspectionDate) {
        const daysSince = Math.ceil((now.getTime() - vehicle.annualInspectionDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSince > 425) {
          // >14 months — seriously overdue
          findings.push({
            category: 'VEHICLES',
            severity: 'CRITICAL',
            title: `Annual inspection overdue — ${displayName}`,
            description: `Last inspection was ${daysSince} days ago (${Math.round(daysSince / 30)} months). Required within 12 months.`,
            entityType: 'vehicle',
            entityId: vehicle.vehicleId,
            entityName: displayName,
            impact: 'Out-of-service violation if inspected by DOT.',
            recommendation: 'Schedule annual DOT inspection immediately.',
            regulation: '49 CFR 396.17',
          });
        } else if (daysSince > 335) {
          // >11 months — approaching due date
          findings.push({
            category: 'VEHICLES',
            severity: 'WARNING',
            title: `Annual inspection due soon — ${displayName}`,
            description: `Last inspection was ${daysSince} days ago. Due within ${365 - daysSince} days.`,
            entityType: 'vehicle',
            entityId: vehicle.vehicleId,
            entityName: displayName,
            recommendation: 'Schedule annual DOT inspection.',
            regulation: '49 CFR 396.17',
          });
        }
      }

      // --- Preventive maintenance ---
      if (vehicle.nextMaintenanceDate) {
        const daysUntil = Math.ceil((vehicle.nextMaintenanceDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysUntil < 0) {
          findings.push({
            category: 'VEHICLES',
            severity: 'WARNING',
            title: `Maintenance overdue — ${displayName}`,
            description: `Preventive maintenance was due ${Math.abs(daysUntil)} days ago.`,
            entityType: 'vehicle',
            entityId: vehicle.vehicleId,
            entityName: displayName,
            recommendation: 'Schedule preventive maintenance service.',
            regulation: '49 CFR 396.3',
          });
        }
      }

      // --- DVIR checks (from Samsara sync) ---
      const latestDvir = vehicle.dvirs?.[0];
      if (vehicle.status === 'ASSIGNED') {
        if (latestDvir) {
          const hoursSinceDvir = (now.getTime() - latestDvir.inspectedAt.getTime()) / (1000 * 60 * 60);
          if (hoursSinceDvir > 24) {
            findings.push({
              category: 'VEHICLES',
              severity: 'WARNING',
              title: `No DVIR in 24 hours — ${displayName}`,
              description: `Last driver vehicle inspection was ${Math.round(hoursSinceDvir)} hours ago.`,
              entityType: 'vehicle',
              entityId: vehicle.vehicleId,
              entityName: displayName,
              recommendation: 'Ensure driver completes pre-trip inspection before next dispatch.',
              regulation: '49 CFR 396.11',
            });
          }
          if (latestDvir.condition === 'needs_repair' && !latestDvir.mechanicSignedOff) {
            findings.push({
              category: 'VEHICLES',
              severity: 'CRITICAL',
              title: `Unresolved DVIR defects — ${displayName}`,
              description: `Last inspection found ${latestDvir.defectsCount} defect(s) requiring repair. No mechanic sign-off.`,
              entityType: 'vehicle',
              entityId: vehicle.vehicleId,
              entityName: displayName,
              impact: 'Vehicle cannot be dispatched until defects are repaired and signed off.',
              recommendation: 'Schedule repair and obtain mechanic certification.',
              regulation: '49 CFR 396.11',
            });
          }
        }
      }
    }

    const coverage: ShieldCoverageItem[] = [
      {
        check: 'Registration current',
        regulation: '49 CFR 390.21',
        source: 'rule',
      },
      {
        check: 'Insurance current',
        regulation: '49 CFR Part 387',
        source: 'rule',
      },
      {
        check: 'Annual inspection (12 mo)',
        regulation: '49 CFR 396.17',
        source: 'rule',
      },
      {
        check: 'Preventive maintenance',
        regulation: '49 CFR 396.3',
        source: 'rule',
      },
      {
        check: 'DVIR pre/post-trip',
        regulation: '49 CFR 396.11',
        source: 'rule',
      },
      {
        check: 'Maintenance pattern detection',
        regulation: '49 CFR 396.3',
        source: 'ai',
      },
      {
        check: 'Fleet condition risk',
        regulation: '49 CFR Part 396',
        source: 'ai',
      },
    ];

    return {
      category: 'VEHICLES',
      score: computeCategoryScore(findings),
      findings,
      coverage,
    };
  }

  async checkLoads(tenantId: number, auditPeriodDays = 30): Promise<ShieldCategoryResult> {
    const findings: ShieldFindingInput[] = [];

    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - auditPeriodDays);

    const loads = await this.prisma.load.findMany({
      where: {
        tenantId,
        OR: [
          {
            status: {
              in: ['ASSIGNED', 'IN_TRANSIT'],
            },
          },
          {
            status: { in: ['DELIVERED', 'CANCELLED'] },
            updatedAt: { gte: periodStart },
          },
        ],
      },
      select: {
        referenceNumber: true,
        loadNumber: true,
        status: true,
        weightLbs: true,
        commodityType: true,
        hazmatClass: true,
        unNumber: true,
        placardRequired: true,
        stops: {
          select: {
            actionType: true,
            bolNumber: true,
            podSignatureUrl: true,
            actualWeight: true,
            damagedPieces: true,
            shortPieces: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });

    if (loads.length === 500) {
      findings.push({
        category: 'LOADS',
        severity: 'INFO',
        title: 'Load audit capped at 500',
        description: `More than 500 loads matched the audit period (${auditPeriodDays} days). Only the most recent 500 were audited.`,
        recommendation: 'Consider reducing the audit period or running category-specific audits for full coverage.',
      });
    }

    for (const load of loads) {
      const displayName = load.referenceNumber || load.loadNumber || load.loadNumber;

      // Missing weight — weightLbs is non-nullable Float (defaults to 0 when not recorded)
      if (load.weightLbs === 0) {
        if (['IN_TRANSIT', 'ASSIGNED'].includes(load.status)) {
          findings.push({
            category: 'LOADS',
            severity: 'WARNING',
            title: `Missing weight — Load ${displayName}`,
            description: 'In-transit load has no weight recorded. Required for DOT weight compliance.',
            entityType: 'load',
            entityId: load.loadNumber,
            entityName: displayName,
            recommendation: 'Record load weight from BOL or scale ticket.',
            regulation: '23 CFR 658.17',
          });
        } else if (load.status === 'DELIVERED') {
          findings.push({
            category: 'LOADS',
            severity: 'WARNING',
            title: `Missing weight on delivered load — ${displayName}`,
            description: 'Delivered load has no weight recorded. Required for compliance records.',
            entityType: 'load',
            entityId: load.loadNumber,
            entityName: displayName,
            recommendation: 'Update load with weight from BOL or scale ticket for audit trail.',
            regulation: '23 CFR 658.17',
          });
        }
      }

      // Overweight check (federal bridge formula limit: 80,000 lbs)
      if (load.weightLbs > 80000) {
        findings.push({
          category: 'LOADS',
          severity: 'CRITICAL',
          title: `Overweight — Load ${displayName}`,
          description: `Load weight ${load.weightLbs.toLocaleString()} lbs exceeds federal limit of 80,000 lbs.`,
          entityType: 'load',
          entityId: load.loadNumber,
          entityName: displayName,
          impact: 'Subject to fines, out-of-service orders, and infrastructure damage liability.',
          recommendation: 'Verify weight. If accurate, reduce load or obtain overweight permit.',
          regulation: '23 CFR § 658.17',
        });
      }

      // Hazmat without placard
      if (load.hazmatClass && !load.placardRequired) {
        findings.push({
          category: 'LOADS',
          severity: 'CRITICAL',
          title: `Hazmat without placard — Load ${displayName}`,
          description: `Load has hazmat class "${load.hazmatClass}" but placard is not marked as required.`,
          entityType: 'load',
          entityId: load.loadNumber,
          entityName: displayName,
          impact: 'Placarding violations can result in fines up to $75,000.',
          recommendation: 'Verify hazmat classification and update placard requirement.',
          regulation: '49 CFR § 172.504',
        });
      }

      // Hazmat without UN number
      if (load.hazmatClass && !load.unNumber) {
        findings.push({
          category: 'LOADS',
          severity: 'WARNING',
          title: `Hazmat missing UN number — Load ${displayName}`,
          description: `Load has hazmat class "${load.hazmatClass}" but no UN number recorded.`,
          entityType: 'load',
          entityId: load.loadNumber,
          entityName: displayName,
          recommendation: 'Record the UN identification number for proper hazmat documentation.',
          regulation: '49 CFR § 172.301',
        });
      }

      // Stop-level checks for delivered loads
      if (load.status === 'DELIVERED') {
        for (const stop of load.stops) {
          // Missing BOL on pickup stops
          if (stop.actionType === 'pickup' && !stop.bolNumber) {
            findings.push({
              category: 'LOADS',
              severity: 'WARNING',
              title: `Missing BOL — Load ${displayName}`,
              description: 'Delivered load has a pickup stop without a BOL number on file.',
              entityType: 'load',
              entityId: load.loadNumber,
              entityName: displayName,
              recommendation: 'Obtain and record BOL number for compliance documentation.',
              regulation: '49 CFR 373.101',
            });
            break; // One finding per load for BOL
          }
        }

        for (const stop of load.stops) {
          // Missing POD on delivery stops
          if (stop.actionType === 'delivery' && !stop.podSignatureUrl) {
            findings.push({
              category: 'LOADS',
              severity: 'WARNING',
              title: `Missing POD — Load ${displayName}`,
              description: 'Delivered load has a delivery stop without proof of delivery on file.',
              entityType: 'load',
              entityId: load.loadNumber,
              entityName: displayName,
              recommendation: 'Obtain signed POD for billing and compliance purposes.',
              regulation: 'Commercial best practice',
            });
            break; // One finding per load for POD
          }
        }

        // Unresolved damage or shortage on delivered stops
        for (const stop of load.stops) {
          if ((stop.damagedPieces && stop.damagedPieces > 0) || (stop.shortPieces && stop.shortPieces > 0)) {
            const issues: string[] = [];
            if (stop.damagedPieces && stop.damagedPieces > 0) issues.push(`${stop.damagedPieces} damaged`);
            if (stop.shortPieces && stop.shortPieces > 0) issues.push(`${stop.shortPieces} short`);
            findings.push({
              category: 'LOADS',
              severity: 'WARNING',
              title: `Unresolved damage/shortage — Load ${displayName}`,
              description: `Delivered load has ${issues.join(' and ')} pieces recorded at a stop.`,
              entityType: 'load',
              entityId: load.loadNumber,
              entityName: displayName,
              recommendation: 'Investigate and file claim if needed. Document resolution for audit trail.',
            });
            break; // One finding per load for damage
          }
        }
      }
    }

    const coverage: ShieldCoverageItem[] = [
      {
        check: 'Weight compliance (80k lbs)',
        regulation: '23 CFR 658.17',
        source: 'rule',
      },
      {
        check: 'Hazmat placarding',
        regulation: '49 CFR 172.504',
        source: 'rule',
      },
      {
        check: 'Hazmat UN identification',
        regulation: '49 CFR 172.301',
        source: 'rule',
      },
      {
        check: 'BOL documentation',
        regulation: '49 CFR 373.101',
        source: 'rule',
      },
      {
        check: 'Proof of delivery (POD)',
        regulation: 'Commercial best practice',
        source: 'rule',
      },
      {
        check: 'Documentation completeness',
        regulation: '49 CFR Part 373',
        source: 'ai',
      },
      {
        check: 'Cargo ↔ equipment validation',
        regulation: '49 CFR Part 393',
        source: 'ai',
      },
    ];

    return {
      category: 'LOADS',
      score: computeCategoryScore(findings),
      findings,
      coverage,
    };
  }

  async checkCrossEntity(tenantId: number): Promise<ShieldFindingInput[]> {
    const findings: ShieldFindingInput[] = [];

    // Hazmat endorsement ↔ load check (relay-aware: checks each leg's driver)
    const hazmatLoads = await this.prisma.load.findMany({
      where: {
        tenantId,
        hazmatClass: { not: null },
        status: {
          in: ['ASSIGNED', 'IN_TRANSIT'],
        },
      },
      select: {
        referenceNumber: true,
        loadNumber: true,
        hazmatClass: true,
        isRelay: true,
        driver: {
          select: {
            driverId: true,
            name: true,
            endorsements: true,
          },
        },
        legs: {
          where: { driverId: { not: null } },
          select: {
            legId: true,
            sequence: true,
            driver: {
              select: {
                driverId: true,
                name: true,
                endorsements: true,
              },
            },
          },
        },
      },
    });

    for (const load of hazmatLoads) {
      const displayName = load.referenceNumber || load.loadNumber || load.loadNumber;

      if (load.isRelay && load.legs.length > 0) {
        // Relay load: check each leg's driver for hazmat endorsement
        for (const leg of load.legs) {
          if (leg.driver && !leg.driver.endorsements?.includes('H')) {
            findings.push({
              category: 'DRIVERS',
              severity: 'CRITICAL',
              title: `Hazmat load without H endorsement — ${leg.driver.name} (Leg ${leg.sequence})`,
              description: `Driver is assigned to leg ${leg.sequence} of relay hazmat load ${displayName} (class ${load.hazmatClass}) but does not have an H endorsement on CDL.`,
              entityType: 'driver',
              entityId: leg.driver.driverId,
              entityName: leg.driver.name,
              impact: 'Fines up to $75,000. Immediate out-of-service.',
              recommendation: 'Reassign leg to a driver with hazmat endorsement.',
              regulation: '49 CFR 383.93',
            });
          }
        }
      } else if (load.driver && !load.driver.endorsements?.includes('H')) {
        // Standard load: check the load-level driver
        findings.push({
          category: 'DRIVERS',
          severity: 'CRITICAL',
          title: `Hazmat load without H endorsement — ${load.driver.name}`,
          description: `Driver is assigned to hazmat load ${displayName} (class ${load.hazmatClass}) but does not have an H endorsement on CDL.`,
          entityType: 'driver',
          entityId: load.driver.driverId,
          entityName: load.driver.name,
          impact: 'Fines up to $75,000. Immediate out-of-service.',
          recommendation: 'Reassign load to a driver with hazmat endorsement.',
          regulation: '49 CFR 383.93',
        });
      }
    }

    // ─── IFTA Compliance Checks ──────────────────────────────────────

    const now = new Date();

    // Check for unfiled past quarters
    const iftaQuarters = await this.prisma.iftaQuarter.findMany({
      where: { tenantId },
      orderBy: [{ year: 'desc' }, { quarter: 'desc' }],
      take: 8, // Last 2 years of quarters
    });

    for (const q of iftaQuarters) {
      // Calculate filing deadline: last day of month following quarter end
      const deadlineMonth = q.quarter * 3;
      const deadlineYear = q.quarter === 4 ? q.year + 1 : q.year;
      const adjustedMonth = q.quarter === 4 ? 0 : deadlineMonth;
      const deadline = new Date(deadlineYear, adjustedMonth + 1, 0);

      const isPastDeadline = now > deadline;
      const isFiled = ['FILED', 'CONFIRMED'].includes(q.status);

      if (isPastDeadline && !isFiled) {
        const daysOverdue = Math.ceil((now.getTime() - deadline.getTime()) / (1000 * 60 * 60 * 24));
        findings.push({
          category: 'LOADS',
          severity: 'CRITICAL',
          title: `Q${q.quarter} ${q.year} IFTA return is ${daysOverdue} days overdue`,
          description: `The IFTA filing deadline was ${deadline.toLocaleDateString()}. Late filings incur penalties and interest from state tax authorities.`,
          impact: 'Potential penalties, interest charges, and risk of IFTA license revocation.',
          recommendation: 'File the IFTA return immediately via IFTA → Quarters.',
          regulation: 'IFTA Articles of Agreement R1230',
        });
      }

      // Check for quarters with anomalies
      if (q.anomalyCount > 0 && !isFiled) {
        findings.push({
          category: 'LOADS',
          severity: 'WARNING',
          title: `${q.anomalyCount} data issue${q.anomalyCount > 1 ? 's' : ''} in Q${q.quarter} ${q.year} IFTA data`,
          description: 'IFTA quarter has unresolved anomalies that could trigger an audit.',
          recommendation: `Review anomalies in IFTA → Q${q.quarter} ${q.year} before filing.`,
          regulation: 'IFTA Articles of Agreement P530',
        });
      }
    }

    return findings;
  }
}
