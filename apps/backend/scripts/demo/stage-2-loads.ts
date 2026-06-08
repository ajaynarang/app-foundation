/**
 * Stage 2 — Load Generation (60-Day Rolling Window)
 *
 * Generates ~80 loads distributed across 5 time periods with realistic
 * statuses, stops, charges, and documents.
 */
import { PrismaClient, LoadBillingStatus, LoadStopStatus, DocumentStatus } from '@prisma/client';
import { DEMO_TENANT_ID, DEMO_CUSTOMERS, DEMO_LANES } from './config';
import { DemoLogger } from './helpers/logger';
import {
  createRng,
  randomInt,
  randomElement,
  generateLoadNumber,
  generatePoNumber,
  generateBolNumber,
  weightedRandomIndex,
} from './helpers/generators';
import { getAddress } from './helpers/address-data';
import { daysAgo, daysFromNow, randomDate, addHours, addMinutes } from './helpers/date-utils';

// ---------------------------------------------------------------------------
// Types & Constants
// ---------------------------------------------------------------------------

type LoadStatus = 'PENDING' | 'ASSIGNED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED' | 'TONU' | 'ON_HOLD';

interface PeriodDef {
  label: string;
  startDaysAgo: number;
  endDaysAgo: number;
  count: number;
  statuses: LoadStatus[];
  statusWeights: number[];
}

const PERIODS: PeriodDef[] = [
  {
    label: 'Month 1 (60-31 days ago)',
    startDaysAgo: 60,
    endDaysAgo: 31,
    count: 30,
    statuses: ['DELIVERED'],
    statusWeights: [1],
  },
  {
    label: 'Weeks 3-4 (30-15 days ago)',
    startDaysAgo: 30,
    endDaysAgo: 15,
    count: 20,
    statuses: ['DELIVERED'],
    statusWeights: [1],
  },
  {
    label: 'Last 2 weeks (14-3 days ago)',
    startDaysAgo: 14,
    endDaysAgo: 3,
    count: 15,
    statuses: ['DELIVERED', 'IN_TRANSIT'],
    statusWeights: [70, 30],
  },
  {
    label: 'This week (2-0 days ago)',
    startDaysAgo: 2,
    endDaysAgo: 0,
    count: 10,
    statuses: ['IN_TRANSIT', 'ASSIGNED', 'PENDING'],
    statusWeights: [50, 30, 20],
  },
  {
    label: 'Upcoming (+1 to +3)',
    startDaysAgo: -3,
    endDaysAgo: -1,
    count: 5,
    statuses: ['PENDING'],
    statusWeights: [1],
  },
];

const COMMODITIES_BY_EQUIPMENT: Record<string, string[]> = {
  DRY_VAN: ['General Freight', 'Packaged Foods', 'Consumer Goods', 'Paper Products', 'Beverages'],
  REEFER: ['Frozen Seafood', 'Fresh Produce', 'Dairy Products', 'Frozen Foods'],
  FLATBED: ['Lumber', 'Steel Beams', 'Construction Materials', 'Industrial Equipment'],
};

// Problem load indices (within global sequence)
const PROBLEM_DETENTION = 5;
const PROBLEM_MISSED_APPT = 12;
const PROBLEM_TONU = 18;
const PROBLEM_ON_HOLD = 25;
const PROBLEM_SHORT_PIECES = 35;
const PROBLEM_LATE_DELIVERY = 42;

// ---------------------------------------------------------------------------
// run()
// ---------------------------------------------------------------------------

