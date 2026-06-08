import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { InvoicingService } from '../invoicing.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { CounterService } from '../../../../../infrastructure/database/counter.service';
import { SallyCacheService } from '../../../../../infrastructure/cache/sally-cache.service';
import { LoadEventsService } from '../../../../fleet/loads/services/load-events.service';
import { NotificationTriggersService } from '../../../../../domains/operations/notifications/notification-triggers.service';
import { DomainEventService } from '../../../../../infrastructure/events/domain-event.service';
import { NoaService } from '../noa.service';
import { createMockPrisma, createMockCache } from '../../../../../test/mocks';
import { makeDeliveredLoad, makeInvoice, makeInvoiceLineItem, makeCustomer } from '../../../../../test/factories';

describe('InvoicingService', () => {
  let service: InvoicingService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let cache: ReturnType<typeof createMockCache>;
  let counterService: { nextValue: jest.Mock };
  let loadEventsService: { logEvent: jest.Mock };
  let notificationTriggers: Record<string, jest.Mock>;
  let noaService: { upsertForFactoredInvoice: jest.Mock };

  beforeEach(async () => {
    prisma = createMockPrisma();
    cache = createMockCache();
    counterService = { nextValue: jest.fn().mockResolvedValue(1) };
    loadEventsService = { logEvent: jest.fn().mockResolvedValue(undefined) };
    notificationTriggers = {
      invoiceGenerated: jest.fn().mockResolvedValue(undefined),
      invoiceSent: jest.fn().mockResolvedValue(undefined),
      customerInvoiceSent: jest.fn().mockResolvedValue(undefined),
      paymentReceived: jest.fn().mockResolvedValue(undefined),
    };
    noaService = {
      upsertForFactoredInvoice: jest.fn().mockResolvedValue({ noaRecord: { id: 1, noaId: 'noa_1' }, created: false }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicingService,
        { provide: PrismaService, useValue: prisma },
        { provide: CounterService, useValue: counterService },
        { provide: SallyCacheService, useValue: cache },
        { provide: LoadEventsService, useValue: loadEventsService },
        {
          provide: NotificationTriggersService,
          useValue: notificationTriggers,
        },
        {
          provide: DomainEventService,
          useValue: { emit: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: NoaService, useValue: noaService },
      ],
    }).compile();

    service = module.get<InvoicingService>(InvoicingService);
  });

  // ─── generateFromLoad ───────────────────────────────────────

  describe('generateFromLoad', () => {
    const tenantId = 1;
    const loadId = 'ld-test-001';

    function deliveredLoadWithCharges(overrides?: Record<string, any>) {
      return makeDeliveredLoad({
        loadId,
        customerId: 1,
        customer: makeCustomer(),
        billingStatus: 'APPROVED',
        rateCents: 250000,
        stops: [],
        ...overrides,
      });
    }

    it('should create invoice with correct line items from LoadCharge records', async () => {
      const load = deliveredLoadWithCharges();
      prisma.load.findFirst.mockResolvedValue(load);
      prisma.loadCharge.count.mockResolvedValue(2);

      // Inside $transaction
      prisma.invoice.findFirst
        .mockResolvedValueOnce(null) // no existing invoice
        .mockResolvedValueOnce(null); // no collision
      prisma.invoiceSettings.findUnique.mockResolvedValue({
        invoicePrefix: 'INV',
        defaultPaymentTermsDays: 30,
        defaultNotes: null,
      });
      prisma.loadCharge.findMany.mockResolvedValue([
        {
          chargeType: 'linehaul',
          description: 'Line haul',
          quantity: 1,
          unitPriceCents: 200000,
          totalCents: 200000,
        },
        {
          chargeType: 'fuel_surcharge',
          description: 'Fuel surcharge',
          quantity: 1,
          unitPriceCents: 50000,
          totalCents: 50000,
        },
      ]);

      const createdInvoice = makeInvoice({
        subtotalCents: 250000,
        totalCents: 250000,
        balanceCents: 250000,
        invoiceNumber: 'INV-2026-0001',
        issueDate: new Date(),
        dueDate: new Date(),
        lineItems: [
          makeInvoiceLineItem({ type: 'LINEHAUL', totalCents: 200000 }),
          makeInvoiceLineItem({ type: 'FUEL_SURCHARGE', totalCents: 50000 }),
        ],
        customer: makeCustomer(),
        load,
      });
      prisma.invoice.create.mockResolvedValue(createdInvoice);
      prisma.load.update.mockResolvedValue(load);

      const result = await service.generateFromLoad(tenantId, loadId);

      expect(result.invoiceNumber).toBe('INV-2026-0001');
      expect(prisma.invoice.create).toHaveBeenCalledTimes(1);
      const createCall = prisma.invoice.create.mock.calls[0][0];
      expect(createCall.data.subtotalCents).toBe(250000);
      expect(createCall.data.lineItems.create).toHaveLength(2);
      expect(createCall.data.lineItems.create[0].type).toBe('LINEHAUL');
      expect(createCall.data.lineItems.create[1].type).toBe('FUEL_SURCHARGE');
    });

    it('should throw NotFoundException when load not found', async () => {
      prisma.load.findFirst.mockResolvedValue(null);
      await expect(service.generateFromLoad(tenantId, 'not-found')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when load not delivered', async () => {
      prisma.load.findFirst.mockResolvedValue(deliveredLoadWithCharges({ status: 'IN_TRANSIT' }));
      await expect(service.generateFromLoad(tenantId, loadId)).rejects.toThrow(
        'Can only generate invoices for delivered loads',
      );
    });

    it('should throw when billing status is not APPROVED (non-null)', async () => {
      prisma.load.findFirst.mockResolvedValue(deliveredLoadWithCharges({ billingStatus: 'PENDING_DOCUMENTS' }));
      await expect(service.generateFromLoad(tenantId, loadId)).rejects.toThrow(
        'Load must be approved for billing before invoice generation',
      );
    });

    it('should allow generation when billingStatus is null (legacy flow)', async () => {
      const load = deliveredLoadWithCharges({ billingStatus: null });
      prisma.load.findFirst.mockResolvedValue(load);
      prisma.loadCharge.count.mockResolvedValue(0);
      // Legacy flow uses rateCents
      prisma.invoice.findFirst.mockResolvedValue(null);
      prisma.invoiceSettings.findUnique.mockResolvedValue(null);
      prisma.loadCharge.findMany.mockResolvedValue([]);
      const created = makeInvoice({
        issueDate: new Date(),
        dueDate: new Date(),
        lineItems: [makeInvoiceLineItem()],
        customer: makeCustomer(),
        load,
      });
      prisma.invoice.create.mockResolvedValue(created);
      prisma.load.update.mockResolvedValue(load);

      const result = await service.generateFromLoad(tenantId, loadId);
      expect(result).toBeDefined();
      // Legacy flow: linehaul from rateCents
      const createCall = prisma.invoice.create.mock.calls[0][0];
      expect(createCall.data.lineItems.create[0].type).toBe('LINEHAUL');
    });

    it('should throw when load has no customer', async () => {
      prisma.load.findFirst.mockResolvedValue(deliveredLoadWithCharges({ customerId: null }));
      await expect(service.generateFromLoad(tenantId, loadId)).rejects.toThrow('Load must have a customer assigned');
    });

    it('should throw when load has no charges and no rate', async () => {
      prisma.load.findFirst.mockResolvedValue(deliveredLoadWithCharges({ rateCents: null }));
      prisma.loadCharge.count.mockResolvedValue(0);
      await expect(service.generateFromLoad(tenantId, loadId)).rejects.toThrow('Load must have charges or a rate set');
    });

    it('should throw BadRequestException when invoice already exists for load', async () => {
      const load = deliveredLoadWithCharges();
      prisma.load.findFirst.mockResolvedValue(load);
      prisma.loadCharge.count.mockResolvedValue(1);
      // Inside $transaction: existing invoice found
      prisma.invoice.findFirst.mockResolvedValueOnce(makeInvoice({ invoiceNumber: 'INV-2026-0001' }));
      prisma.invoiceSettings.findUnique.mockResolvedValue(null);

      await expect(service.generateFromLoad(tenantId, loadId)).rejects.toThrow(/Invoice INV-2026-0001 already exists/);
    });

    it('should throw ConflictException after 5 invoice number collision retries', async () => {
      const load = deliveredLoadWithCharges();
      prisma.load.findFirst.mockResolvedValue(load);
      prisma.loadCharge.count.mockResolvedValue(1);
      // No existing invoice for load
      prisma.invoice.findFirst
        .mockResolvedValueOnce(null) // no existing for load
        // 5 collision attempts
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce({ id: 2 })
        .mockResolvedValueOnce({ id: 3 })
        .mockResolvedValueOnce({ id: 4 })
        .mockResolvedValueOnce({ id: 5 });
      prisma.invoiceSettings.findUnique.mockResolvedValue(null);

      await expect(service.generateFromLoad(tenantId, loadId)).rejects.toThrow(ConflictException);
    });

    it('should map all charge types correctly to line items', async () => {
      const chargeTypes = [
        { chargeType: 'linehaul', expected: 'LINEHAUL' },
        { chargeType: 'fuel_surcharge', expected: 'FUEL_SURCHARGE' },
        { chargeType: 'detention_pickup', expected: 'DETENTION_PICKUP' },
        { chargeType: 'detention_delivery', expected: 'DETENTION_DELIVERY' },
        { chargeType: 'layover', expected: 'LAYOVER' },
        { chargeType: 'lumper', expected: 'LUMPER' },
        { chargeType: 'tonu', expected: 'TONU' },
        { chargeType: 'accessorial', expected: 'ACCESSORIAL' },
        { chargeType: 'adjustment', expected: 'ADJUSTMENT' },
        { chargeType: 'unknown_type', expected: 'ACCESSORIAL' }, // fallback
      ];

      const load = deliveredLoadWithCharges();
      prisma.load.findFirst.mockResolvedValue(load);
      prisma.loadCharge.count.mockResolvedValue(chargeTypes.length);
      prisma.invoice.findFirst.mockResolvedValue(null);
      prisma.invoiceSettings.findUnique.mockResolvedValue(null);
      prisma.loadCharge.findMany.mockResolvedValue(
        chargeTypes.map((ct) => ({
          chargeType: ct.chargeType,
          description: ct.chargeType,
          quantity: 1,
          unitPriceCents: 1000,
          totalCents: 1000,
        })),
      );
      const created = makeInvoice({
        issueDate: new Date(),
        dueDate: new Date(),
        lineItems: [],
        customer: makeCustomer(),
        load,
      });
      prisma.invoice.create.mockResolvedValue(created);
      prisma.load.update.mockResolvedValue(load);

      await service.generateFromLoad(tenantId, loadId);

      const createCall = prisma.invoice.create.mock.calls[0][0];
      const lineItems = createCall.data.lineItems.create;
      for (let i = 0; i < chargeTypes.length; i++) {
        expect(lineItems[i].type).toBe(chargeTypes[i].expected);
      }
    });

    it('should calculate subtotal, total, and balance correctly', async () => {
      const load = deliveredLoadWithCharges();
      prisma.load.findFirst.mockResolvedValue(load);
      prisma.loadCharge.count.mockResolvedValue(2);
      prisma.invoice.findFirst.mockResolvedValue(null);
      prisma.invoiceSettings.findUnique.mockResolvedValue(null);
      prisma.loadCharge.findMany.mockResolvedValue([
        {
          chargeType: 'linehaul',
          description: 'Line haul',
          quantity: 1,
          unitPriceCents: 200000,
          totalCents: 200000,
        },
        {
          chargeType: 'fuel_surcharge',
          description: 'FSC',
          quantity: 1,
          unitPriceCents: 30000,
          totalCents: 30000,
        },
      ]);
      const created = makeInvoice({
        issueDate: new Date(),
        dueDate: new Date(),
        lineItems: [],
        customer: makeCustomer(),
        load,
      });
      prisma.invoice.create.mockResolvedValue(created);
      prisma.load.update.mockResolvedValue(load);

      await service.generateFromLoad(tenantId, loadId);

      const createCall = prisma.invoice.create.mock.calls[0][0];
      expect(createCall.data.subtotalCents).toBe(230000);
      expect(createCall.data.totalCents).toBe(230000);
      expect(createCall.data.balanceCents).toBe(230000);
      expect(createCall.data.paidCents).toBe(0);
      expect(createCall.data.adjustmentCents).toBe(0);
    });

    it('should use customer payment terms when no explicit terms given', async () => {
      const load = deliveredLoadWithCharges({
        customer: makeCustomer({ paymentTerms: 'NET_45' }),
      });
      prisma.load.findFirst.mockResolvedValue(load);
      prisma.loadCharge.count.mockResolvedValue(1);
      prisma.invoice.findFirst.mockResolvedValue(null);
      prisma.invoiceSettings.findUnique.mockResolvedValue(null);
      prisma.loadCharge.findMany.mockResolvedValue([
        {
          chargeType: 'linehaul',
          description: 'LH',
          quantity: 1,
          unitPriceCents: 100000,
          totalCents: 100000,
        },
      ]);
      const created = makeInvoice({
        issueDate: new Date(),
        dueDate: new Date(),
        lineItems: [],
        customerId: load.customerId,
        load,
      });
      prisma.invoice.create.mockResolvedValue(created);
      prisma.load.update.mockResolvedValue(load);

      await service.generateFromLoad(tenantId, loadId);

      const createCall = prisma.invoice.create.mock.calls[0][0];
      expect(createCall.data.paymentTermsDays).toBe(45);
    });

    it('should update load billingStatus to INVOICED', async () => {
      const load = deliveredLoadWithCharges();
      prisma.load.findFirst.mockResolvedValue(load);
      prisma.loadCharge.count.mockResolvedValue(1);
      prisma.invoice.findFirst.mockResolvedValue(null);
      prisma.invoiceSettings.findUnique.mockResolvedValue(null);
      prisma.loadCharge.findMany.mockResolvedValue([
        {
          chargeType: 'linehaul',
          description: 'LH',
          quantity: 1,
          unitPriceCents: 100000,
          totalCents: 100000,
        },
      ]);
      const created = makeInvoice({
        issueDate: new Date(),
        dueDate: new Date(),
        lineItems: [],
        customer: makeCustomer(),
        load,
      });
      prisma.invoice.create.mockResolvedValue(created);
      prisma.load.update.mockResolvedValue(load);

      await service.generateFromLoad(tenantId, loadId);

      expect(prisma.load.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { billingStatus: 'INVOICED' },
        }),
      );
    });

    // ─── factoring cascade ──────────────────────────────────────
    // Cascade rule: customer override -> tenant default -> DIRECT.
    // Customer DIRECT override beats a tenant pinned factor.

    function setupCascade(opts: {
      customerBillingPath?: 'FACTORED' | 'DIRECT' | null;
      customerFactoringCompanyId?: number | null;
      tenantFactoringCompanyId: number | null;
    }) {
      const load = deliveredLoadWithCharges({
        customer: makeCustomer({
          defaultBillingPath: opts.customerBillingPath ?? null,
          defaultFactoringCompanyId: opts.customerFactoringCompanyId ?? null,
        }),
      });
      prisma.load.findFirst.mockResolvedValue(load);
      prisma.loadCharge.count.mockResolvedValue(1);
      prisma.invoice.findFirst.mockResolvedValue(null);
      prisma.invoiceSettings.findUnique.mockResolvedValue(null);
      prisma.tenant.findUnique.mockResolvedValue({
        defaultFactoringCompanyId: opts.tenantFactoringCompanyId,
      });
      prisma.loadCharge.findMany.mockResolvedValue([
        { chargeType: 'linehaul', description: 'LH', quantity: 1, unitPriceCents: 100000, totalCents: 100000 },
      ]);
      prisma.invoice.create.mockResolvedValue(
        makeInvoice({ issueDate: new Date(), dueDate: new Date(), lineItems: [], customer: makeCustomer(), load }),
      );
      prisma.load.update.mockResolvedValue(load);
      return load;
    }

    it('uses customer override when customer.defaultFactoringCompanyId is set', async () => {
      setupCascade({ customerBillingPath: 'FACTORED', customerFactoringCompanyId: 5, tenantFactoringCompanyId: 99 });

      await service.generateFromLoad(tenantId, loadId);

      const createCall = prisma.invoice.create.mock.calls[0][0];
      expect(createCall.data.billingPath).toBe('FACTORED');
      expect(createCall.data.factoringCompanyId).toBe(5);
    });

    it('falls back to tenant default when customer has no override', async () => {
      setupCascade({
        customerBillingPath: null,
        customerFactoringCompanyId: null,
        tenantFactoringCompanyId: 99,
      });

      await service.generateFromLoad(tenantId, loadId);

      const createCall = prisma.invoice.create.mock.calls[0][0];
      expect(createCall.data.billingPath).toBe('FACTORED');
      expect(createCall.data.factoringCompanyId).toBe(99);
    });

    it('defaults to DIRECT when neither tenant nor customer has a factor', async () => {
      setupCascade({
        customerBillingPath: null,
        customerFactoringCompanyId: null,
        tenantFactoringCompanyId: null,
      });

      await service.generateFromLoad(tenantId, loadId);

      const createCall = prisma.invoice.create.mock.calls[0][0];
      expect(createCall.data.billingPath).toBe('DIRECT');
      expect(createCall.data.factoringCompanyId).toBeNull();
    });

    it('honours customer DIRECT override even when tenant default is pinned', async () => {
      setupCascade({
        customerBillingPath: 'DIRECT',
        customerFactoringCompanyId: null,
        tenantFactoringCompanyId: 99,
      });

      await service.generateFromLoad(tenantId, loadId);

      const createCall = prisma.invoice.create.mock.calls[0][0];
      expect(createCall.data.billingPath).toBe('DIRECT');
      expect(createCall.data.factoringCompanyId).toBeNull();
    });

    it('should create detention line items in legacy flow when overage exceeds free hours', async () => {
      const load = deliveredLoadWithCharges({
        billingStatus: null,
        stops: [
          {
            actionType: 'pickup',
            actualDockHours: 5,
            estimatedDockHours: 1,
            stop: { name: 'Origin' },
          },
        ],
      });
      prisma.load.findFirst.mockResolvedValue(load);
      prisma.loadCharge.count.mockResolvedValue(0);
      prisma.invoice.findFirst.mockResolvedValue(null);
      prisma.invoiceSettings.findUnique.mockResolvedValue(null);
      prisma.loadCharge.findMany.mockResolvedValue([]);
      const created = makeInvoice({
        issueDate: new Date(),
        dueDate: new Date(),
        lineItems: [],
        customer: makeCustomer(),
        load,
      });
      prisma.invoice.create.mockResolvedValue(created);
      prisma.load.update.mockResolvedValue(load);

      await service.generateFromLoad(tenantId, loadId);

      const createCall = prisma.invoice.create.mock.calls[0][0];
      const lineItems = createCall.data.lineItems.create;
      expect(lineItems).toHaveLength(2); // LINEHAUL + DETENTION_PICKUP
      expect(lineItems[1].type).toBe('DETENTION_PICKUP');
      // overage = 5 - 1 = 4, free = 2, billable = 2
      expect(lineItems[1].quantity).toBe(2);
      expect(lineItems[1].unitPriceCents).toBe(7500);
      expect(lineItems[1].totalCents).toBe(15000);
    });
  });

  // ─── findAll ─────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return invoices filtered by tenant', async () => {
      const invoices = [makeInvoice()];
      prisma.invoice.findMany.mockResolvedValue(invoices);

      const result = await service.findAll(1);

      expect(prisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 1 }),
        }),
      );
      expect(result).toHaveLength(1);
    });

    it('should apply status filter', async () => {
      prisma.invoice.findMany.mockResolvedValue([]);
      await service.findAll(1, { status: 'SENT' });

      expect(prisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'SENT' }),
        }),
      );
    });

    it('should apply overdue filter', async () => {
      prisma.invoice.findMany.mockResolvedValue([]);
      await service.findAll(1, { overdueOnly: true });

      const call = prisma.invoice.findMany.mock.calls[0][0];
      expect(call.where.status).toEqual({ in: ['SENT', 'PARTIAL'] });
      expect(call.where.dueDate).toEqual({ lt: expect.any(Date) });
    });

    it('should narrow to overdue invoices past the supplied minDaysOverdue threshold', async () => {
      prisma.invoice.findMany.mockResolvedValue([]);
      await service.findAll(1, { minDaysOverdue: 31 });

      const call = prisma.invoice.findMany.mock.calls[0][0];
      expect(call.where.status).toEqual({ in: ['SENT', 'PARTIAL'] });
      expect(call.where.dueDate).toEqual({ lt: expect.any(Date) });
      // Threshold = now - 31 days. Use a small tolerance for clock drift between
      // test setup and call.
      const ms = (call.where.dueDate as { lt: Date }).lt.getTime();
      const expected = Date.now() - 31 * 86400000;
      expect(Math.abs(ms - expected)).toBeLessThan(60_000);
    });

    it('should respect minDaysOverdue=0 (any day past due)', async () => {
      prisma.invoice.findMany.mockResolvedValue([]);
      await service.findAll(1, { minDaysOverdue: 0 });

      const call = prisma.invoice.findMany.mock.calls[0][0];
      expect(call.where.status).toEqual({ in: ['SENT', 'PARTIAL'] });
      const ms = (call.where.dueDate as { lt: Date }).lt.getTime();
      expect(Math.abs(ms - Date.now())).toBeLessThan(60_000);
    });

    it('should combine minDaysOverdue with overdueOnly cleanly (idempotent)', async () => {
      prisma.invoice.findMany.mockResolvedValue([]);
      await service.findAll(1, { minDaysOverdue: 60, overdueOnly: true });

      const call = prisma.invoice.findMany.mock.calls[0][0];
      // minDaysOverdue is the stricter constraint and must win.
      expect(call.where.status).toEqual({ in: ['SENT', 'PARTIAL'] });
      const ms = (call.where.dueDate as { lt: Date }).lt.getTime();
      const expected = Date.now() - 60 * 86400000;
      expect(Math.abs(ms - expected)).toBeLessThan(60_000);
    });

    it('should apply search across invoice number, customer, load number, and load PO/reference', async () => {
      prisma.invoice.findMany.mockResolvedValue([]);
      await service.findAll(1, { search: 'PO-9' });

      const call = prisma.invoice.findMany.mock.calls[0][0];
      expect(call.where.OR).toHaveLength(4);
      expect(call.where.OR).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            load: expect.objectContaining({ referenceNumber: { contains: 'PO-9', mode: 'insensitive' } }),
          }),
        ]),
      );
    });

    it('should select load.referenceNumber so the PO is available for formatLoadLabel on the list view', async () => {
      prisma.invoice.findMany.mockResolvedValue([]);
      await service.findAll(1);

      const call = prisma.invoice.findMany.mock.calls[0][0];
      expect(call.include.load).toEqual({
        select: expect.objectContaining({ loadNumber: true, referenceNumber: true }),
      });
    });

    it('should sort by dueDate when specified', async () => {
      prisma.invoice.findMany.mockResolvedValue([]);
      await service.findAll(1, { sortBy: 'dueDate', sortOrder: 'asc' });

      const call = prisma.invoice.findMany.mock.calls[0][0];
      expect(call.orderBy).toEqual({ dueDate: 'asc' });
    });
  });

  // ─── findOne ────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return invoice with all relations', async () => {
      const invoice = makeInvoice({
        invoiceNumber: 'inv-001',
        issueDate: new Date(),
        dueDate: new Date(),
      });
      prisma.invoice.findFirst.mockResolvedValue(invoice);

      const result = await service.findOne(1, 'inv-001');

      expect(result.invoiceNumber).toBe('inv-001');
      expect(prisma.invoice.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            customer: true,
            lineItems: expect.any(Object),
            payments: expect.any(Object),
          }),
        }),
      );
    });

    it('should throw NotFoundException when invoice not found', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);
      await expect(service.findOne(1, 'not-found')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── update ──────────────────────────────────────────────────

  describe('update', () => {
    it('should update allowed fields on DRAFT invoice', async () => {
      const invoice = makeInvoice({
        status: 'DRAFT',
        invoiceNumber: 'inv-001',
        issueDate: new Date(),
        dueDate: new Date(),
        subtotalCents: 250000,
        adjustmentCents: 0,
        paidCents: 0,
      });
      prisma.invoice.findFirst.mockResolvedValue(invoice);
      prisma.invoice.update.mockResolvedValue({
        ...invoice,
        notes: 'Updated',
        issueDate: new Date(),
        dueDate: new Date(),
      });

      await service.update(1, 'inv-001', { notes: 'Updated' });

      expect(prisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ notes: 'Updated' }),
        }),
      );
    });

    it('should throw when editing non-DRAFT invoice', async () => {
      const invoice = makeInvoice({
        status: 'SENT',
        invoiceNumber: 'inv-001',
        issueDate: new Date(),
        dueDate: new Date(),
      });
      prisma.invoice.findFirst.mockResolvedValue(invoice);

      await expect(service.update(1, 'inv-001', { notes: 'test' })).rejects.toThrow('Can only edit draft invoices');
    });

    it('should replace line items and recalculate totals when lineItems provided', async () => {
      const invoice = makeInvoice({
        status: 'DRAFT',
        invoiceNumber: 'inv-001',
        issueDate: new Date(),
        dueDate: new Date(),
        subtotalCents: 250000,
        adjustmentCents: 0,
        paidCents: 0,
      });
      prisma.invoice.findFirst.mockResolvedValue(invoice);
      prisma.invoiceLineItem.deleteMany.mockResolvedValue({ count: 1 });
      prisma.invoiceLineItem.createMany.mockResolvedValue({ count: 1 });
      prisma.invoice.update.mockResolvedValue({
        ...invoice,
        issueDate: new Date(),
        dueDate: new Date(),
      });

      await service.update(1, 'inv-001', {
        lineItems: [
          {
            type: 'LINEHAUL',
            description: 'LH',
            quantity: 1,
            unitPriceCents: 300000,
          },
        ],
      });

      expect(prisma.invoiceLineItem.deleteMany).toHaveBeenCalled();
      expect(prisma.invoiceLineItem.createMany).toHaveBeenCalled();
      const updateCall = prisma.invoice.update.mock.calls[0][0];
      expect(updateCall.data.subtotalCents).toBe(300000);
      expect(updateCall.data.totalCents).toBe(300000);
    });

    it('should recalculate totals when adjustmentCents changes without new lineItems', async () => {
      const invoice = makeInvoice({
        status: 'DRAFT',
        invoiceNumber: 'inv-001',
        issueDate: new Date(),
        dueDate: new Date(),
        subtotalCents: 250000,
        adjustmentCents: 0,
        paidCents: 0,
      });
      prisma.invoice.findFirst.mockResolvedValue(invoice);
      prisma.invoice.update.mockResolvedValue({
        ...invoice,
        issueDate: new Date(),
        dueDate: new Date(),
      });

      await service.update(1, 'inv-001', { adjustmentCents: -5000 });

      const updateCall = prisma.invoice.update.mock.calls[0][0];
      expect(updateCall.data.adjustmentCents).toBe(-5000);
      expect(updateCall.data.totalCents).toBe(245000);
      expect(updateCall.data.balanceCents).toBe(245000);
    });
  });

  // ─── markSent ────────────────────────────────────────────────

  describe('markSent', () => {
    it('should transition DRAFT to SENT', async () => {
      const invoice = makeInvoice({
        status: 'DRAFT',
        invoiceNumber: 'inv-001',
        issueDate: new Date(),
        dueDate: new Date(),
        customer: makeCustomer(),
      });
      prisma.invoice.findFirst.mockResolvedValue(invoice);
      prisma.invoice.update.mockResolvedValue({
        ...invoice,
        status: 'SENT',
        issueDate: new Date(),
        dueDate: new Date(),
      });

      await service.markSent(1, 'inv-001');

      expect(prisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'SENT' },
        }),
      );
    });

    it('should throw when invoice is not DRAFT', async () => {
      const invoice = makeInvoice({
        status: 'SENT',
        invoiceNumber: 'inv-001',
        issueDate: new Date(),
        dueDate: new Date(),
      });
      prisma.invoice.findFirst.mockResolvedValue(invoice);

      await expect(service.markSent(1, 'inv-001')).rejects.toThrow('Can only send draft invoices');
    });
  });

  // ─── voidInvoice ─────────────────────────────────────────────

  describe('voidInvoice', () => {
    it('should transition to VOID and reset load billingStatus to APPROVED', async () => {
      const invoice = makeInvoice({
        status: 'SENT',
        invoiceNumber: 'inv-001',
        loadId: 10,
        issueDate: new Date(),
        dueDate: new Date(),
      });
      prisma.invoice.findFirst.mockResolvedValue(invoice);
      prisma.invoice.update.mockResolvedValue({
        ...invoice,
        status: 'VOID',
        issueDate: new Date(),
        dueDate: new Date(),
      });
      prisma.load.update.mockResolvedValue({});

      await service.voidInvoice(1, 'inv-001');

      expect(prisma.invoice.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'VOID' } }));
      expect(prisma.load.update).toHaveBeenCalledWith(expect.objectContaining({ data: { billingStatus: 'APPROVED' } }));
    });

    it('should throw when invoice is already VOID', async () => {
      const invoice = makeInvoice({
        status: 'VOID',
        invoiceNumber: 'inv-001',
        issueDate: new Date(),
        dueDate: new Date(),
      });
      prisma.invoice.findFirst.mockResolvedValue(invoice);

      await expect(service.voidInvoice(1, 'inv-001')).rejects.toThrow('Invoice is already voided');
    });

    it('should throw when invoice is PAID', async () => {
      const invoice = makeInvoice({
        status: 'PAID',
        invoiceNumber: 'inv-001',
        issueDate: new Date(),
        dueDate: new Date(),
      });
      prisma.invoice.findFirst.mockResolvedValue(invoice);

      await expect(service.voidInvoice(1, 'inv-001')).rejects.toThrow('Cannot void a fully paid invoice');
    });
  });

  // ─── getSummary ──────────────────────────────────────────────

  describe('getSummary', () => {
    it('should calculate AR summary with aging buckets', async () => {
      const now = new Date();
      const daysAgoDate = (d: number) => new Date(now.getTime() - d * 86400000);

      prisma.invoice.findMany.mockResolvedValue([
        { balanceCents: 10000, dueDate: daysAgoDate(10), status: 'SENT' }, // 1-30 bucket
        { balanceCents: 20000, dueDate: daysAgoDate(45), status: 'SENT' }, // 31-60 bucket
        { balanceCents: 5000, dueDate: daysAgoDate(-3), status: 'SENT' }, // current, due this week
      ]);
      prisma.payment.aggregate.mockResolvedValue({
        _sum: { amountCents: 50000 },
      });
      prisma.invoice.count.mockResolvedValue(2);
      prisma.load.count.mockResolvedValue(3);
      prisma.invoice.aggregate.mockResolvedValue({
        _sum: { totalCents: 100000 },
        _count: 1,
      });

      const result = await service.getSummary(1);

      expect(result.outstandingCents).toBe(35000);
      expect(result.overdueCents).toBe(30000);
      expect(result.aging.days1_30.amountCents).toBe(10000);
      expect(result.aging.days31_60.amountCents).toBe(20000);
      expect(result.aging.current.amountCents).toBe(5000);
      expect(result.dueThisWeekCents).toBe(5000);
      expect(result.draftCount).toBe(2);
      expect(result.readyToInvoiceCount).toBe(3);
    });

    describe('DSO (days sales outstanding)', () => {
      const now = new Date();
      const daysAgoDate = (d: number) => new Date(now.getTime() - d * 86400000);

      function setupAgingMocks() {
        prisma.payment.aggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
        prisma.invoice.count.mockResolvedValue(0);
        prisma.load.count.mockResolvedValue(0);
        prisma.invoice.aggregate.mockResolvedValue({ _sum: { totalCents: 0 }, _count: 0 });
      }

      it('returns the average days from issueDate to paidDate over the last 90 days', async () => {
        setupAgingMocks();
        // First call (aging) → empty list. Second call (paid window) → six paid invoices.
        prisma.invoice.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
          { issueDate: daysAgoDate(40), paidDate: daysAgoDate(10) }, // 30 days
          { issueDate: daysAgoDate(50), paidDate: daysAgoDate(20) }, // 30 days
          { issueDate: daysAgoDate(60), paidDate: daysAgoDate(35) }, // 25 days
          { issueDate: daysAgoDate(45), paidDate: daysAgoDate(5) }, //  40 days
          { issueDate: daysAgoDate(35), paidDate: daysAgoDate(0) }, //  35 days
          { issueDate: daysAgoDate(80), paidDate: daysAgoDate(35) }, // 45 days
        ]);

        const result = await service.getSummary(1);
        // (30+30+25+40+35+45) / 6 = 205 / 6 ≈ 34.17 → rounded to 34
        expect(result.dsoDays).toBe(34);
      });

      it('omits dsoDays when fewer than 5 invoices were paid in the last 90 days', async () => {
        setupAgingMocks();
        prisma.invoice.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
          { issueDate: daysAgoDate(40), paidDate: daysAgoDate(10) },
          { issueDate: daysAgoDate(50), paidDate: daysAgoDate(20) },
          { issueDate: daysAgoDate(60), paidDate: daysAgoDate(35) },
          { issueDate: daysAgoDate(45), paidDate: daysAgoDate(5) },
        ]);

        const result = await service.getSummary(1);
        expect(result.dsoDays).toBeUndefined();
      });

      it('omits dsoDays when there are no paid invoices in the window', async () => {
        setupAgingMocks();
        prisma.invoice.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

        const result = await service.getSummary(1);
        expect(result.dsoDays).toBeUndefined();
      });
    });
  });

  // ─── batchGenerate ──────────────────────────────────────────

  describe('batchGenerate', () => {
    it('should collect successes and errors', async () => {
      // Mock generateFromLoad via the service's internals
      const load1 = makeDeliveredLoad({
        loadNumber: 'ld-1',
        customerId: 1,
        customer: makeCustomer(),
        billingStatus: 'APPROVED',
      });

      // First call succeeds, second fails
      prisma.load.findFirst.mockResolvedValueOnce(load1).mockResolvedValueOnce(null); // second load not found

      prisma.loadCharge.count.mockResolvedValue(1);
      prisma.invoice.findFirst.mockResolvedValue(null);
      prisma.invoiceSettings.findUnique.mockResolvedValue(null);
      prisma.loadCharge.findMany.mockResolvedValue([
        {
          chargeType: 'linehaul',
          description: 'LH',
          quantity: 1,
          unitPriceCents: 100000,
          totalCents: 100000,
        },
      ]);
      const created = makeInvoice({
        issueDate: new Date(),
        dueDate: new Date(),
        lineItems: [],
        customer: makeCustomer(),
        load: load1,
      });
      prisma.invoice.create.mockResolvedValue(created);
      prisma.load.update.mockResolvedValue(load1);

      const result = await service.batchGenerate(1, ['ld-1', 'ld-2']);

      expect(result.successCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.total).toBe(2);
    });
  });

  // ─── batchSend ──────────────────────────────────────────────

  describe('batchSend', () => {
    it('should send draft invoices and skip non-drafts', async () => {
      prisma.invoice.findFirst.mockResolvedValueOnce(makeInvoice({ status: 'DRAFT' })).mockResolvedValueOnce(null);
      prisma.invoice.update.mockResolvedValue({});

      const result = await service.batchSend(1, ['inv-1', 'inv-2']);

      expect(result.sent).toBe(1);
      expect(result.skipped).toBe(1);
    });
  });

  // ─── batchVoid ──────────────────────────────────────────────

  describe('batchVoid', () => {
    it('should void invoices and skip those that cannot be voided', async () => {
      // First invoice: voidable (SENT)
      const inv1 = makeInvoice({
        invoiceNumber: 'inv-1',
        status: 'SENT',
        loadId: 10,
        issueDate: new Date(),
        dueDate: new Date(),
      });
      // Second invoice: already VOID
      const inv2 = makeInvoice({
        invoiceNumber: 'inv-2',
        status: 'VOID',
        issueDate: new Date(),
        dueDate: new Date(),
      });

      prisma.invoice.findFirst
        .mockResolvedValueOnce(inv1) // findOne for inv-1
        .mockResolvedValueOnce(inv2); // findOne for inv-2

      prisma.invoice.update.mockResolvedValue({
        ...inv1,
        status: 'VOID',
        issueDate: new Date(),
        dueDate: new Date(),
      });
      prisma.load.update.mockResolvedValue({});

      const result = await service.batchVoid(1, ['inv-1', 'inv-2']);

      expect(result.voided).toBe(1);
      expect(result.skipped).toBe(1);
    });
  });

  // ─── batchMarkPaid ────────────────────────────────────────

  describe('batchMarkPaid', () => {
    it('should mark sent invoices as paid', async () => {
      const invoice = makeInvoice({
        invoiceNumber: 'inv-1',
        status: 'SENT',
        totalCents: 250000,
        balanceCents: 250000,
      });

      prisma.invoice.findFirst.mockResolvedValue(invoice);
      prisma.payment.create.mockResolvedValue({ id: 1 });
      prisma.invoice.update.mockResolvedValue({});

      const result = await service.batchMarkPaid(1, ['inv-1'], {
        paymentDate: '2026-03-15',
        paymentMethod: 'check',
      });

      expect(result.paid).toBe(1);
      expect(result.skipped).toBe(0);
    });

    it('should skip invoices that are not SENT or PARTIAL', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);

      const result = await service.batchMarkPaid(1, ['inv-1'], {
        paymentDate: '2026-03-15',
      });

      expect(result.paid).toBe(0);
      expect(result.skipped).toBe(1);
    });
  });

  // ─── reInvoice ────────────────────────────────────────────

  describe('reInvoice', () => {
    it('should re-generate invoice from voided invoice load', async () => {
      const voidedInvoice = makeInvoice({
        invoiceNumber: 'inv-1',
        status: 'VOID',
        load: { loadNumber: 'ld-001' },
      });
      prisma.invoice.findFirst
        .mockResolvedValueOnce(voidedInvoice) // reInvoice lookup
        .mockResolvedValueOnce(null) // inside generateFromLoad: no existing invoice
        .mockResolvedValueOnce(null); // collision check

      // Mock generateFromLoad chain
      const load = makeDeliveredLoad({
        loadNumber: 'ld-001',
        customerId: 1,
        customer: makeCustomer(),
        billingStatus: 'APPROVED',
        rateCents: 250000,
        stops: [],
      });
      prisma.load.findFirst.mockResolvedValue(load);
      prisma.loadCharge.count.mockResolvedValue(1);
      prisma.invoiceSettings.findUnique.mockResolvedValue(null);
      prisma.loadCharge.findMany.mockResolvedValue([
        {
          chargeType: 'linehaul',
          description: 'LH',
          quantity: 1,
          unitPriceCents: 250000,
          totalCents: 250000,
        },
      ]);
      const newInvoice = makeInvoice({
        invoiceNumber: 'INV-2026-0002',
        issueDate: new Date(),
        dueDate: new Date(),
        lineItems: [],
        customer: makeCustomer(),
        load,
      });
      prisma.invoice.create.mockResolvedValue(newInvoice);
      prisma.load.update.mockResolvedValue(load);

      const result = await service.reInvoice(1, 'inv-1');

      expect(result.invoiceNumber).toBe('INV-2026-0002');
    });

    it('should throw NotFoundException when voided invoice not found', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.reInvoice(1, 'not-found')).rejects.toThrow('Voided invoice not found');
    });
  });

  // ─── update with paymentTermsDays ──────────────────────────

  describe('update with paymentTermsDays', () => {
    it('should recalculate dueDate when paymentTermsDays is changed', async () => {
      const issueDate = new Date('2026-03-01');
      const invoice = makeInvoice({
        status: 'DRAFT',
        invoiceNumber: 'inv-001',
        issueDate,
        dueDate: new Date('2026-03-31'),
        subtotalCents: 250000,
        adjustmentCents: 0,
        paidCents: 0,
      });
      prisma.invoice.findFirst.mockResolvedValue(invoice);
      prisma.invoice.update.mockResolvedValue({
        ...invoice,
        issueDate,
        dueDate: new Date('2026-04-14'),
      });

      await service.update(1, 'inv-001', { paymentTermsDays: 45 });

      const updateCall = prisma.invoice.update.mock.calls[0][0];
      expect(updateCall.data.paymentTermsDays).toBe(45);
      expect(updateCall.data.dueDate).toBeDefined();
    });
  });

  // ─── findAll with sorting ─────────────────────────────────

  describe('findAll sorting', () => {
    it('should sort by amount', async () => {
      prisma.invoice.findMany.mockResolvedValue([]);
      await service.findAll(1, { sortBy: 'amount', sortOrder: 'desc' });

      const call = prisma.invoice.findMany.mock.calls[0][0];
      expect(call.orderBy).toEqual({ totalCents: 'desc' });
    });

    it('should sort by issueDate', async () => {
      prisma.invoice.findMany.mockResolvedValue([]);
      await service.findAll(1, { sortBy: 'issueDate', sortOrder: 'asc' });

      const call = prisma.invoice.findMany.mock.calls[0][0];
      expect(call.orderBy).toEqual({ issueDate: 'asc' });
    });

    it('should default to createdAt desc for unknown sortBy', async () => {
      prisma.invoice.findMany.mockResolvedValue([]);
      await service.findAll(1, { sortBy: 'unknown' });

      const call = prisma.invoice.findMany.mock.calls[0][0];
      expect(call.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('should filter by customerId', async () => {
      prisma.invoice.findMany.mockResolvedValue([]);
      await service.findAll(1, { customerId: 5 });

      const call = prisma.invoice.findMany.mock.calls[0][0];
      expect(call.where.customerId).toBe(5);
    });

    it('should filter by billingPath', async () => {
      prisma.invoice.findMany.mockResolvedValue([]);
      await service.findAll(1, { billingPath: 'FACTORED' });

      const call = prisma.invoice.findMany.mock.calls[0][0];
      expect(call.where.billingPath).toBe('FACTORED');
    });
  });

  // ─── getCustomerPaymentStats ─────────────────────────────────

  describe('getCustomerPaymentStats', () => {
    it('should return hasHistory false when no paid invoices', async () => {
      prisma.invoice.findMany.mockResolvedValue([]);
      const result = await service.getCustomerPaymentStats(1, 1);
      expect(result.hasHistory).toBe(false);
    });

    it('should calculate average days to pay and reliability', async () => {
      const now = new Date();
      const issueDate = new Date(now.getTime() - 15 * 86400000);
      prisma.invoice.findMany.mockResolvedValue([{ issueDate, paidDate: now, totalCents: 100000 }]);
      prisma.invoice.aggregate.mockResolvedValue({
        _sum: { balanceCents: 5000 },
        _count: 1,
      });

      const result = await service.getCustomerPaymentStats(1, 1);

      expect(result.hasHistory).toBe(true);
      expect(result.avgDaysToPay).toBe(15);
      expect(result.reliability).toBe('Excellent');
      expect(result.totalInvoicesPaid).toBe(1);
    });

    it('should return Good reliability for avg 25 days', async () => {
      const now = new Date();
      const issueDate = new Date(now.getTime() - 25 * 86400000);
      prisma.invoice.findMany.mockResolvedValue([{ issueDate, paidDate: now, totalCents: 100000 }]);
      prisma.invoice.aggregate.mockResolvedValue({
        _sum: { balanceCents: 0 },
        _count: 0,
      });

      const result = await service.getCustomerPaymentStats(1, 2);

      expect(result.reliability).toBe('Good');
    });

    it('should return Average reliability for avg 40 days', async () => {
      const now = new Date();
      const issueDate = new Date(now.getTime() - 40 * 86400000);
      prisma.invoice.findMany.mockResolvedValue([{ issueDate, paidDate: now, totalCents: 100000 }]);
      prisma.invoice.aggregate.mockResolvedValue({
        _sum: { balanceCents: 0 },
        _count: 0,
      });

      const result = await service.getCustomerPaymentStats(1, 3);

      expect(result.reliability).toBe('Average');
    });

    it('should return Slow reliability for avg 60 days', async () => {
      const now = new Date();
      const issueDate = new Date(now.getTime() - 60 * 86400000);
      prisma.invoice.findMany.mockResolvedValue([{ issueDate, paidDate: now, totalCents: 100000 }]);
      prisma.invoice.aggregate.mockResolvedValue({
        _sum: { balanceCents: 0 },
        _count: 0,
      });

      const result = await service.getCustomerPaymentStats(1, 4);

      expect(result.reliability).toBe('Slow');
    });

    it('should handle invoices with null paidDate', async () => {
      prisma.invoice.findMany.mockResolvedValue([{ issueDate: new Date(), paidDate: null, totalCents: 100000 }]);
      prisma.invoice.aggregate.mockResolvedValue({
        _sum: { balanceCents: 0 },
        _count: 0,
      });

      const result = await service.getCustomerPaymentStats(1, 5);

      expect(result.hasHistory).toBe(true);
      expect(result.avgDaysToPay).toBe(0);
    });
  });
});
