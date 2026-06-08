import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { HOS_CONSTANTS } from '@sally/shared-types';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';
import { buildKey } from '../../../../infrastructure/cache/cache-key.constants';
import { CACHE_TTL_WARM_2M } from '../../../../constants/cache.constants';
import { DispatchBoardResponseDto, DispatchBoardDriverDto, DispatchDriverStatus } from '../dto/dispatch-board.types';
import { sortActiveLoads } from '../utils/sort-active-loads';

const MAX_DRIVE_HOURS = HOS_CONSTANTS.MAX_DRIVE_HOURS;
const MAX_DUTY_HOURS = HOS_CONSTANTS.MAX_DUTY_HOURS;
const MAX_CYCLE_HOURS = HOS_CONSTANTS.MAX_CYCLE_HOURS;
const MAX_BREAK_HOURS = HOS_CONSTANTS.BREAK_TRIGGER_HOURS;
const HOS_CRITICAL_THRESHOLD = 2;

type DriverWithLoads = Prisma.DriverGetPayload<{
  include: {
    loads: {
      include: {
        vehicle: {
          select: { unitNumber: true; equipmentType: true };
        };
      };
    };
  };
}>;

interface DispatchBoardFilters {
  filter?: 'all' | 'available' | 'onLoad' | 'hosCritical';
  search?: string;
  sortBy?: 'name' | 'hosRemaining' | 'status';
  sortOrder?: 'asc' | 'desc';
}

@Injectable()
export class DispatchBoardService {
  private readonly logger = new Logger(DispatchBoardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: SallyCacheService,
  ) {}

  async getDispatchBoard(tenantId: number, filters: DispatchBoardFilters): Promise<DispatchBoardResponseDto> {
    const { filter = 'all', search, sortBy = 'name', sortOrder = 'asc' } = filters;

    // Cache the unfiltered board data; apply filters/sort/search after
    const cacheKey = buildKey('sally:dispatch', 'board', tenantId);
    const { drivers: allDrivers, summary } = await this.cache.getOrSet(
      cacheKey,
      async () => {
        const today = new Date();
        const [rawDrivers, todayUnavails] = await Promise.all([
          this.prisma.driver.findMany({
            where: {
              tenantId,
              status: { in: ['ACTIVE', 'PENDING_ACTIVATION'] },
            },
            include: {
              loads: {
                where: {
                  status: { in: ['ASSIGNED', 'IN_TRANSIT'] },
                  isActive: true,
                },
                include: {
                  vehicle: {
                    select: { unitNumber: true, equipmentType: true },
                  },
                },
                orderBy: { createdAt: 'asc' },
              },
            },
            orderBy: { name: 'asc' },
          }),
          this.prisma.driverUnavailability.findMany({
            where: {
              tenantId,
              startDate: { lte: today },
              endDate: { gte: today },
            },
          }),
        ]);

        // Index unavailabilities by driverId
        const unavailByDriver = new Map<number, { type: string; startDate: Date; endDate: Date }>();
        for (const u of todayUnavails) {
          unavailByDriver.set(u.driverId, {
            type: u.type,
            startDate: u.startDate,
            endDate: u.endDate,
          });
        }

        // Map to DTOs
        const mapped: DispatchBoardDriverDto[] = rawDrivers.map((driver) => {
          const sortedLoads = sortActiveLoads(driver.loads);
          const primaryLoad = sortedLoads[0] || null;
          const queuedLoadCount = Math.max(0, sortedLoads.length - 1);
          const driverUnavail = unavailByDriver.get(driver.id);
          const status = this.deriveStatus(driver, !!driverUnavail);
          const hos = this.computeHOS(driver);
          const location = this.deriveLocation(driver);

          return {
            driverId: driver.driverId,
            name: driver.name,
            phone: driver.phone || null,
            status,
            unavailability: driverUnavail
              ? {
                  type: driverUnavail.type,
                  startDate: driverUnavail.startDate.toISOString().slice(0, 10),
                  endDate: driverUnavail.endDate.toISOString().slice(0, 10),
                }
              : null,
            vehicle: primaryLoad?.vehicle
              ? {
                  unitNumber: primaryLoad.vehicle.unitNumber,
                  equipmentType: String(primaryLoad.vehicle.equipmentType),
                }
              : null,
            currentLoad: primaryLoad
              ? {
                  loadNumber: primaryLoad.loadNumber,
                  customerName: primaryLoad.customerName,
                  status: primaryLoad.status,
                  origin: [primaryLoad.originCity, primaryLoad.originState].filter(Boolean).join(', '),
                  destination: [primaryLoad.destinationCity, primaryLoad.destinationState].filter(Boolean).join(', '),
                }
              : null,
            queuedLoadCount,
            hos,
            location,
          };
        });

        // Compute summary from ALL drivers (before filtering)
        const computedSummary = {
          total: mapped.length,
          onLoad: mapped.filter((d) => d.status === 'onLoad').length,
          available: mapped.filter((d) => d.status === 'available').length,
          unavailable: mapped.filter((d) => d.status === 'unavailable').length,
          hosCritical: mapped.filter((d) => d.hos?.isCritical).length,
        };

        return { drivers: mapped, summary: computedSummary };
      },
      CACHE_TTL_WARM_2M,
    );

    let drivers = [...allDrivers];

    // Apply filters
    if (filter !== 'all') {
      if (filter === 'hosCritical') {
        drivers = drivers.filter((d) => d.hos?.isCritical);
      } else {
        drivers = drivers.filter((d) => d.status === filter);
      }
    }

    // Apply search
    if (search) {
      const term = search.toLowerCase();
      drivers = drivers.filter((d) => {
        return (
          d.name.toLowerCase().includes(term) ||
          (d.vehicle?.unitNumber && d.vehicle.unitNumber.toLowerCase().includes(term)) ||
          (d.currentLoad?.loadNumber && d.currentLoad.loadNumber.toLowerCase().includes(term)) ||
          (d.currentLoad?.customerName && d.currentLoad.customerName.toLowerCase().includes(term))
        );
      });
    }

    // Apply sorting
    drivers = this.sortDrivers(drivers, sortBy, sortOrder);

    return { drivers, summary };
  }