export async function run(prisma: PrismaClient, logger: DemoLogger): Promise<void> {
  const rng = createRng('stage-2-loads');

  // Resolve demo tenant
  const tenant = await prisma.tenant.findUnique({
    where: { tenantId: DEMO_TENANT_ID },
  });
  if (!tenant) {
    throw new Error('Demo tenant not found — run Stage 0 first.');
  }
  const tenantIntId = tenant.id;

  // Load drivers and vehicles
  const drivers = await prisma.driver.findMany({
    where: { tenantId: tenantIntId, externalDriverId: { not: null } },
  });
  if (drivers.length === 0) {
    throw new Error('No Samsara drivers found — run Stage 1 first.');
  }

  const vehicles = await prisma.vehicle.findMany({
    where: { tenantId: tenantIntId, externalVehicleId: { not: null } },
  });

  // Load customers
  const customers = await prisma.customer.findMany({
    where: { tenantId: tenantIntId },
  });
  if (customers.length === 0) {
    throw new Error('No customers found — run Stage 1 first.');
  }

  // Check for existing loads to support idempotency
  const existingLoadCount = await prisma.load.count({
    where: { tenantId: tenantIntId },
  });
  if (existingLoadCount > 0) {
    logger.item('Loads', `${existingLoadCount} already exist — skipping generation`, 'skip');
    return;
  }

  // Track active loads per driver (max 2)
  const activeLoadsByDriver: Record<number, number> = {};
  for (const d of drivers) {
    activeLoadsByDriver[d.id] = 0;
  }

  let globalSeq = 0;
  let totalLoads = 0;
  let totalStops = 0;
  let totalCharges = 0;
  let totalDocs = 0;

  for (const period of PERIODS) {
    const periodStart = period.startDaysAgo >= 0 ? daysAgo(period.startDaysAgo) : daysFromNow(-period.startDaysAgo);
    const periodEnd = period.endDaysAgo >= 0 ? daysAgo(period.endDaysAgo) : daysFromNow(-period.endDaysAgo);

    for (let i = 0; i < period.count; i++) {
      const seq = globalSeq++;
      const loadNumber = generateLoadNumber(seq);

      // Pick lane, customer, driver, vehicle
      const lane = DEMO_LANES[seq % DEMO_LANES.length];
      const customerIndex = seq % customers.length;
      const customer = customers[customerIndex];
      const custConfig = DEMO_CUSTOMERS[customerIndex % DEMO_CUSTOMERS.length];

      // Round-robin driver assignment with slight weighting
      const driverWeights = drivers.map((d) => {
        const active = activeLoadsByDriver[d.id] || 0;
        return active >= 2 ? 0.1 : 3 - active;
      });
      const driverIdx = weightedRandomIndex(driverWeights, rng);
      const driver = drivers[driverIdx];
      const vehicle = vehicles.length > 0 ? vehicles[driverIdx % vehicles.length] : null;

      // Determine status
      let status: LoadStatus;
      const statusIdx = weightedRandomIndex(period.statusWeights, rng);
      status = period.statuses[statusIdx];

      // Override for problem loads
      if (seq === PROBLEM_TONU) status = 'TONU';
      if (seq === PROBLEM_ON_HOLD) status = 'ON_HOLD';

      // Equipment and commodity
      const equipmentType = lane.equipment;
      const commodities = COMMODITIES_BY_EQUIPMENT[equipmentType] ?? COMMODITIES_BY_EQUIPMENT['DRY_VAN'];
      const commodity = randomElement(commodities, rng);

      // Rate
      const rateCents = randomInt(lane.minRate, lane.maxRate, rng);

      // Reference number (customer PO)
      const referenceNumber = generatePoNumber(custConfig.poFormat, rng);

      // Timestamps
      const createdAt = randomDate(periodStart, periodEnd, rng);
      let assignedAt: Date | null = null;
      let inTransitAt: Date | null = null;
      let deliveredAt: Date | null = null;
      let cancelledAt: Date | null = null;
      let onHoldAt: Date | null = null;
      let tonuAt: Date | null = null;
      let billingStatus: string | null = null;

      if (status === 'ASSIGNED' || status === 'IN_TRANSIT' || status === 'DELIVERED' || status === 'ON_HOLD') {
        assignedAt = addHours(createdAt, randomInt(1, 4, rng));
      }
      if (status === 'IN_TRANSIT' || status === 'DELIVERED') {
        inTransitAt = addHours(assignedAt!, randomInt(2, 12, rng));
      }
      if (status === 'DELIVERED') {
        // Transit time based on miles
        const transitHours = Math.max(2, Math.round(lane.miles / 45));
        deliveredAt = addHours(inTransitAt!, transitHours + randomInt(0, 3, rng));
        billingStatus = 'PENDING_DOCUMENTS';
      }
      if (status === 'TONU') {
        cancelledAt = addHours(createdAt, randomInt(1, 6, rng));
        tonuAt = cancelledAt;
        status = 'TONU';
      }
      if (status === 'ON_HOLD') {
        assignedAt = addHours(createdAt, 2);
        inTransitAt = addHours(assignedAt, 4);
        deliveredAt = addHours(inTransitAt, Math.round(lane.miles / 45));
        onHoldAt = addHours(deliveredAt, randomInt(1, 24, rng));
        billingStatus = null;
      }

      // Track active loads
      if (status === 'ASSIGNED' || status === 'IN_TRANSIT') {
        activeLoadsByDriver[driver.id] = (activeLoadsByDriver[driver.id] || 0) + 1;
      }

      // Origin/destination parsing
      const originParts = lane.origin.split(', ');
      const destParts = lane.destination.split(', ');

      // Weight and pieces
      const weightLbs = randomInt(20000, 44000, rng);
      const pieces = randomInt(10, 30, rng);

      // Create load
      const load = await prisma.load.create({
        data: {
          loadNumber,
          status: status === 'ON_HOLD' ? 'ON_HOLD' : status,
          weightLbs,
          commodityType: commodity,
          customerName: customer.companyName,
          referenceNumber,
          rateCents,
          billingStatus: billingStatus as LoadBillingStatus,
          pieces,
          isActive: status !== 'TONU',
          requiredEquipmentType: equipmentType as any,
          intakeSource: 'manual',
          customerId: customer.id,
          driverId: status !== 'PENDING' ? driver.id : null,
          vehicleId: status !== 'PENDING' && vehicle ? vehicle.id : null,
          pickupDate: assignedAt ?? createdAt,
          deliveryDate: deliveredAt ?? (inTransitAt ? addHours(inTransitAt, Math.round(lane.miles / 45)) : null),
          originCity: originParts[0],
          originState: originParts[1],
          destinationCity: destParts[0],
          destinationState: destParts[1],
          estimatedMiles: lane.miles,
          assignedAt,
          inTransitAt,
          deliveredAt,
          cancelledAt,
          onHoldAt,
          onHoldReason: status === 'ON_HOLD' ? 'Customer billing dispute — pending resolution' : null,
          tonuAt,
          tonuReason: status === 'TONU' ? 'Shipper cancelled load at pickup — truck ordered not used' : null,
          tenantId: tenantIntId,
          createdAt,
        },
      });
      totalLoads++;

      // -------------------------------------------------------------------
      // Create LoadStop records (pickup + delivery)
      // -------------------------------------------------------------------

      const pickupAddr = getAddress(lane.origin, rng);
      const deliveryAddr = getAddress(lane.destination, rng);

      // Find or create Stop records
      const pickupStop = await findOrCreateStop(
        prisma,
        pickupAddr,
        lane.origin,
        tenantIntId,
        `load_${loadNumber}_pickup`,
        rng,
      );
      const deliveryStop = await findOrCreateStop(
        prisma,
        deliveryAddr,
        lane.destination,
        tenantIntId,
        `load_${loadNumber}_delivery`,
        rng,
      );

      // Pickup stop timestamps
      const pickupCreatedAt = assignedAt ?? createdAt;
      const pickupArrivedAt = inTransitAt ? addHours(inTransitAt, -1.5) : null;
      const pickupDockInAt = pickupArrivedAt ? addMinutes(pickupArrivedAt, randomInt(10, 30, rng)) : null;
      const pickupDepartedAt = inTransitAt ?? null;

      // Problem: detention at pickup
      let pickupDockHours = 1.5;
      let pickupDetentionMinutes: number | null = null;
      let pickupDetentionStartedAt: Date | null = null;
      if (seq === PROBLEM_DETENTION && pickupArrivedAt) {
        pickupDockHours = 4.0;
        pickupDetentionMinutes = 150; // 2.5 hr detention (after 2hr free)
        pickupDetentionStartedAt = addHours(pickupArrivedAt, 2);
      }

      // Problem: missed appointment
      let pickupDriverNotes: string | null = null;
      if (seq === PROBLEM_MISSED_APPT) {
        pickupDriverNotes = 'Arrived 2 hours late due to traffic on I-95. Facility contact notified.';
      }

      const isPickupCompleted = status === 'IN_TRANSIT' || status === 'DELIVERED' || status === 'ON_HOLD';

      await prisma.loadStop.create({
        data: {
          loadId: load.id,
          stopId: pickupStop.id,
          sequenceOrder: 0,
          actionType: 'pickup',
          appointmentDate: assignedAt ?? createdAt,
          earliestArrival: '06:00',
          latestArrival: '10:00',
          estimatedDockHours: pickupDockHours,
          actualDockHours: isPickupCompleted ? pickupDockHours : null,
          status: isPickupCompleted ? LoadStopStatus.COMPLETED : LoadStopStatus.PENDING,
          arrivedAt: pickupArrivedAt,
          dockInAt: pickupDockInAt,
          loadingStartedAt: pickupDockInAt,
          loadingCompletedAt: pickupDepartedAt ? addMinutes(pickupDepartedAt, -15) : null,
          departedAt: pickupDepartedAt,
          completedAt: pickupDepartedAt,
          dockNumber: isPickupCompleted ? `D${randomInt(1, 12, rng)}` : null,
          bolNumber: isPickupCompleted ? generateBolNumber(loadNumber, 0) : null,
          sealNumber: isPickupCompleted ? `SL-${randomInt(10000, 99999, rng)}` : null,
          actualWeight: isPickupCompleted ? weightLbs : null,
          actualPieces: isPickupCompleted ? pieces : null,
          detentionMinutes: pickupDetentionMinutes,
          detentionStartedAt: pickupDetentionStartedAt,
          driverNotes: pickupDriverNotes,
        },
      });
      totalStops++;

      // Delivery stop timestamps
      const isDelivered = status === 'DELIVERED' || status === 'ON_HOLD';
      const deliveryArrivedAt = isDelivered && deliveredAt ? addHours(deliveredAt, -1) : null;
      const deliveryDockInAt = deliveryArrivedAt ? addMinutes(deliveryArrivedAt, randomInt(10, 20, rng)) : null;

      // Problem: short pieces
      let deliveryShortPieces: number | null = null;
      let deliveryDriverNotes: string | null = null;
      if (seq === PROBLEM_SHORT_PIECES && isDelivered) {
        deliveryShortPieces = randomInt(2, 5, rng);
        deliveryDriverNotes = `Receiver noted ${deliveryShortPieces} pieces short. Photos taken.`;
      }

      // Problem: late delivery
      if (seq === PROBLEM_LATE_DELIVERY && isDelivered) {
        deliveryDriverNotes = 'Arrived 3 hours past appointment window due to breakdown on I-84.';
      }

      await prisma.loadStop.create({
        data: {
          loadId: load.id,
          stopId: deliveryStop.id,
          sequenceOrder: 1,
          actionType: 'delivery',
          appointmentDate: deliveredAt ?? (assignedAt ? addHours(assignedAt, Math.round(lane.miles / 45) + 4) : null),
          earliestArrival: '08:00',
          latestArrival: '16:00',
          estimatedDockHours: 1.0,
          actualDockHours: isDelivered ? 1.0 : null,
          status: isDelivered ? LoadStopStatus.COMPLETED : LoadStopStatus.PENDING,
          arrivedAt: deliveryArrivedAt,
          dockInAt: deliveryDockInAt,
          loadingStartedAt: deliveryDockInAt,
          loadingCompletedAt: isDelivered ? deliveredAt : null,
          departedAt: isDelivered ? addMinutes(deliveredAt!, 15) : null,
          completedAt: isDelivered ? deliveredAt : null,
          dockNumber: isDelivered ? `D${randomInt(1, 8, rng)}` : null,
          podSignatureUrl: isDelivered ? `https://demo-assets.sally.app/pods/${loadNumber}-pod.png` : null,
          podSignedBy: isDelivered
            ? `${['Mike', 'Sarah', 'John', 'Lisa', 'Dave'][randomInt(0, 4, rng)]} at Receiving`
            : null,
          podSignedAt: isDelivered ? deliveredAt : null,
          actualWeight: isDelivered ? weightLbs : null,
          actualPieces: isDelivered ? (deliveryShortPieces ? pieces - deliveryShortPieces : pieces) : null,
          shortPieces: deliveryShortPieces,
          driverNotes: deliveryDriverNotes,
        },
      });
      totalStops++;

      // -------------------------------------------------------------------
      // Create LoadCharge records
      // -------------------------------------------------------------------

      if (status !== 'PENDING') {
        // LINEHAUL — always (revenue: billed to customer)
        await prisma.loadCharge.create({
          data: {
            loadId: load.id,
            chargeType: 'linehaul',
            description: `Line haul — ${lane.origin} to ${lane.destination}`,
            quantity: 1,
            unitPriceCents: rateCents,
            totalCents: rateCents,
            isBillable: true,
            isPayable: false,
          },
        });
        totalCharges++;

        // FUEL_SURCHARGE — always (revenue: 18-22% of linehaul)
        const fuelPct = 18 + rng() * 4;
        const fuelCents = Math.round((rateCents * fuelPct) / 100);
        await prisma.loadCharge.create({
          data: {
            loadId: load.id,
            chargeType: 'fuel_surcharge',
            description: `Fuel surcharge (${fuelPct.toFixed(1)}%)`,
            quantity: 1,
            unitPriceCents: fuelCents,
            totalCents: fuelCents,
            isBillable: true,
            isPayable: false,
          },
        });
        totalCharges++;

        // DETENTION — if problem load or dock time > 2hr (revenue: billed to customer)
        if (seq === PROBLEM_DETENTION) {
          const detentionHours = 2.5;
          const detentionCents = Math.round(detentionHours * 7500); // $75/hr
          await prisma.loadCharge.create({
            data: {
              loadId: load.id,
              chargeType: 'detention_pickup',
              description: `Detention at pickup — ${detentionHours} hours`,
              quantity: detentionHours,
              unitPriceCents: 7500,
              totalCents: detentionCents,
              isBillable: true,
              isPayable: false,
            },
          });
          totalCharges++;
        }

        // LUMPER — ~20% of loads (both: paid to lumper AND billed back to customer)
        if (rng() < 0.2) {
          const lumperCents = randomInt(15000, 35000, rng);
          await prisma.loadCharge.create({
            data: {
              loadId: load.id,
              chargeType: 'lumper',
              description: 'Lumper fee at delivery',
              quantity: 1,
              unitPriceCents: lumperCents,
              totalCents: lumperCents,
              isBillable: true,
              isPayable: true,
            },
          });
          totalCharges++;
        }

        // LAYOVER — ~5% of loads, $250 flat (revenue: billed to customer)
        if (rng() < 0.05) {
          await prisma.loadCharge.create({
            data: {
              loadId: load.id,
              chargeType: 'layover',
              description: 'Layover — overnight wait at facility',
              quantity: 1,
              unitPriceCents: 25000,
              totalCents: 25000,
              isBillable: true,
              isPayable: false,
            },
          });
          totalCharges++;
        }

        // TONU — cancelled loads (revenue: cancellation fee billed to customer)
        if (status === 'TONU') {
          await prisma.loadCharge.create({
            data: {
              loadId: load.id,
              chargeType: 'tonu',
              description: 'Truck ordered not used — shipper cancellation',
              quantity: 1,
              unitPriceCents: 35000,
              totalCents: 35000,
              isBillable: true,
              isPayable: false,
            },
          });
          totalCharges++;
        }

        // ACCESSORIAL / Liftgate — ~10% of loads (revenue: billed to customer)
        if (rng() < 0.1) {
          await prisma.loadCharge.create({
            data: {
              loadId: load.id,
              chargeType: 'accessorial',
              description: 'Liftgate service at delivery',
              quantity: 1,
              unitPriceCents: 7500,
              totalCents: 7500,
              isBillable: true,
              isPayable: false,
            },
          });
          totalCharges++;
        }
      }

      // -------------------------------------------------------------------
      // Create Document records (BOL + POD for delivered loads)
      // -------------------------------------------------------------------

      if (isDelivered) {
        await prisma.document.create({
          data: {
            entityType: 'load',
            entityId: load.id,
            documentType: 'BOL',
            fileName: `${loadNumber}-BOL.pdf`,
            fileUrl: `https://demo-assets.sally.app/docs/${loadNumber}-BOL.pdf`,
            fileSize: randomInt(50000, 200000, rng),
            mimeType: 'application/pdf',
            tenantId: tenantIntId,
            status: DocumentStatus.CONFIRMED,
            description: `Bill of Lading for ${loadNumber}`,
          },
        });
        totalDocs++;

        await prisma.document.create({
          data: {
            entityType: 'load',
            entityId: load.id,
            documentType: 'POD',
            fileName: `${loadNumber}-POD.pdf`,
            fileUrl: `https://demo-assets.sally.app/docs/${loadNumber}-POD.pdf`,
            fileSize: randomInt(80000, 300000, rng),
            mimeType: 'application/pdf',
            tenantId: tenantIntId,
            status: DocumentStatus.CONFIRMED,
            description: `Proof of Delivery for ${loadNumber}`,
          },
        });
        totalDocs++;
      }
    }

    logger.item(period.label, `${period.count} loads generated`);
  }

  logger.item('Total loads', `${totalLoads}`);
  logger.item('Total stops', `${totalStops}`);
  logger.item('Total charges', `${totalCharges}`);
  logger.item('Total documents', `${totalDocs}`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function findOrCreateStop(
  prisma: PrismaClient,
  addr: { address: string; city: string; state: string; zip: string; lat: number; lng: number },
  cityKey: string,
  tenantId: number,
  stopIdPrefix: string,
  rng: () => number,
) {
  // Try to find an existing stop at this address
  const existing = await prisma.stop.findFirst({
    where: { address: addr.address, city: addr.city },
  });
  if (existing) return existing;

  return prisma.stop.create({
    data: {
      stopId: stopIdPrefix,
      name: `${addr.city} Facility`,
      address: addr.address,
      city: addr.city,
      state: addr.state,
      zipCode: addr.zip,
      lat: addr.lat,
      lon: addr.lng,
      locationType: 'WAREHOUSE',
      tenantId,
    },
  });
}
