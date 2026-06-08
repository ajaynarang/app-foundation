/**
 * Stage 1 — Fleet, Customers, Recurring Lanes, Pay Structures
 *
 * Creates:
 * 1. Reassigns Samsara-synced drivers/vehicles to demo tenant
 * 2. Firebase users for each Samsara driver
 * 3. 8 customers from DEMO_CUSTOMERS config
 * 4. 12 recurring lanes from DEMO_LANES config
 * 5. Driver pay structures (per-mile, percentage, flat-rate, hybrid mix)
 */
import { PrismaClient, RecurringLaneStatus } from '@prisma/client';
import { DEMO_TENANT_ID, DEMO_PASSWORD, DEMO_EMAIL_DOMAIN, DEMO_CUSTOMERS, DEMO_LANES } from './config';
import { DemoLogger } from './helpers/logger';
import { createRng, randomInt, randomElement, weightedRandomIndex } from './helpers/generators';
import { getAddress } from './helpers/address-data';
import { initFirebase, createFirebaseUser } from './helpers/firebase';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMMODITIES_BY_EQUIPMENT: Record<string, string[]> = {
  DRY_VAN: ['General Freight', 'Packaged Foods', 'Consumer Goods', 'Paper Products', 'Beverages'],
  REEFER: ['Frozen Seafood', 'Fresh Produce', 'Dairy Products', 'Frozen Foods'],
  FLATBED: ['Lumber', 'Steel Beams', 'Construction Materials', 'Industrial Equipment'],
};

const PAYMENT_TERMS_MAP: Record<number, 'NET_15' | 'NET_30' | 'NET_45' | 'NET_60'> = {
  15: 'NET_15',
  30: 'NET_30',
  45: 'NET_45',
  60: 'NET_60',
};

// ---------------------------------------------------------------------------
// run()
// ---------------------------------------------------------------------------

