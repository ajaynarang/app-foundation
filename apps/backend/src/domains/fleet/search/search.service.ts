import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

// Loads get a higher cap than the shared per-type limit (see search()).
const MAX_LOAD_RESULTS = 20;

export interface SearchResult {
  type: 'load' | 'driver' | 'invoice' | 'customer' | 'settlement' | 'vehicle' | 'trip' | 'trailer' | 'lane';
  id: string;
  label: string;
  description: string;
  href: string;
  referenceNumber?: string;
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  private formatCents(cents: number): string {
    return (cents / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    });
  }

  private formatPeriod(start?: Date | null, end?: Date | null): string | null {
    if (!start || !end) return null;
    const month = (d: Date) => d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    const day = (d: Date) => d.getUTCDate();
    return month(start) === month(end)
      ? `${month(start)} ${day(start)}–${day(end)}`
      : `${month(start)} ${day(start)} – ${month(end)} ${day(end)}`;
  }

  async search(tenantDbId: number, query: string, limit: number): Promise<SearchResult[]> {
    if (query.length < 2) {
      return [];
    }

    // Loads are the highest-volume, most-searched entity, so they get extra
    // headroom over the shared per-type cap (reference data like drivers /
    // customers rarely has enough name matches to need it).
    const loadLimit = Math.min(limit * 2, MAX_LOAD_RESULTS);

    const [loads, drivers, invoices, customers, settlements, vehicles, trips, trailers, lanes] = await Promise.all([
      this.searchLoads(tenantDbId, query, loadLimit),
      this.searchDrivers(tenantDbId, query, limit),
      this.searchInvoices(tenantDbId, query, limit),
      this.searchCustomers(tenantDbId, query, limit),
      this.searchSettlements(tenantDbId, query, limit),
      this.searchVehicles(tenantDbId, query, limit),
      this.searchTrips(tenantDbId, query, limit),
      this.searchTrailers(tenantDbId, query, limit),
      this.searchRecurringLanes(tenantDbId, query, limit),
    ]);

    return [
      ...loads,
      ...drivers,
      ...invoices,
      ...customers,
      ...settlements,
      ...vehicles,
      ...trips,
      ...trailers,
      ...lanes,
    ];
  }

  private async searchLoads(tenantDbId: number, query: string, limit: number): Promise<SearchResult[]> {
    const loads = await this.prisma.load.findMany({
      where: {
        tenantId: tenantDbId,
        OR: [
          { loadNumber: { contains: query, mode: 'insensitive' } },
          { referenceNumber: { contains: query, mode: 'insensitive' } },
          { customerName: { contains: query, mode: 'insensitive' } },
          { originCity: { contains: query, mode: 'insensitive' } },
          { destinationCity: { contains: query, mode: 'insensitive' } },
          { driver: { name: { contains: query, mode: 'insensitive' } } },
        ],
      },
      select: {
        loadNumber: true,
        referenceNumber: true,
        status: true,
        customerName: true,
        originCity: true,
        originState: true,
        destinationCity: true,
        destinationState: true,
      },
      // Newest first — without this the DB returns oldest-by-PK, so a tenant
      // with lots of history fills the result cap with old DELIVERED loads and
      // never surfaces the recent Draft/Pending ones the dispatcher is after.
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return loads.map((load) => {
      const origin = load.originCity && load.originState ? `${load.originCity}, ${load.originState}` : null;
      const destination =
        load.destinationCity && load.destinationState ? `${load.destinationCity}, ${load.destinationState}` : null;
      const route = origin && destination ? `${origin} → ${destination}` : (origin ?? destination ?? null);
      const description = [load.customerName, route, load.status].filter(Boolean).join(' · ');

      const label = load.referenceNumber ? `${load.loadNumber} · Ref: ${load.referenceNumber}` : load.loadNumber;

      return {
        type: 'load' as const,
        id: load.loadNumber,
        label,
        description,
        href: `/dispatcher/loads?open=${load.loadNumber}`,
        referenceNumber: load.referenceNumber ?? undefined,
      };
    });
  }

  private async searchDrivers(tenantDbId: number, query: string, limit: number): Promise<SearchResult[]> {
    const drivers = await this.prisma.driver.findMany({
      where: {
        tenantId: tenantDbId,
        name: { contains: query, mode: 'insensitive' },
      },
      select: {
        driverId: true,
        name: true,
        status: true,
        assignedVehicle: { select: { unitNumber: true } },
      },
      take: limit,
    });

    return drivers.map((driver) => ({
      type: 'driver' as const,
      id: driver.driverId,
      label: driver.name,
      description: [driver.assignedVehicle ? `Unit ${driver.assignedVehicle.unitNumber}` : null, driver.status]
        .filter(Boolean)
        .join(' · '),
      href: `/dispatcher/fleet?open=${driver.driverId}`,
    }));
  }

  private async searchInvoices(tenantDbId: number, query: string, limit: number): Promise<SearchResult[]> {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId: tenantDbId,
        invoiceNumber: { contains: query, mode: 'insensitive' },
      },
      select: {
        invoiceNumber: true,
        totalCents: true,
        status: true,
        load: { select: { loadNumber: true, referenceNumber: true } },
        customer: { select: { companyName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return invoices.map((invoice) => {
      const loadRef = invoice.load
        ? `Load ${invoice.load.loadNumber}${invoice.load.referenceNumber ? ` (${invoice.load.referenceNumber})` : ''}`
        : null;
      const description = [loadRef, invoice.customer?.companyName, this.formatCents(invoice.totalCents), invoice.status]
        .filter(Boolean)
        .join(' · ');

      return {
        type: 'invoice' as const,
        id: invoice.invoiceNumber,
        label: invoice.invoiceNumber,
        description,
        href: `/dispatcher/billing?open=${invoice.invoiceNumber}`,
      };
    });
  }

  private async searchCustomers(tenantDbId: number, query: string, limit: number): Promise<SearchResult[]> {
    const customers = await this.prisma.customer.findMany({
      where: {
        tenantId: tenantDbId,
        companyName: { contains: query, mode: 'insensitive' },
      },
      select: {
        customerId: true,
        companyName: true,
        city: true,
        state: true,
        customerType: true,
      },
      take: limit,
    });

    return customers.map((customer) => {
      const location =
        customer.city && customer.state
          ? `${customer.city}, ${customer.state}`
          : (customer.city ?? customer.state ?? null);

      return {
        type: 'customer' as const,
        id: customer.customerId,
        label: customer.companyName,
        description: [location, customer.customerType].filter(Boolean).join(' · '),
        href: `/dispatcher/network?open=${customer.customerId}`,
      };
    });
  }

  private async searchSettlements(tenantDbId: number, query: string, limit: number): Promise<SearchResult[]> {
    const settlements = await this.prisma.settlement.findMany({
      where: {
        tenantId: tenantDbId,
        settlementNumber: { contains: query, mode: 'insensitive' },
      },
      select: {
        settlementNumber: true,
        status: true,
        netPayCents: true,
        periodStart: true,
        periodEnd: true,
        driver: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return settlements.map((settlement) => ({
      type: 'settlement' as const,
      id: settlement.settlementNumber,
      label: settlement.settlementNumber,
      description: [
        settlement.driver?.name,
        this.formatPeriod(settlement.periodStart, settlement.periodEnd),
        `${this.formatCents(settlement.netPayCents)} net`,
        settlement.status,
      ]
        .filter(Boolean)
        .join(' · '),
      href: `/dispatcher/pay?open=${settlement.settlementNumber}`,
    }));
  }

  private async searchVehicles(tenantDbId: number, query: string, limit: number): Promise<SearchResult[]> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        tenantId: tenantDbId,
        OR: [
          { unitNumber: { contains: query, mode: 'insensitive' } },
          { make: { contains: query, mode: 'insensitive' } },
          { model: { contains: query, mode: 'insensitive' } },
          { licensePlate: { contains: query, mode: 'insensitive' } },
          { vin: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: {
        vehicleId: true,
        unitNumber: true,
        year: true,
        make: true,
        model: true,
        status: true,
        assignedDriver: { select: { name: true } },
      },
      take: limit,
    });

    return vehicles.map((vehicle) => {
      const spec = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');
      return {
        type: 'vehicle' as const,
        id: vehicle.vehicleId,
        label: `Unit ${vehicle.unitNumber}`,
        description: [spec || null, vehicle.assignedDriver?.name, vehicle.status].filter(Boolean).join(' · '),
        href: `/dispatcher/fleet?open=${vehicle.vehicleId}`,
      };
    });
  }

  private async searchTrips(tenantDbId: number, query: string, limit: number): Promise<SearchResult[]> {
    const trips = await this.prisma.trip.findMany({
      where: {
        tenantId: tenantDbId,
        tripId: { contains: query, mode: 'insensitive' },
      },
      select: {
        tripId: true,
        status: true,
        loadCount: true,
        driver: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return trips.map((trip) => ({
      type: 'trip' as const,
      id: trip.tripId,
      label: trip.tripId,
      description: [trip.driver?.name, `${trip.loadCount} loads`, trip.status].filter(Boolean).join(' · '),
      href: `/dispatcher/loads?openTrip=${trip.tripId}`,
    }));
  }

  private async searchTrailers(tenantDbId: number, query: string, limit: number): Promise<SearchResult[]> {
    const trailers = await this.prisma.trailer.findMany({
      where: {
        tenantId: tenantDbId,
        OR: [
          { unitNumber: { contains: query, mode: 'insensitive' } },
          { make: { contains: query, mode: 'insensitive' } },
          { model: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: {
        trailerId: true,
        unitNumber: true,
        equipmentType: true,
        status: true,
      },
      take: limit,
    });

    return trailers.map((trailer) => ({
      type: 'trailer' as const,
      id: trailer.unitNumber,
      label: trailer.unitNumber,
      description: [trailer.equipmentType, trailer.status].filter(Boolean).join(' · '),
      href: `/dispatcher/fleet?openTrailer=${trailer.trailerId}`,
    }));
  }

  private async searchRecurringLanes(tenantDbId: number, query: string, limit: number): Promise<SearchResult[]> {
    const lanes = await this.prisma.recurringLane.findMany({
      where: {
        tenantId: tenantDbId,
        deletedAt: null,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { laneId: { contains: query, mode: 'insensitive' } },
          { customerName: { contains: query, mode: 'insensitive' } },
          { originCity: { contains: query, mode: 'insensitive' } },
          { destinationCity: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: {
        laneId: true,
        name: true,
        commodityType: true,
        rateCents: true,
        status: true,
        originCity: true,
        originState: true,
        destinationCity: true,
        destinationState: true,
      },
      take: limit,
    });

    return lanes.map((lane) => {
      const origin =
        lane.originCity && lane.originState ? `${lane.originCity}, ${lane.originState}` : (lane.originCity ?? null);
      const destination =
        lane.destinationCity && lane.destinationState
          ? `${lane.destinationCity}, ${lane.destinationState}`
          : (lane.destinationCity ?? null);
      const route = origin && destination ? `${origin} → ${destination}` : (origin ?? destination ?? null);

      return {
        type: 'lane' as const,
        id: lane.name,
        label: lane.name,
        description: [
          route,
          lane.commodityType,
          lane.rateCents != null ? this.formatCents(lane.rateCents) : null,
          lane.status,
        ]
          .filter(Boolean)
          .join(' · '),
        href: `/dispatcher/loads?openLane=${lane.laneId}`,
      };
    });
  }
}
