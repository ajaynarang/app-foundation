import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { SallySuggestionsService, OpenSlot } from './sally-suggestions/sally-suggestions.service';
import {
  HorizonResponse,
  HorizonDriverRow,
  HorizonDayData,
  HorizonLoadBlock,
  HorizonUnavailBlock,
} from './horizon.types';
import { startOfWeek, endOfWeek, eachDayOfInterval, format, parseISO } from 'date-fns';

@Injectable()
export class HorizonService {
  private readonly logger = new Logger(HorizonService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sallySuggestions: SallySuggestionsService,
  ) {}

  async getHorizon(tenantId: number, weekOf: string): Promise<HorizonResponse> {
    const weekStart = startOfWeek(parseISO(weekOf), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(parseISO(weekOf), { weekStartsOn: 1 });
    const weekStartStr = format(weekStart, 'yyyy-MM-dd');
    const weekEndStr = format(weekEnd, 'yyyy-MM-dd');
    const days = eachDayOfInterval({ start: weekStart, end: weekEnd });
    const dayStrings = days.map((d) => format(d, 'yyyy-MM-dd'));

    const [drivers, loads, driverUnavails, vehicleUnavails] = await Promise.all([
      this.getActiveDrivers(tenantId),
      this.getLoadsInRange(tenantId, weekStart, weekEnd),
      this.getDriverUnavailabilities(tenantId, weekStart, weekEnd),
      this.getVehicleUnavailabilities(tenantId, weekStart, weekEnd),
    ]);

    const grid = this.buildGrid(drivers, loads, driverUnavails, vehicleUnavails, dayStrings);
    const stats = this.computeStats(grid, dayStrings);

    // Generate Sally suggestions from open slots
    const driverHomeMap = new Map<number, { city: string | null; state: string | null }>();
    for (const d of drivers) {
      driverHomeMap.set(d.id, {
        city: d.homeTerminalCity ?? null,
        state: d.homeTerminalState ?? null,
      });
    }
    const openSlots = this.extractOpenSlots(grid, dayStrings, driverHomeMap);
    const sallyInsight = await this.sallySuggestions.generate(tenantId, openSlots, weekStartStr, weekEndStr);
    stats.sallySuggestions = sallyInsight.suggestions.length;

    return {
      weekStart: weekStartStr,
      weekEnd: weekEndStr,
      drivers: grid,
      stats,
      sallyInsight: sallyInsight.suggestions.length > 0 || openSlots.length > 0 ? sallyInsight : null,
    };
  }

  private async getActiveDrivers(tenantId: number) {
    return this.prisma.driver.findMany({
      where: { tenantId, status: { in: ['ACTIVE', 'PENDING_ACTIVATION'] } },
      include: {
        assignedVehicle: {
          select: {
            id: true,
            vehicleId: true,
            unitNumber: true,
            equipmentType: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  private async getLoadsInRange(tenantId: number, weekStart: Date, weekEnd: Date) {
    return this.prisma.load.findMany({
      where: {
        tenantId,
        status: { notIn: ['CANCELLED', 'TONU'] },
        driverId: { not: null },
        pickupDate: { lte: weekEnd },
        deliveryDate: { gte: weekStart },
      },
      include: {
        customer: { select: { companyName: true } },
      },
    });
  }

  private async getDriverUnavailabilities(tenantId: number, weekStart: Date, weekEnd: Date) {
    return this.prisma.driverUnavailability.findMany({
      where: {
        tenantId,
        startDate: { lte: weekEnd },
        endDate: { gte: weekStart },
      },
    });
  }

  private async getVehicleUnavailabilities(tenantId: number, weekStart: Date, weekEnd: Date) {
    return this.prisma.vehicleUnavailability.findMany({
      where: {
        tenantId,
        startDate: { lte: weekEnd },
        endDate: { gte: weekStart },
      },
    });
  }

  private buildGrid(
    drivers: any[],
    loads: any[],
    driverUnavails: any[],
    vehicleUnavails: any[],
    dayStrings: string[],
  ): HorizonDriverRow[] {
    const loadsByDriver = new Map<number, any[]>();
    for (const load of loads) {
      const list = loadsByDriver.get(load.driverId) ?? [];
      list.push(load);
      loadsByDriver.set(load.driverId, list);
    }

    const driverUnavailByDriver = new Map<number, any[]>();
    for (const u of driverUnavails) {
      const list = driverUnavailByDriver.get(u.driverId) ?? [];
      list.push(u);
      driverUnavailByDriver.set(u.driverId, list);
    }

    const vehicleUnavailByVehicle = new Map<number, any[]>();
    for (const u of vehicleUnavails) {
      const list = vehicleUnavailByVehicle.get(u.vehicleId) ?? [];
      list.push(u);
      vehicleUnavailByVehicle.set(u.vehicleId, list);
    }

    return drivers.map((driver) => {
      const driverLoads = loadsByDriver.get(driver.id) ?? [];
      const driverUnavailList = driverUnavailByDriver.get(driver.id) ?? [];
      const vehicleId = driver.assignedVehicle?.id;
      const vehicleUnavailList = vehicleId ? (vehicleUnavailByVehicle.get(vehicleId) ?? []) : [];

      const nameParts = (driver.name || '').split(' ');
      const initials = nameParts
        .map((p: string) => p[0]?.toUpperCase() || '')
        .join('')
        .slice(0, 2);

      const daysMap: Record<string, HorizonDayData> = {};
      for (const dayStr of dayStrings) {
        // Place load on its pickup date only (frontend spans it)
        const dayLoads: HorizonLoadBlock[] = driverLoads
          .filter((load: any) => {
            const pickup = format(load.pickupDate, 'yyyy-MM-dd');
            return pickup === dayStr;
          })
          .map((load: any) => ({
            loadNumber: load.loadNumber,
            referenceNumber: load.referenceNumber ?? null,
            status: load.status,
            pickupDate: format(load.pickupDate, 'yyyy-MM-dd'),
            deliveryDate: format(load.deliveryDate, 'yyyy-MM-dd'),
            originCity: load.originCity,
            originState: load.originState,
            destinationCity: load.destinationCity,
            destinationState: load.destinationState,
            route: `${load.originCity} → ${load.destinationCity}`,
            customerName: load.customer?.companyName ?? null,
            requiredEquipmentType: load.requiredEquipmentType ?? null,
          }));

        // Use string comparison for date-only values (avoids timezone issues)
        const driverUnavail = driverUnavailList.find((u: any) => {
          const start = format(u.startDate, 'yyyy-MM-dd');
          const end = format(u.endDate, 'yyyy-MM-dd');
          return dayStr >= start && dayStr <= end;
        });

        const vehicleUnavail = vehicleUnavailList.find((u: any) => {
          const start = format(u.startDate, 'yyyy-MM-dd');
          const end = format(u.endDate, 'yyyy-MM-dd');
          return dayStr >= start && dayStr <= end;
        });

        daysMap[dayStr] = {
          loads: dayLoads,
          driverUnavailability: driverUnavail ? this.mapUnavailBlock(driverUnavail) : null,
          vehicleUnavailability: vehicleUnavail ? this.mapUnavailBlock(vehicleUnavail) : null,
        };
      }

      return {
        driverId: driver.id,
        driverStringId: driver.driverId,
        name: driver.name,
        initials,
        equipmentType: driver.assignedVehicle?.equipmentType ?? null,
        vehicleNumber: driver.assignedVehicle?.unitNumber ?? null,
        vehicleId: driver.assignedVehicle?.id ?? null,
        vehicleStringId: driver.assignedVehicle?.vehicleId ?? null,
        days: daysMap,
      };
    });
  }

  private mapUnavailBlock(u: any): HorizonUnavailBlock {
    return {
      id: u.id,
      type: u.type,
      startDate: format(u.startDate, 'yyyy-MM-dd'),
      endDate: format(u.endDate, 'yyyy-MM-dd'),
      note: u.note ?? null,
      createdById: u.createdById,
    };
  }

  private computeStats(grid: HorizonDriverRow[], dayStrings: string[]): HorizonResponse['stats'] {
    let driversLoaded = 0;
    let openDriverDays = 0;

    for (const driver of grid) {
      let hasLoad = false;
      for (const dayStr of dayStrings) {
        const day = driver.days[dayStr];
        const hasLoadOnDay = day.loads.length > 0;
        const isUnavailable = day.driverUnavailability !== null || day.vehicleUnavailability !== null;

        if (hasLoadOnDay) hasLoad = true;

        const isSpannedByLoad = this.isDaySpannedByLoad(dayStr, driver);

        if (!hasLoadOnDay && !isSpannedByLoad && !isUnavailable) {
          openDriverDays++;
        }
      }
      if (hasLoad) driversLoaded++;
    }

    return {
      driversLoaded,
      totalDrivers: grid.length,
      openDriverDays,
      sallySuggestions: 0,
    };
  }

  private isDaySpannedByLoad(dayStr: string, driver: HorizonDriverRow): boolean {
    for (const [, dayData] of Object.entries(driver.days)) {
      for (const load of dayData.loads) {
        if (dayStr >= load.pickupDate && dayStr <= load.deliveryDate) {
          return true;
        }
      }
    }
    return false;
  }

  private extractOpenSlots(
    grid: HorizonDriverRow[],
    dayStrings: string[],
    driverHomeMap: Map<number, { city: string | null; state: string | null }>,
  ): OpenSlot[] {
    const slots: OpenSlot[] = [];
    for (const driver of grid) {
      const home = driverHomeMap.get(driver.driverId);
      for (const dayStr of dayStrings) {
        const day = driver.days[dayStr];
        const hasLoad = day.loads.length > 0 || this.isDaySpannedByLoad(dayStr, driver);
        const isUnavailable = day.driverUnavailability !== null || day.vehicleUnavailability !== null;
        if (!hasLoad && !isUnavailable) {
          slots.push({
            driverId: driver.driverId,
            date: dayStr,
            driverCity: home?.city ?? null,
            driverState: home?.state ?? null,
            equipmentType: driver.equipmentType,
          });
        }
      }
    }
    return slots;
  }
}
