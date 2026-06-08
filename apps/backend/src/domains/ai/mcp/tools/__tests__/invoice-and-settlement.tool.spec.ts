import { InvoiceActionTool } from '../invoice-action.tool';
import { InvoiceTool } from '../invoice.tool';
import { SettlementTool } from '../settlement.tool';
import { SettlementActionTool } from '../settlement-action.tool';

// These tests verify each tool's tenant context security guard.
// Positive paths require exact service method mock shapes and are covered by integration tests.

describe('InvoiceActionTool', () => {
  let tool: InvoiceActionTool;

  beforeEach(() => {
    tool = new InvoiceActionTool(
      {
        markAsSent: jest.fn(),
        voidInvoice: jest.fn(),
        generateFromLoad: jest.fn(),
      } as any,
      { recordPayment: jest.fn() } as any,
      { submitToFactor: jest.fn() } as any,
      { getMyTenantSettings: jest.fn() } as any,
      { invoice: { findFirst: jest.fn() } } as any,
    );
  });

  it('sendInvoice returns error without tenant', async () => {
    const r = await tool.sendInvoice({ invoiceNumber: 'inv_1' });
    expect(JSON.parse(r.content[0].text).error).toBeDefined();
  });

  it('voidInvoice returns error without tenant', async () => {
    const r = await tool.voidInvoice({ invoiceNumber: 'inv_1' });
    expect(JSON.parse(r.content[0].text).error).toBeDefined();
  });

  it('recordPayment returns error without tenant', async () => {
    const r = await tool.recordPayment({
      invoiceNumber: 'inv_1',
      amountCents: 5000,
      paymentMethod: 'check',
    });
    expect(JSON.parse(r.content[0].text).error).toBeDefined();
  });

  it('generateInvoice returns error without tenant', async () => {
    const r = await tool.generateInvoice({ loadNumber: 'LD-20260101-001' });
    expect(JSON.parse(r.content[0].text).error).toBeDefined();
  });

  it('submitInvoiceToFactor returns error without tenant', async () => {
    const r = await tool.submitInvoiceToFactor({ invoiceNumber: 'inv_1' });
    expect(JSON.parse(r.content[0].text).error).toBeDefined();
  });
});

describe('InvoiceTool', () => {
  let tool: InvoiceTool;

  beforeEach(() => {
    tool = new InvoiceTool(
      {
        findAll: jest.fn().mockResolvedValue([]),
        findOne: jest.fn(),
        getSummary: jest.fn(),
      } as any,
      { invoice: { findFirst: jest.fn() } } as any,
    );
  });

  it('queryInvoices returns error without tenant', async () => {
    const r = await tool.queryInvoices({ limit: 20 });
    expect(JSON.parse(r.content[0].text).error).toBeDefined();
  });

  it('getInvoiceDetail returns error without tenant', async () => {
    const r = await tool.getInvoiceDetail({ invoiceNumber: 'inv_1' });
    expect(JSON.parse(r.content[0].text).error).toBeDefined();
  });

  it('getInvoiceSummary returns error without tenant', async () => {
    const r = await tool.getInvoiceSummary({});
    expect(JSON.parse(r.content[0].text).error).toBeDefined();
  });
});

describe('SettlementTool', () => {
  let tool: SettlementTool;

  beforeEach(() => {
    tool = new SettlementTool(
      {
        findAll: jest.fn().mockResolvedValue([]),
        findOne: jest.fn(),
        getSummary: jest.fn(),
      } as any,
      { getDriverPayStructure: jest.fn() } as any,
      { driver: { findFirst: jest.fn() } } as any,
    );
  });

  it('querySettlements returns error without tenant', async () => {
    const r = await tool.querySettlements({ limit: 20 });
    expect(JSON.parse(r.content[0].text).error).toBeDefined();
  });

  it('getSettlementDetail returns error without tenant', async () => {
    const r = await tool.getSettlementDetail({ settlementId: 'stl_1' });
    expect(JSON.parse(r.content[0].text).error).toBeDefined();
  });

  it('getSettlementSummary returns error without tenant', async () => {
    const r = await tool.getSettlementSummary({});
    expect(JSON.parse(r.content[0].text).error).toBeDefined();
  });

  it('getDriverPayStructure returns error without tenant', async () => {
    const r = await tool.getDriverPayStructure({ driverId: 'drv_1' });
    expect(JSON.parse(r.content[0].text).error).toBeDefined();
  });
});