export async function run(prisma: PrismaClient, logger: DemoLogger): Promise<void> {
  const rng = createRng('stage-1-fleet');

  // Resolve demo tenant
  const tenant = await prisma.tenant.findUnique({
    where: { tenantId: DEMO_TENANT_ID },
  });
  if (!tenant) {
    throw new Error('Demo tenant not found — run Stage 0 first.');
  }
  const tenantIntId = tenant.id;

  // -------------------------------------------------------------------------
  // 1. Find Samsara drivers/vehicles on the demo tenant
  // -------------------------------------------------------------------------
  // Only query within the demo tenant's scope. We never reassign entities
  // from other tenants — the ELD sync must have already run for this tenant.

  const demoDrivers = await prisma.driver.findMany({
    where: {
      tenantId: tenantIntId,
      OR: [{ externalSource: { contains: 'SAMSARA' } }, { externalSource: { contains: 'ELD' } }],
    },
  });
  logger.item('Samsara drivers', `${demoDrivers.length} found on demo tenant`);

  const demoVehicles = await prisma.vehicle.findMany({
    where: {
      tenantId: tenantIntId,
      OR: [{ externalSource: { contains: 'SAMSARA' } }, { externalSource: { contains: 'ELD' } }],
    },
  });
  logger.item('Samsara vehicles', `${demoVehicles.length} found on demo tenant`);

  // -------------------------------------------------------------------------
  // 2. Create Firebase users for each Samsara driver
  // -------------------------------------------------------------------------

  initFirebase();

  for (const driver of demoDrivers) {
    const nameParts = driver.name.trim().split(/\s+/);
    const firstName = nameParts[0].toLowerCase();
    const lastName = nameParts.slice(1).join(' ') || '';
    const email = `driver.${firstName}@${DEMO_EMAIL_DOMAIN}`;
    const userId = `user_demo_driver_${firstName}`;

    // Check if user already exists for this driver
    const existingUser = await prisma.user.findFirst({
      where: { driverId: driver.id },
    });
    if (existingUser) {
      logger.item(`Driver user: ${driver.name}`, email, 'skip');
      continue;
    }

    // Also check by email to avoid duplicates
    const existingByEmail = await prisma.user.findFirst({
      where: { email },
    });
    if (existingByEmail) {
      logger.item(`Driver user: ${driver.name}`, `${email} (email exists)`, 'skip');
      continue;
    }

    const firebaseUid = await createFirebaseUser(email, DEMO_PASSWORD, driver.name);

    await prisma.user.create({
      data: {
        userId,
        email,
        firstName: nameParts[0],
        lastName,
        role: 'DRIVER',
        tenantId: tenantIntId,
        driverId: driver.id,
        firebaseUid,
        isActive: true,
        emailVerified: true,
      },
    });

    const authStatus = firebaseUid ? 'Firebase + DB' : 'DB only';
    logger.item(`Driver user: ${driver.name}`, `${email} (${authStatus})`, 'create');
  }

  // -------------------------------------------------------------------------
  // 3. Create 8 customers
  // -------------------------------------------------------------------------

  const customerIds: number[] = [];

  for (let i = 0; i < DEMO_CUSTOMERS.length; i++) {
    const cust = DEMO_CUSTOMERS[i];
    const customerId = `cust_demo_${cust.shortCode.toLowerCase()}`;

    const existing = await prisma.customer.findFirst({
      where: { tenantId: tenantIntId, companyName: cust.name },
    });

    if (existing) {
      customerIds.push(existing.id);
      logger.item(`Customer: ${cust.name}`, cust.shortCode, 'skip');
      continue;
    }

    const paymentTerms = PAYMENT_TERMS_MAP[cust.paymentTermsDays] ?? 'NET_30';
    const billingEmail = `billing@${cust.shortCode.toLowerCase()}.example.com`;
    const contactPhone = `(617) 555-${(1200 + i).toString()}`;
    const contactEmail = `logistics@${cust.shortCode.toLowerCase()}.example.com`;

    const customer = await prisma.customer.create({
      data: {
        customerId,
        companyName: cust.name,
        customerType: 'SHIPPER',
        status: 'ACTIVE',
        paymentTerms,
        billingEmail,
        address: `${100 + i * 10} Commerce Way`,
        city: 'Boston',
        state: 'MA',
        tenantId: tenantIntId,
      },
    });

    // Create primary contact via CustomerContact relation
    await prisma.customerContact.create({
      data: {
        contactId: `ccon_demo_${cust.shortCode.toLowerCase()}`,
        firstName: cust.name,
        lastName: 'Logistics',
        email: contactEmail,
        phone: contactPhone,
        role: 'PRIMARY',
        isPrimary: true,
        customerId: customer.id,
        tenantId: tenantIntId,
      },
    });

    customerIds.push(customer.id);
    logger.item(`Customer: ${cust.name}`, `${cust.shortCode} / ${paymentTerms}`, 'create');
  }

  // -------------------------------------------------------------------------
  // 4. Create 12 recurring lanes
  // -------------------------------------------------------------------------

  for (let i = 0; i < DEMO_LANES.length; i++) {
    const lane = DEMO_LANES[i];
    const laneId = `NL-LANE-${(i + 1).toString().padStart(3, '0')}`;

    const existing = await prisma.recurringLane.findUnique({
      where: { laneId },
    });
    if (existing) {
      logger.item(`Lane: ${laneId}`, `${lane.origin} -> ${lane.destination}`, 'skip');
      continue;
    }

    const customerIndex = i % customerIds.length;
    const customerId = customerIds[customerIndex];
    const customerName = DEMO_CUSTOMERS[customerIndex].name;

    const originParts = lane.origin.split(', ');
    const destParts = lane.destination.split(', ');

    const avgRate = Math.round((lane.minRate + lane.maxRate) / 2);
    const commodities = COMMODITIES_BY_EQUIPMENT[lane.equipment] ?? COMMODITIES_BY_EQUIPMENT['DRY_VAN'];
    const commodity = randomElement(commodities, rng);

    // Map frequency to scheduleType
    const scheduleTypeMap: Record<string, string> = {
      daily: 'daily',
      '3x_week': 'weekly',
      '2x_week': 'weekly',
      weekly: 'weekly',
      seasonal: 'monthly',
    };
    const scheduleType = scheduleTypeMap[lane.frequency] ?? 'weekly';

    const recurringLane = await prisma.recurringLane.create({
      data: {
        laneId,
        name: `${lane.origin} to ${lane.destination}`,
        customerId,
        customerName,
        requiredEquipmentType: lane.equipment ? (lane.equipment.toUpperCase().replace(/[\s-]+/g, '_') as any) : null,
        commodityType: commodity,
        weightLbs: randomInt(20000, 44000, rng),
        rateCents: avgRate,
        pieces: randomInt(10, 30, rng),
        scheduleType,
        originCity: originParts[0],
        originState: originParts[1],
        destinationCity: destParts[0],
        destinationState: destParts[1],
        estimatedMiles: lane.miles,
        status: RecurringLaneStatus.ACTIVE,
        effectiveFrom: new Date('2026-01-01'),
        tenantId: tenantIntId,
      },
    });

    // Create pickup stop
    const pickupAddr = getAddress(lane.origin, rng);
    const pickupStop =
      (await prisma.stop.findFirst({
        where: { address: pickupAddr.address, city: pickupAddr.city },
      })) ??
      (await prisma.stop.create({
        data: {
          stopId: `stop_lane_${laneId}_pickup`,
          name: `${pickupAddr.city} Warehouse`,
          address: pickupAddr.address,
          city: pickupAddr.city,
          state: pickupAddr.state,
          zipCode: pickupAddr.zip,
          lat: pickupAddr.lat,
          lon: pickupAddr.lng,
          locationType: 'WAREHOUSE',
          tenantId: tenantIntId,
        },
      }));

    await prisma.recurringLaneStop.create({
      data: {
        laneId: recurringLane.id,
        stopId: pickupStop.id,
        sequenceOrder: 0,
        actionType: 'pickup',
        earliestArrival: '06:00',
        latestArrival: '10:00',
        estimatedDockHours: 1.5,
        dayOffset: 0,
      },
    });

    // Create delivery stop
    const deliveryAddr = getAddress(lane.destination, rng);
    const deliveryStop =
      (await prisma.stop.findFirst({
        where: { address: deliveryAddr.address, city: deliveryAddr.city },
      })) ??
      (await prisma.stop.create({
        data: {
          stopId: `stop_lane_${laneId}_delivery`,
          name: `${deliveryAddr.city} Distribution Center`,
          address: deliveryAddr.address,
          city: deliveryAddr.city,
          state: deliveryAddr.state,
          zipCode: deliveryAddr.zip,
          lat: deliveryAddr.lat,
          lon: deliveryAddr.lng,
          locationType: 'WAREHOUSE',
          tenantId: tenantIntId,
        },
      }));

    await prisma.recurringLaneStop.create({
      data: {
        laneId: recurringLane.id,
        stopId: deliveryStop.id,
        sequenceOrder: 1,
        actionType: 'delivery',
        earliestArrival: '08:00',
        latestArrival: '16:00',
        estimatedDockHours: 1.0,
        dayOffset: lane.miles > 150 ? 1 : 0,
      },
    });

    logger.item(`Lane: ${laneId}`, `${lane.origin} -> ${lane.destination} (${lane.equipment})`, 'create');
  }

  // -------------------------------------------------------------------------
  // 5. Create driver pay structures
  // -------------------------------------------------------------------------

  // Distribution: ~40% PER_MILE, ~30% PERCENTAGE, ~20% FLAT_RATE, ~10% HYBRID
  const payTypeWeights = [40, 30, 20, 10];
  const payTypes = ['PER_MILE', 'PERCENTAGE', 'FLAT_RATE', 'HYBRID'] as const;

  for (const driver of demoDrivers) {
    const existing = await prisma.driverPayStructure.findFirst({
      where: { driverId: driver.id, isActive: true },
    });
    if (existing) {
      logger.item(`Pay: ${driver.name}`, `${existing.type} exists`, 'skip');
      continue;
    }

    const typeIndex = weightedRandomIndex(payTypeWeights, rng);
    const payType = payTypes[typeIndex];

    const baseData = {
      driverId: driver.id,
      type: payType,
      effectiveFrom: new Date('2026-01-01'),
      isActive: true,
      tenantId: tenantIntId,
      ratePerMileCents: null as number | null,
      percentage: null as number | null,
      flatRateCents: null as number | null,
      hybridBaseCents: null as number | null,
      hybridPercent: null as number | null,
      notes: null as string | null,
    };

    switch (payType) {
      case 'PER_MILE':
        baseData.ratePerMileCents = randomInt(52, 68, rng);
        baseData.notes = `$${(baseData.ratePerMileCents / 100).toFixed(2)}/mile`;
        break;
      case 'PERCENTAGE':
        baseData.percentage = 25 + rng() * 3; // 25-28%
        baseData.percentage = Math.round(baseData.percentage * 100) / 100;
        baseData.notes = `${baseData.percentage}% of linehaul`;
        break;
      case 'FLAT_RATE':
        baseData.flatRateCents = randomInt(80000, 150000, rng);
        baseData.notes = `$${(baseData.flatRateCents / 100).toFixed(2)} per load`;
        break;
      case 'HYBRID':
        baseData.hybridBaseCents = randomInt(30000, 50000, rng);
        baseData.hybridPercent = 10 + rng() * 5; // 10-15%
        baseData.hybridPercent = Math.round(baseData.hybridPercent * 100) / 100;
        baseData.notes = `$${(baseData.hybridBaseCents / 100).toFixed(2)} base + ${baseData.hybridPercent}%`;
        break;
    }

    await prisma.driverPayStructure.create({ data: baseData });
    logger.item(`Pay: ${driver.name}`, `${payType} — ${baseData.notes}`, 'create');
  }
}