  private deriveStatus(driver: DriverWithLoads, isUnavailable = false): DispatchDriverStatus {
    if (driver.loads.length > 0) return 'onLoad';
    if (isUnavailable) return 'unavailable';
    return 'available';
  }

  private computeHOS(driver: DriverWithLoads): DispatchBoardDriverDto['hos'] {
    if (!driver.hosDataSyncedAt && driver.currentHoursDriven === 0 && driver.currentOnDutyTime === 0) {
      return null;
    }

    const driveRemaining = Math.max(0, MAX_DRIVE_HOURS - driver.currentHoursDriven);
    const dutyRemaining = Math.max(0, MAX_DUTY_HOURS - driver.currentOnDutyTime);
    const cycleRemaining = Math.max(0, MAX_CYCLE_HOURS - driver.cycleHoursUsed);
    const breakRemaining = Math.max(0, MAX_BREAK_HOURS - (driver.currentHoursSinceBreak ?? 0));

    const dataAgeMinutes = driver.hosDataSyncedAt
      ? Math.round((Date.now() - new Date(driver.hosDataSyncedAt).getTime()) / 60000)
      : null;

    return {
      driveRemainingHours: driveRemaining,
      dutyRemainingHours: dutyRemaining,
      cycleRemainingHours: cycleRemaining,
      breakRemainingHours: breakRemaining,
      isCritical:
        driveRemaining < HOS_CRITICAL_THRESHOLD ||
        dutyRemaining < HOS_CRITICAL_THRESHOLD ||
        cycleRemaining < HOS_CRITICAL_THRESHOLD ||
        breakRemaining < HOS_CRITICAL_THRESHOLD,
      dataAgeMinutes: dataAgeMinutes,
    };
  }

  private deriveLocation(driver: DriverWithLoads): DispatchBoardDriverDto['location'] {
    if (driver.homeTerminalCity && driver.homeTerminalState) {
      return {
        city: driver.homeTerminalCity,
        state: driver.homeTerminalState,
      };
    }
    return null;
  }

  private sortDrivers(drivers: DispatchBoardDriverDto[], sortBy: string, sortOrder: string): DispatchBoardDriverDto[] {
    const multiplier = sortOrder === 'desc' ? -1 : 1;

    return [...drivers].sort((a, b) => {
      switch (sortBy) {
        case 'hosRemaining': {
          const aHos = a.hos?.driveRemainingHours ?? Infinity;
          const bHos = b.hos?.driveRemainingHours ?? Infinity;
          return (aHos - bHos) * multiplier;
        }
        case 'status': {
          const order: Record<string, number> = {
            onLoad: 0,
            available: 1,
          };
          return ((order[a.status] ?? 3) - (order[b.status] ?? 3)) * multiplier;
        }
        case 'name':
        default:
          return a.name.localeCompare(b.name) * multiplier;
      }
    });
  }
}
