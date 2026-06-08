/**
 * Stage 3 — Financial Data (Invoices, Payments, Settlements)
 *
 * Generates invoices from delivered loads with charges, records payments,
 * and creates weekly driver settlements for the last 8 weeks.
 */
import { PrismaClient, LoadBillingStatus } from '@prisma/client';
import { DEMO_TENANT_ID, DEMO_CUSTOMERS } from './config';
import { DemoLogger } from './helpers/logger';
import { backfillFactoringMoney } from '../backfill-factoring-money';
import {
  createRng,
  randomInt,
  randomElement,
  generateInvoiceNumber,
  generateSettlementNumber,
} from './helpers/generators';
import { daysAgo, startOfWeek, endOfWeek } from './helpers/date-utils';

// ---------------------------------------------------------------------------
// Charge type → LineItemType enum mapping
// ---------------------------------------------------------------------------

const CHARGE_TO_LINE_ITEM_TYPE: Record<string, string> = {
  linehaul: 'LINEHAUL',
  fuel_surcharge: 'FUEL_SURCHARGE',
  detention_pickup: 'DETENTION_PICKUP',
  detention_delivery: 'DETENTION_DELIVERY',
  layover: 'LAYOVER',
  lumper: 'LUMPER',
  tonu: 'TONU',
  accessorial: 'ACCESSORIAL',
  adjustment: 'ADJUSTMENT',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function customerBehavior(customerId: number, customers: { id: number; companyName: string }[]): string {
  const cust = customers.find((c) => c.id === customerId);
  if (!cust) return 'steady';
  const config = DEMO_CUSTOMERS.find((dc) => dc.name === cust.companyName);
  return config?.behavior ?? 'steady';
}

function customerPaymentTerms(customerId: number, customers: { id: number; companyName: string }[]): number {
  const cust = customers.find((c) => c.id === customerId);
  if (!cust) return 30;
  const config = DEMO_CUSTOMERS.find((dc) => dc.name === cust.companyName);
  return config?.paymentTermsDays ?? 30;
}

// ---------------------------------------------------------------------------
// run()
// ---------------------------------------------------------------------------

export async function run(prisma: PrismaClient, logger: DemoLogger): Promise<void> {
  const rng = createRng('stage-3-financials');

  // Resolve demo tenant
  const tenant = await prisma.tenant.findUnique({
    where: { tenantId: DEMO_TENANT_ID },
  });
  if (!tenant) {
    throw new Error('Demo tenant not found — run Stage 0 first.');
  }
  const tenantIntId = tenant.id;

  // Check idempotency — invoices and settlements checked separately
  const existingInvoices = await prisma.invoice.count({
    where: { tenantId: tenantIntId },
  });
  const existingSettlements = await prisma.settlement.count({
    where: { tenantId: tenantIntId },
  });
  const skipInvoices = existingInvoices > 0;
  const skipSettlements = existingSettlements > 0;

  if (skipInvoices && skipSettlements) {
    logger.item('Invoices', `${existingInvoices} already exist — skipping`, 'skip');
    logger.item('Settlements', `${existingSettlements} already exist — skipping`, 'skip');
    return;
  }

  // Load customers (needed by both invoices and settlements)
  const customers = await prisma.customer.findMany({
    where: { tenantId: tenantIntId },
  });

  // Load delivered loads with charges (needed by both)
  if (skipInvoices) {
    logger.item('Invoices', `${existingInvoices} already exist — skipping`, 'skip');
  }

  // Load delivered loads with charges
  const deliveredLoads = await prisma.load.findMany({
    where: {
      tenantId: tenantIntId,
      status: 'DELIVERED',
      deliveredAt: { not: null },
    },
    include: {
      charges: { where: { isBillable: true } },
    },
    orderBy: { deliveredAt: 'asc' },
  });

  if (deliveredLoads.length === 0) {
    logger.warn('No delivered loads found — skipping financials');
    return;
  }

  // -------------------------------------------------------------------------
  // 1. Generate Invoices from Delivered Loads
  // -------------------------------------------------------------------------
  if (!skipInvoices) {
    const now = new Date();
    let invoiceSeq = 0;
    let totalInvoices = 0;
    let totalLineItems = 0;
    let totalPayments = 0;

    const PAYMENT_METHODS = ['ACH', 'WIRE', 'CHECK'];

    for (const load of deliveredLoads) {
      if (load.charges.length === 0) continue;
      if (!load.customerId || !load.deliveredAt) continue;

      const subtotalCents = load.charges.reduce((sum, c) => sum + c.totalCents, 0);
      const totalCents = subtotalCents; // No adjustments for demo
      const deliveryAgeDays = daysBetween(load.deliveredAt, now);
      const behavior = customerBehavior(load.customerId, customers);
      const payTermsDays = customerPaymentTerms(load.customerId, customers);

      // Determine invoice status based on age + customer behavior
      let invoiceStatus: string;
      let paidCents = 0;
      let balanceCents = totalCents;
      let paidDate: Date | null = null;

      if (deliveryAgeDays >= 45) {
        // Old enough — all paid
        invoiceStatus = 'PAID';
        paidCents = totalCents;
        balanceCents = 0;
        paidDate = new Date(load.deliveredAt.getTime() + payTermsDays * 24 * 60 * 60 * 1000);
      } else if (deliveryAgeDays >= 30) {
        // 30-45 days
        if (behavior === 'fast_payer' || behavior === 'reliable') {
          invoiceStatus = 'PAID';
          paidCents = totalCents;
          balanceCents = 0;
          paidDate = new Date(load.deliveredAt.getTime() + payTermsDays * 24 * 60 * 60 * 1000);
        } else if (behavior === 'slow_payer') {
          invoiceStatus = 'OVERDUE';
        } else {
          invoiceStatus = 'SENT';
        }
      } else if (deliveryAgeDays >= 14) {
        // 14-30 days — mix
        if (rng() < 0.3) {
          invoiceStatus = 'PAID';
          paidCents = totalCents;
          balanceCents = 0;
          paidDate = new Date(load.deliveredAt.getTime() + (payTermsDays - randomInt(0, 5, rng)) * 24 * 60 * 60 * 1000);
        } else {
          invoiceStatus = 'SENT';
        }
      } else {
        // <14 days — draft or approved
        invoiceStatus = rng() < 0.5 ? 'DRAFT' : 'SENT';
      }

      const invoiceNumber = generateInvoiceNumber(invoiceSeq);
      const issueDate = new Date(load.deliveredAt.getTime() + 24 * 60 * 60 * 1000); // day after delivery
      const dueDate = new Date(issueDate.getTime() + payTermsDays * 24 * 60 * 60 * 1000);

      // Determine billing status for load
      let billingStatus: string;
      if (invoiceStatus === 'PAID') {
        billingStatus = 'CLOSED';
      } else if (invoiceStatus === 'SENT' || invoiceStatus === 'OVERDUE') {
        billingStatus = 'INVOICED';
      } else {
        billingStatus = 'PENDING_DOCUMENTS';
      }

      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber,
          status: invoiceStatus as any,
          customerId: load.customerId,
          loadId: load.id,
          subtotalCents,
          totalCents,
          paidCents,
          balanceCents,
          issueDate,
          dueDate,
          paidDate,
          paymentTermsDays: payTermsDays,
          tenantId: tenantIntId,
        },
      });
      totalInvoices++;

      // Create line items
      for (let i = 0; i < load.charges.length; i++) {
        const charge = load.charges[i];
        const lineItemType = CHARGE_TO_LINE_ITEM_TYPE[charge.chargeType] ?? 'ACCESSORIAL';

        await prisma.invoiceLineItem.create({
          data: {
            invoiceId: invoice.id,
            type: lineItemType as any,
            description: charge.description,
            quantity: charge.quantity,
            unitPriceCents: charge.unitPriceCents,
            totalCents: charge.totalCents,
            sequenceOrder: i,
          },
        });
        totalLineItems++;
      }

      // Record payment for paid invoices
      if (invoiceStatus === 'PAID' && paidDate) {
        const paymentMethod = randomElement(PAYMENT_METHODS, rng);
        const paymentId = `pmt_demo_${invoiceSeq.toString().padStart(4, '0')}`;

        await prisma.payment.create({
          data: {
            paymentId,
            invoiceId: invoice.id,
            amountCents: totalCents,
            paymentMethod,
            referenceNumber: `REF-${randomInt(100000, 999999, rng)}`,
            paymentDate: paidDate,
            tenantId: tenantIntId,
          },
        });
        totalPayments++;
      }

      // Update load billing status
      await prisma.load.update({
        where: { id: load.id },
        data: { billingStatus: billingStatus as LoadBillingStatus },
      });

      invoiceSeq++;
    }

    logger.item('Invoices', `${totalInvoices} created`);
    logger.item('Invoice line items', `${totalLineItems} created`);
    logger.item('Payments', `${totalPayments} recorded`);
  } // end if (!skipInvoices)

  // -------------------------------------------------------------------------
  // 2. Generate Weekly Settlements
  // -------------------------------------------------------------------------

  if (skipSettlements) {
    logger.item('Settlements', `${existingSettlements} already exist — skipping`, 'skip');
    return;
  }

  const drivers = await prisma.driver.findMany({
    where: { tenantId: tenantIntId, externalDriverId: { not: null } },
    include: { payStructures: { where: { isActive: true }, take: 1 } },
  });

  let settlementSeq = 0;
  let totalSettlements = 0;
  let totalSettlementLines = 0;
  let totalDeductions = 0;

  // Generate 9 weeks of settlements (0 = current week, 1-8 = past weeks)
  for (let weekOffset = 0; weekOffset <= 8; weekOffset++) {
    const weekDate = daysAgo(weekOffset * 7);
    const periodStart = startOfWeek(weekDate);
    const periodEnd = endOfWeek(weekDate);

    for (const driver of drivers) {
      const activePayStructure = driver.payStructures?.[0];
      if (!activePayStructure) continue;

      // Find loads delivered this week for this driver
      const weekLoads = await prisma.load.findMany({
        where: {
          tenantId: tenantIntId,
          driverId: driver.id,
          status: 'DELIVERED',
          deliveredAt: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
        include: {
          charges: { where: { isBillable: true } },
        },
      });

      if (weekLoads.length === 0) continue;

      const pay = activePayStructure;
      let grossPayCents = 0;
      const lineItemsData: {
        loadId: number;
        description: string;
        miles: number | null;
        loadRevenueCents: number;
        payAmountCents: number;
        payStructureType: string;
      }[] = [];

      for (const load of weekLoads) {
        const loadRevenue = load.charges.reduce((sum, c) => sum + c.totalCents, 0);
        const miles = load.actualMiles ?? load.estimatedMiles ?? 0;
        let payAmount = 0;

        switch (pay.type) {
          case 'PER_MILE':
            payAmount = Math.round(miles * (pay.ratePerMileCents ?? 55));
            break;
          case 'PERCENTAGE':
            payAmount = Math.round((loadRevenue * Number(pay.percentage ?? 25)) / 100);
            break;
          case 'FLAT_RATE':
            payAmount = pay.flatRateCents ?? 100000;
            break;
          case 'HYBRID':
            payAmount =
              (pay.hybridBaseCents ?? 35000) + Math.round((loadRevenue * Number(pay.hybridPercent ?? 12)) / 100);
            break;
        }

        grossPayCents += payAmount;
        lineItemsData.push({
          loadId: load.id,
          description: `${load.loadNumber}: ${load.originCity}, ${load.originState} → ${load.destinationCity}, ${load.destinationState}`,
          miles,
          loadRevenueCents: loadRevenue,
          payAmountCents: payAmount,
          payStructureType: pay.type,
        });
      }

      // Calculate deductions
      const deductionsData: { type: string; description: string; amountCents: number }[] = [];

      // Insurance: $50/week
      deductionsData.push({
        type: 'INSURANCE',
        description: 'Weekly insurance contribution',
        amountCents: 5000,
      });

      // ELD lease: $25/week
      deductionsData.push({
        type: 'EQUIPMENT_LEASE',
        description: 'ELD device lease',
        amountCents: 2500,
      });

      // Fuel advance: ~60% chance, $150-500
      if (rng() < 0.6) {
        deductionsData.push({
          type: 'FUEL_ADVANCE',
          description: 'Fuel advance',
          amountCents: randomInt(15000, 50000, rng),
        });
      }

      // One settlement gets a reimbursement (truck wash, negative deduction = amountCents is negative)
      if (settlementSeq === 3) {
        deductionsData.push({
          type: 'OTHER',
          description: 'Truck wash reimbursement',
          amountCents: -4500,
        });
      }

      const deductionsCents = deductionsData.reduce((sum, d) => sum + d.amountCents, 0);
      const netPayCents = grossPayCents - deductionsCents;

      // Settlement status by week age
      let settlementStatus: string;
      let approvedAt: Date | null = null;
      let paidAt: Date | null = null;

      if (weekOffset >= 5) {
        settlementStatus = 'PAID';
        approvedAt = new Date(periodEnd.getTime() + 2 * 24 * 60 * 60 * 1000);
        paidAt = new Date(approvedAt.getTime() + 3 * 24 * 60 * 60 * 1000);
      } else if (weekOffset >= 3) {
        settlementStatus = rng() < 0.6 ? 'APPROVED' : 'DRAFT';
        if (settlementStatus === 'APPROVED') {
          approvedAt = new Date(periodEnd.getTime() + 2 * 24 * 60 * 60 * 1000);
        }
      } else {
        settlementStatus = 'DRAFT';
      }

      const settlementNumber = generateSettlementNumber(settlementSeq);
      const settlementId = `set_demo_${settlementNumber.toLowerCase().replace(/-/g, '_')}`;

      const settlement = await prisma.settlement.create({
        data: {
          settlementId,
          settlementNumber,
          status: settlementStatus as any,
          driverId: driver.id,
          periodStart,
          periodEnd,
          grossPayCents,
          deductionsCents,
          netPayCents,
          approvedAt,
          paidAt,
          tenantId: tenantIntId,
        },
      });
      totalSettlements++;

      // Create line items
      for (const li of lineItemsData) {
        await prisma.settlementLineItem.create({
          data: {
            settlementId: settlement.id,
            loadId: li.loadId,
            description: li.description,
            miles: li.miles,
            loadRevenueCents: li.loadRevenueCents,
            payAmountCents: li.payAmountCents,
            payStructureType: li.payStructureType as any,
          },
        });
        totalSettlementLines++;
      }

      // Create deductions
      for (const ded of deductionsData) {
        await prisma.settlementDeduction.create({
          data: {
            settlementId: settlement.id,
            type: ded.type as any,
            description: ded.description,
            amountCents: ded.amountCents,
          },
        });
        totalDeductions++;
      }

      settlementSeq++;
    }
  }

  logger.item('Settlements', `${totalSettlements} created`);
  logger.item('Settlement line items', `${totalSettlementLines} created`);
  logger.item('Settlement deductions', `${totalDeductions} created`);

  // Phase 4 — backfill estimated factoring transactions (ADVANCE + FEE) for
  // demo FACTORED invoices. Idempotent: skips invoices that already have an
  // ADVANCE row, so safe to re-run on every `setup:demo`. Tenant-scoped.
  const backfillStats = await backfillFactoringMoney(
    prisma,
    { dryRun: false, tenantSlug: DEMO_TENANT_ID, days: 90 },
    () => undefined, // demo logger doesn't accept the line-by-line trace; rely on the summary
  );
  logger.item(
    'Factoring transactions (backfilled)',
    `${backfillStats.backfilled} txn rows · ${backfillStats.skippedExisting} skipped (idempotent)`,
  );
  if (backfillStats.skippedNoRateCard > 0) {
    logger.item('  Skipped (no rate-card)', `${backfillStats.skippedNoRateCard}`);
  }
}