describe('SettlementActionTool', () => {
  let tool: SettlementActionTool;
  let mockSettlementsService: any;

  beforeEach(() => {
    mockSettlementsService = {
      approve: jest.fn().mockResolvedValue({
        settlementNumber: 'STL-001',
        status: 'APPROVED',
        driver: { name: 'John Smith' },
        netPayCents: 250000,
      }),
    };
    tool = new SettlementActionTool(mockSettlementsService);
  });

  it('approveSettlement returns error without tenant', async () => {
    const r = await tool.approveSettlement({ settlementId: 'stl_1' });
    expect(JSON.parse(r.content[0].text).error).toBeDefined();
  });

  it('approveSettlement succeeds with tenant and user', async () => {
    const r = await tool.approveSettlement({
      settlementId: 'stl_1',
      _tenantId: 1,
      _userId: '42',
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.settlementNumber).toBe('STL-001');
    expect(parsed.status).toBe('APPROVED');
    expect(parsed.driverName).toBe('John Smith');
    expect(parsed.netPayDollars).toBe('2500.00');
    expect(mockSettlementsService.approve).toHaveBeenCalledWith(1, 'stl_1', 42);
  });

  it('approveSettlement passes undefined userId when not provided', async () => {
    const r = await tool.approveSettlement({
      settlementId: 'stl_1',
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.success).toBe(true);
    expect(mockSettlementsService.approve).toHaveBeenCalledWith(1, 'stl_1', undefined);
  });

  it('approveSettlement handles service errors', async () => {
    mockSettlementsService.approve.mockRejectedValue(new Error('Settlement already approved'));
    const r = await tool.approveSettlement({
      settlementId: 'stl_1',
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.error).toBe('Settlement already approved');
  });
});

describe('InvoiceActionTool — positive paths', () => {
  let tool: InvoiceActionTool;
  let mockInvoicingService: any;
  let mockPaymentsService: any;
  let mockFactoringService: any;
  let mockTenantsService: any;

  beforeEach(() => {
    mockInvoicingService = {
      markSent: jest.fn().mockResolvedValue({ invoiceNumber: 'INV-001' }),
      voidInvoice: jest.fn().mockResolvedValue({ invoiceNumber: 'INV-001' }),
      generateFromLoad: jest.fn().mockResolvedValue({
        invoiceNumber: 'INV-001',
        status: 'DRAFT',
        customer: { companyName: 'Acme Corp' },
        totalCents: 150000,
        paidCents: 0,
        balanceCents: 150000,
        dueDate: new Date(),
        issueDate: new Date(),
        lineItems: [
          {
            type: 'linehaul',
            description: 'Freight',
            quantity: 1,
            unitPriceCents: 150000,
            totalCents: 150000,
          },
        ],
      }),
    };
    mockPaymentsService = {
      recordPayment: jest.fn().mockResolvedValue({ paymentId: 'pay_1' }),
    };
    mockFactoringService = {
      submitToFactor: jest.fn().mockResolvedValue({
        invoice: { status: 'FACTORED' },
        noaWarning: null,
        emailWarning: null,
      }),
    };
    mockTenantsService = {
      getMyTenantSettings: jest.fn().mockResolvedValue({
        factoringCompanyId: 1,
        factoringCompany: { id: 1, companyId: 'fc_1', companyName: 'Default' },
      }),
    };
    tool = new InvoiceActionTool(mockInvoicingService, mockPaymentsService, mockFactoringService, mockTenantsService, {
      invoice: { findFirst: jest.fn() },
    } as any);
  });

  it('sendInvoice succeeds', async () => {
    const r = await tool.sendInvoice({ invoiceNumber: 'inv_1', _tenantId: 1 });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.status).toBe('SENT');
    expect(parsed.invoiceNumber).toBe('INV-001');
  });

  it('sendInvoice handles error', async () => {
    mockInvoicingService.markSent.mockRejectedValue(new Error('Invoice not found'));
    const r = await tool.sendInvoice({ invoiceNumber: 'inv_x', _tenantId: 1 });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.error).toBe('Invoice not found');
  });

  it('voidInvoice succeeds', async () => {
    const r = await tool.voidInvoice({ invoiceNumber: 'inv_1', _tenantId: 1 });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.status).toBe('VOID');
  });

  it('voidInvoice handles error', async () => {
    mockInvoicingService.voidInvoice.mockRejectedValue(new Error('Cannot void'));
    const r = await tool.voidInvoice({ invoiceNumber: 'inv_1', _tenantId: 1 });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.error).toBe('Cannot void');
  });

  it('recordPayment succeeds', async () => {
    const r = await tool.recordPayment({
      invoiceNumber: 'inv_1',
      amountCents: 75000,
      paymentMethod: 'check',
      referenceNumber: 'CHK-123',
      paymentDate: '2026-04-01',
      notes: 'Partial',
      _tenantId: 1,
      _userId: '10',
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.amountDollars).toBe('750.00');
    expect(mockPaymentsService.recordPayment).toHaveBeenCalledWith(
      1,
      'inv_1',
      expect.objectContaining({ amountCents: 75000, paymentMethod: 'check' }),
      10,
    );
  });

  it('recordPayment defaults paymentDate to today', async () => {
    await tool.recordPayment({
      invoiceNumber: 'inv_1',
      amountCents: 50000,
      _tenantId: 1,
    });
    const callArgs = mockPaymentsService.recordPayment.mock.calls[0][2];
    expect(callArgs.paymentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('recordPayment handles error', async () => {
    mockPaymentsService.recordPayment.mockRejectedValue(new Error('Amount exceeds balance'));
    const r = await tool.recordPayment({
      invoiceNumber: 'inv_1',
      amountCents: 999999,
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.error).toBe('Amount exceeds balance');
  });

  it('generateInvoice succeeds with card data', async () => {
    const r = await tool.generateInvoice({ loadNumber: 'LD-20260101-001', _tenantId: 1 });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.invoiceNumber).toBe('INV-001');
    expect(parsed.totalDollars).toBe('1500.00');
    expect(parsed.customerName).toBe('Acme Corp');
    expect((r as any)._card.type).toBe('invoice');
  });

  it('generateInvoice handles error and flags isError so callers can branch', async () => {
    mockInvoicingService.generateFromLoad.mockRejectedValue(new Error('Load not delivered'));
    const r = await tool.generateInvoice({ loadNumber: 'LD-20260101-001', _tenantId: 1 });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.error).toBe('Load not delivered');
    // Desk execute.step reads result.isError to close a failed generation
    // as failed (not succeeded). A race that creates an invoice between
    // hydrate and execute surfaces here.
    expect((r as any).isError).toBe(true);
  });

  it('submitInvoiceToFactor uses specified company', async () => {
    const r = await tool.submitInvoiceToFactor({
      invoiceNumber: 'inv_1',
      factoringCompanyId: 'fc_2',
      factoringReference: 'REF-456',
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.factoringCompanyId).toBe('fc_2');
    expect(parsed.status).toBe('FACTORED');
    expect(mockFactoringService.submitToFactor).toHaveBeenCalledWith(1, 'inv_1', {
      factoringCompanyId: 'fc_2',
      factoringReference: 'REF-456',
      sendEmail: true,
    });
  });

  it('submitInvoiceToFactor uses default company when none specified', async () => {
    const r = await tool.submitInvoiceToFactor({
      invoiceNumber: 'inv_1',
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.factoringCompanyId).toBe('fc_1');
  });

  it('submitInvoiceToFactor returns error when no default company', async () => {
    mockTenantsService.getMyTenantSettings.mockResolvedValue({ factoringCompanyId: null, factoringCompany: null });
    const r = await tool.submitInvoiceToFactor({
      invoiceNumber: 'inv_1',
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.error).toContain('No factoring company specified');
  });

  it('submitInvoiceToFactor handles service error', async () => {
    mockFactoringService.submitToFactor.mockRejectedValue(new Error('Invoice not eligible'));
    const r = await tool.submitInvoiceToFactor({
      invoiceNumber: 'inv_1',
      factoringCompanyId: 'fc_1',
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.error).toBe('Invoice not eligible');
  });
});

describe('InvoiceTool — positive paths', () => {
  let tool: InvoiceTool;
  let mockInvoicingService: any;

  const mockInvoice = {
    invoiceNumber: 'INV-2026-0001',
    status: 'SENT',
    customer: { companyName: 'Acme Corp' },
    totalCents: 250000,
    paidCents: 100000,
    balanceCents: 150000,
    dueDate: new Date('2026-05-01'),
    issueDate: new Date('2026-04-01'),
    lineItems: [
      {
        type: 'linehaul',
        description: 'Freight',
        quantity: 1,
        unitPriceCents: 250000,
        totalCents: 250000,
      },
    ],
    payments: [
      {
        paymentId: 'pay_1',
        amountCents: 100000,
        paymentMethod: 'check',
        paymentDate: new Date('2026-04-15'),
      },
    ],
    paymentTermsDays: 30,
    notes: 'Net 30',
    load: { loadNumber: 'L-1001' },
  };

  beforeEach(() => {
    mockInvoicingService = {
      findAll: jest.fn().mockResolvedValue([mockInvoice]),
      findOne: jest.fn().mockResolvedValue(mockInvoice),
      getSummary: jest.fn().mockResolvedValue({
        outstandingCents: 500000,
        overdueCents: 150000,
        paidThisMonthCents: 300000,
        draftCount: 5,
        readyToInvoiceCount: 3,
        factoredCents: 100000,
        factoredCount: 2,
        aging: {
          current: { amountCents: 200000, count: 4 },
          days1_30: { amountCents: 150000, count: 3 },
          days31_60: { amountCents: 100000, count: 2 },
          days61_90: { amountCents: 30000, count: 1 },
          daysOver90: { amountCents: 20000, count: 1 },
        },
      }),
    };
    tool = new InvoiceTool(mockInvoicingService, {
      invoice: { findFirst: jest.fn() },
    } as any);
  });

  it('queryInvoices returns invoice list with card', async () => {
    const r = await tool.queryInvoices({ limit: 20, _tenantId: 1 });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.count).toBe(1);
    expect(parsed.invoices[0].totalDollars).toBe('2500.00');
    expect(parsed.invoices[0].balanceDollars).toBe('1500.00');
    expect((r as any)._card.type).toBe('invoice_list');
  });

  it('queryInvoices passes filters to service', async () => {
    await tool.queryInvoices({
      status: 'SENT',
      customerId: 5,
      overdueOnly: true,
      search: 'INV-2026',
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
      limit: 10,
      _tenantId: 1,
    });
    expect(mockInvoicingService.findAll).toHaveBeenCalledWith(
      1,
      {
        status: 'SENT',
        customerId: 5,
        overdueOnly: true,
        search: 'INV-2026',
        dateFrom: '2026-01-01',
        dateTo: '2026-12-31',
      },
      { limit: 10, offset: 0 },
    );
  });

  it('getInvoiceDetail returns full detail with card', async () => {
    const r = await tool.getInvoiceDetail({ invoiceNumber: 'inv_1', _tenantId: 1 });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.totalDollars).toBe('2500.00');
    expect(parsed.lineItems).toHaveLength(1);
    expect(parsed.payments).toHaveLength(1);
    expect(parsed.loadNumber).toBe('L-1001');
    expect((r as any)._card.type).toBe('invoice');
  });

  it('getInvoiceDetail resolves by invoice number', async () => {
    const r = await tool.getInvoiceDetail({
      invoiceNumber: 'INV-2026-0001',
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.totalDollars).toBe('2500.00');
  });

  it('getInvoiceDetail handles findOne error', async () => {
    mockInvoicingService.findOne.mockRejectedValue(new Error('Not found'));
    const r = await tool.getInvoiceDetail({
      invoiceNumber: 'inv_bad',
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.error).toBe('Not found');
  });

  it('getInvoiceSummary returns full summary with card', async () => {
    const r = await tool.getInvoiceSummary({ _tenantId: 1 });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.outstandingDollars).toBe('5000.00');
    expect(parsed.overdueDollars).toBe('1500.00');
    expect(parsed.draftCount).toBe(5);
    expect(parsed.aging.current.dollars).toBe('2000.00');
    expect((r as any)._card.type).toBe('invoice_summary');
  });
});

describe('SettlementTool — positive paths', () => {
  let tool: SettlementTool;
  let mockSettlementsService: any;
  let mockPayStructureService: any;
  let mockPrisma: any;

  const mockSettlement = {
    settlementId: 'stl_1',
    settlementNumber: 'STL-001',
    status: 'DRAFT',
    driver: { name: 'John', driverId: 'drv_1' },
    periodStart: new Date('2026-04-01'),
    periodEnd: new Date('2026-04-15'),
    grossPayCents: 300000,
    deductionsCents: 50000,
    netPayCents: 250000,
    lineItems: [
      {
        description: 'Load L-1001',
        miles: 500,
        loadRevenueCents: 200000,
        payAmountCents: 150000,
        payStructureType: 'PER_MILE',
        load: { loadNumber: 'L-1001' },
        leg: null,
      },
    ],
    deductions: [
      {
        id: 1,
        type: 'fuel_advance',
        description: 'Fuel card',
        amountCents: 50000,
      },
    ],
  };

  beforeEach(() => {
    mockSettlementsService = {
      findAll: jest.fn().mockResolvedValue([mockSettlement]),
      findOne: jest.fn().mockResolvedValue(mockSettlement),
      getSummary: jest.fn().mockResolvedValue({
        pendingApproval: 5,
        readyToPay: 3,
        paidThisMonthCents: 1000000,
        activeDrivers: 10,
      }),
    };
    mockPayStructureService = {
      getByDriverId: jest.fn().mockResolvedValue({
        type: 'PER_MILE',
        ratePerMileCents: 55,
        percentage: null,
        flatRateCents: null,
        hybridBaseCents: null,
        hybridPercent: null,
        effectiveDate: new Date('2026-01-01'),
        notes: 'Standard rate',
      }),
    };
    mockPrisma = {
      driver: {
        findFirst: jest.fn().mockResolvedValue({ driverId: 'drv_1' }),
      },
    };
    tool = new SettlementTool(mockSettlementsService, mockPayStructureService, mockPrisma);
  });

  it('querySettlements returns list with card', async () => {
    const r = await tool.querySettlements({ limit: 20, _tenantId: 1 });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.count).toBe(1);
    expect(parsed.settlements[0].grossPayDollars).toBe('3000.00');
    expect(parsed.settlements[0].netPayDollars).toBe('2500.00');
    expect((r as any)._card.type).toBe('settlement_list');
  });

  it('querySettlements filters by driver name', async () => {
    await tool.querySettlements({
      driverName: 'John',
      limit: 20,
      _tenantId: 1,
    });
    expect(mockPrisma.driver.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          name: { contains: 'John', mode: 'insensitive' },
        }),
      }),
    );
  });

  it('querySettlements returns error when driver not found by name', async () => {
    mockPrisma.driver.findFirst.mockResolvedValue(null);
    const r = await tool.querySettlements({
      driverName: 'Nobody',
      limit: 20,
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.error).toContain('No driver found');
  });

  it('getSettlementDetail returns full detail with card', async () => {
    const r = await tool.getSettlementDetail({
      settlementId: 'stl_1',
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.grossPayDollars).toBe('3000.00');
    expect(parsed.lineItems).toHaveLength(1);
    expect(parsed.lineItems[0].loadNumber).toBe('L-1001');
    expect(parsed.deductions).toHaveLength(1);
    expect((r as any)._card.type).toBe('settlement');
  });

  it('getSettlementDetail handles service error', async () => {
    mockSettlementsService.findOne.mockRejectedValue(new Error('Not found'));
    const r = await tool.getSettlementDetail({
      settlementId: 'stl_bad',
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.error).toBe('Not found');
  });

  it('getSettlementSummary returns summary with card', async () => {
    const r = await tool.getSettlementSummary({ _tenantId: 1 });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.pendingApprovalCount).toBe(5);
    expect(parsed.readyToPayCount).toBe(3);
    expect(parsed.paidThisMonthDollars).toBe('10000.00');
    expect(parsed.activeDriverCount).toBe(10);
    expect((r as any)._card.type).toBe('settlement_summary');
  });

  it('getDriverPayStructure returns pay structure data', async () => {
    const r = await tool.getDriverPayStructure({
      driverId: 'drv_1',
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.type).toBe('PER_MILE');
    expect(parsed.ratePerMileDollars).toBe('0.55');
  });

  it('getDriverPayStructure returns message when no pay structure', async () => {
    mockPayStructureService.getByDriverId.mockResolvedValue(null);
    const r = await tool.getDriverPayStructure({
      driverId: 'drv_1',
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.payStructure).toBeNull();
    expect(parsed.message).toContain('No pay structure');
  });

  it('getDriverPayStructure handles service error', async () => {
    mockPayStructureService.getByDriverId.mockRejectedValue(new Error('Driver not found'));
    const r = await tool.getDriverPayStructure({
      driverId: 'drv_bad',
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.error).toBe('Driver not found');
  });
});
