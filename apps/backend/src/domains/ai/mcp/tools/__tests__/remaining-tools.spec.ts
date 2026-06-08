import { DriverPayTool } from '../driver-pay.tool';
import { DocumentTool } from '../document.tool';
import { DriverContextTool } from '../driver-context.tool';
import { EDIActionTool } from '../edi-action.tool';
import { RoutePlanningTool } from '../route-planning.tool';
import { ShieldTool } from '../shield.tool';
import { IftaTool } from '../ifta.tool';
import { ReportTool } from '../report.tool';
import { CustomFieldQueryTool } from '../custom-field-query.tool';
import { HealthTool } from '../health.tool';
import { CapabilitiesTool } from '../help/capabilities.tool';

// These tests verify that each tool correctly guards against missing tenant context
// and calls the expected service methods.

describe('HealthTool', () => {
  it('should return ok status with timestamp and version', async () => {
    const tool = new HealthTool();
    const result = await tool.check();
    expect(result.status).toBe('ok');
    expect(result.version).toBe('1.0.0');
    expect(result.timestamp).toBeDefined();
  });
});

describe('CapabilitiesTool', () => {
  it('should return capabilities card', async () => {
    const tool = new CapabilitiesTool();
    const result = await tool.getCapabilities();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.message).toContain('help you with');
    expect((result as any)._card.type).toBe('capabilities');
  });
});

describe('DriverPayTool (positive paths)', () => {
  let tool: DriverPayTool;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ driverId: 42 }) },
      driver: {
        findUnique: jest.fn().mockResolvedValue({ driverId: 'drv_1' }),
        findFirst: jest.fn(),
      },
      load: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const mockSettlements = {
      findAll: jest.fn().mockResolvedValue([
        {
          settlementId: 'stl_1',
          settlementNumber: 'STL-001',
          status: 'PAID',
          driver: { name: 'John' },
          periodStart: new Date(),
          periodEnd: new Date(),
          grossPayCents: 300000,
          deductionsCents: 50000,
          netPayCents: 250000,
          lineItems: [],
        },
      ]),
    };
    const mockPayStructure = {
      getDriverPayStructure: jest.fn().mockResolvedValue({ payType: 'per_mile', ratePerMileCents: 55 }),
    };
    tool = new DriverPayTool(mockPrisma, mockSettlements as any, mockPayStructure as any);
  });

  it('getMySettlement returns settlement data for authenticated driver', async () => {
    const r = await tool.getMySettlement({ _tenantId: 1, _userId: 'user_1' });
    const data = JSON.parse(r.content[0].text);
    expect(data.id).toBe('stl_1');
    expect(data.netPayDollars).toBe('2500.00');
    expect((r as any)._card.type).toBe('settlement');
  });

  it('getMySettlement returns message when no settlements', async () => {
    (tool as any).settlementsService.findAll = jest.fn().mockResolvedValue([]);
    const r = await tool.getMySettlement({ _tenantId: 1, _userId: 'user_1' });
    const data = JSON.parse(r.content[0].text);
    expect(data.message).toContain('No settlements');
  });

  it('getMySettlement returns error when user has no driver profile', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ driverId: null });
    const r = await tool.getMySettlement({ _tenantId: 1, _userId: 'user_1' });
    const data = JSON.parse(r.content[0].text);
    expect(data.error).toBeDefined();
  });

  it('getMyLoads returns loads for authenticated driver', async () => {
    mockPrisma.load.findMany.mockResolvedValue([
      {
        loadNumber: 'L-1001',
        status: 'DELIVERED',
        customerName: 'Acme',
        rateCents: 250000,
        stops: [
          {
            actionType: 'pickup',
            sequenceOrder: 1,
            stop: { name: 'WH', city: 'Dallas', state: 'TX' },
          },
        ],
      },
    ]);
    const r = await tool.getMyLoads({
      limit: 10,
      _tenantId: 1,
      _userId: 'user_1',
    });
    const data = JSON.parse(r.content[0].text);
    expect(data.count).toBe(1);
  });

  it('getMyPayStructure returns pay structure', async () => {
    const r = await tool.getMyPayStructure({ _tenantId: 1, _userId: 'user_1' });
    expect(r.content[0].type).toBe('text');
  });
});

describe('DocumentTool', () => {
  let tool: DocumentTool;
  let mockBillingReadiness: any;
  let mockPrisma: any;

  beforeEach(() => {
    mockBillingReadiness = {
      evaluate: jest.fn().mockResolvedValue({
        score: 100,
        hasBlockers: false,
        items: [
          {
            category: 'document',
            type: 'rate_confirmation',
            status: 'satisfied',
            enforcement: 'required',
            relatedStopName: null,
            reason: 'Rate con uploaded',
            dueBy: null,
            satisfiedBy: { fileName: 'ratecon.pdf', uploadedAt: new Date() },
          },
          {
            category: 'document',
            type: 'bol',
            status: 'missing',
            enforcement: 'required',
            relatedStopName: 'Stop 1',
            reason: 'BOL required',
            dueBy: null,
            satisfiedBy: null,
          },
        ],
        totalRequired: 3,
        totalSatisfied: 2,
        readyToApprove: false,
      }),
    };
    mockPrisma = {
      load: {
        findFirst: jest.fn().mockResolvedValue({ id: 1, loadNumber: 'L-1001' }),
      },
      document: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    tool = new DocumentTool(mockBillingReadiness, mockPrisma);
  });

  it('getDocumentCompliance returns error without tenant', async () => {
    const r = await tool.getDocumentCompliance({ loadId: 'ld_1' });
    expect(JSON.parse(r.content[0].text).error).toBeDefined();
  });

  it('getDocumentCompliance returns error when neither loadId nor loadNumber provided', async () => {
    const r = await tool.getDocumentCompliance({ _tenantId: 1 });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.error).toContain('Either loadId or loadNumber');
  });

  it('getDocumentCompliance returns compliance data with card', async () => {
    const r = await tool.getDocumentCompliance({
      loadId: 'ld_1',
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.complianceScore).toBe(100);
    expect(parsed.requirements).toHaveLength(2);
    expect(parsed.requirements[0].documentType).toBe('rate_confirmation');
    expect((r as any)._card.type).toBe('doc_compliance');
  });

  it('getDocumentCompliance resolves by loadNumber', async () => {
    const r = await tool.getDocumentCompliance({
      loadNumber: 'L-1001',
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.complianceScore).toBe(100);
    expect(mockPrisma.load.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { loadNumber: 'L-1001', tenantId: 1 },
      }),
    );
  });

  it('getDocumentCompliance returns error when loadNumber not found', async () => {
    mockPrisma.load.findFirst.mockResolvedValue(null);
    const r = await tool.getDocumentCompliance({
      loadNumber: 'L-9999',
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.error).toContain('No load found');
  });

  it('getDocumentCompliance handles service error', async () => {
    mockBillingReadiness.evaluate.mockRejectedValue(new Error('Evaluation failed'));
    const r = await tool.getDocumentCompliance({
      loadId: 'ld_1',
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.error).toBe('Evaluation failed');
  });

  it('requestDocumentUpload returns error without tenant', async () => {
    const r = await tool.requestDocumentUpload({
      loadId: 'ld_1',
      documentType: 'bol',
    });
    expect(JSON.parse(r.content[0].text).error).toBeDefined();
  });

  it('requestDocumentUpload returns error when neither loadId nor loadNumber', async () => {
    const r = await tool.requestDocumentUpload({
      documentType: 'bol',
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.error).toContain('Either loadId or loadNumber');
  });

  it('requestDocumentUpload returns upload card', async () => {
    const r = await tool.requestDocumentUpload({
      loadId: 'ld_1',
      documentType: 'bol',
      _tenantId: 1,
      _userId: 'user_1',
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.loadNumber).toBe('L-1001');
    expect(parsed.documentType).toBe('bol');
    expect((r as any)._card.type).toBe('doc_upload');
  });

  it('requestDocumentUpload resolves by loadNumber', async () => {
    const r = await tool.requestDocumentUpload({
      loadNumber: 'L-1001',
      documentType: 'pod',
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.success).toBe(true);
  });

  it('requestDocumentUpload returns error when load not found', async () => {
    mockPrisma.load.findFirst.mockResolvedValue(null);
    const r = await tool.requestDocumentUpload({
      loadId: 'ld_bad',
      documentType: 'bol',
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.error).toContain('No load found');
  });

  it('requestDocumentUpload notes existing docs', async () => {
    mockPrisma.document.findMany.mockResolvedValue([{ id: 1, fileName: 'existing.pdf', createdAt: new Date() }]);
    const r = await tool.requestDocumentUpload({
      loadId: 'ld_1',
      documentType: 'bol',
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.existingDocCount).toBe(1);
    expect(parsed.message).toContain('existing');
  });

  it('requestDocumentUpload handles service error', async () => {
    mockPrisma.load.findFirst.mockRejectedValue(new Error('DB error'));
    const r = await tool.requestDocumentUpload({
      loadId: 'ld_1',
      documentType: 'bol',
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.error).toBe('DB error');
  });
});

describe('DriverContextTool', () => {
  let tool: DriverContextTool;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      load: {
        findFirst: jest.fn().mockResolvedValue({
          loadNumber: 'L-1001',
          referenceNumber: null,
          status: 'in_transit',
          customerName: 'Acme Corp',
          stops: [
            {
              status: 'COMPLETED',
              actionType: 'pickup',
              appointmentDate: new Date(),
              sequenceOrder: 1,
              stop: { name: 'WH Dallas', city: 'Dallas', state: 'TX' },
            },
            {
              status: 'PENDING',
              actionType: 'delivery',
              appointmentDate: new Date(),
              sequenceOrder: 2,
              stop: { name: 'WH Houston', city: 'Houston', state: 'TX' },
            },
          ],
        }),
      },
      conversation: {
        findUnique: jest.fn().mockResolvedValue({ id: 10 }),
      },
      conversationMessage: {
        findMany: jest.fn().mockResolvedValue([
          {
            role: 'user',
            content: 'Heading out now',
            createdAt: new Date('2026-04-01'),
          },
        ]),
      },
      alert: {
        findMany: jest.fn().mockResolvedValue([
          {
            alertId: 'alt_1',
            title: 'HOS Warning',
            priority: 'HIGH',
            category: 'compliance',
            recommendedAction: 'Take a break',
          },
        ]),
      },
      driver: {
        findFirst: jest.fn().mockResolvedValue({
          currentHoursDriven: 8,
          currentOnDutyTime: 10,
          currentHoursSinceBreak: 4,
          cycleHoursUsed: 50,
          hosData: null,
          hosDataSyncedAt: new Date('2026-04-01'),
        }),
      },
    };
    tool = new DriverContextTool(mockPrisma);
  });

  it('returns error without tenant', async () => {
    const r = await tool.getDriverActiveContext({ driverId: 1 });
    expect(r).toHaveProperty('error');
  });

  it('returns active context with load, messages, alerts, and HOS', async () => {
    const r = await tool.getDriverActiveContext({ driverId: 42, _tenantId: 1 });
    expect(r.activeLoad).not.toBeNull();
    expect(r.activeLoad.stops).toHaveLength(2);
    expect(r.activeLoad.currentStop.name).toBe('WH Houston');
    expect(r.recentOpsMessages).toHaveLength(1);
    expect(r.activeAlerts).toHaveLength(1);
    expect(r.hos.hoursDriven).toBe(8);
    expect(r.hos.cycleHoursUsed).toBe(50);
  });

  it('returns null activeLoad when driver has no active load', async () => {
    mockPrisma.load.findFirst.mockResolvedValue(null);
    const r = await tool.getDriverActiveContext({ driverId: 42, _tenantId: 1 });
    expect(r.activeLoad).toBeNull();
    expect(r.recentOpsMessages).toHaveLength(0);
  });

  it('returns null hos when driver not found', async () => {
    mockPrisma.driver.findFirst.mockResolvedValue(null);
    const r = await tool.getDriverActiveContext({ driverId: 99, _tenantId: 1 });
    expect(r.hos).toBeNull();
  });

  it('handles no operational messages gracefully', async () => {
    // Driver-keyed: messages come straight from conversationMessage tagged
    // with the active load — no separate conversation lookup.
    mockPrisma.conversationMessage.findMany.mockResolvedValue([]);
    const r = await tool.getDriverActiveContext({ driverId: 42, _tenantId: 1 });
    expect(r.recentOpsMessages).toHaveLength(0);
  });

  it('returns nextStop correctly when multiple incomplete stops', async () => {
    mockPrisma.load.findFirst.mockResolvedValue({
      loadNumber: 'L-1001',
      referenceNumber: null,
      status: 'in_transit',
      customerName: 'Acme',
      stops: [
        {
          status: 'COMPLETED',
          actionType: 'pickup',
          sequenceOrder: 1,
          stop: { name: 'A', city: 'A', state: 'TX' },
        },
        {
          status: 'ARRIVED',
          actionType: 'delivery',
          sequenceOrder: 2,
          stop: { name: 'B', city: 'B', state: 'TX' },
        },
        {
          status: 'PENDING',
          actionType: 'delivery',
          sequenceOrder: 3,
          stop: { name: 'C', city: 'C', state: 'TX' },
        },
      ],
    });
    const r = await tool.getDriverActiveContext({ driverId: 42, _tenantId: 1 });
    expect(r.activeLoad.currentStop.name).toBe('B');
    expect(r.activeLoad.nextStop.name).toBe('C');
  });
});

describe('EDIActionTool', () => {
  let tool: EDIActionTool;
  let mockTenderService: any;
  let mockRulesService: any;

  beforeEach(() => {
    mockTenderService = {
      respondToTender: jest.fn().mockResolvedValue({
        id: 1,
        loadNumber: 'L-1001',
        status: 'accepted',
      }),
    };
    mockRulesService = {
      listRules: jest.fn().mockResolvedValue([
        {
          id: 1,
          name: 'Auto-accept high-value',
          isActive: true,
          conditions: { minRatePerMile: 3.0 },
          tradingPartner: { name: 'TQL' },
          priority: 10,
          matchCount: 5,
          lastMatchAt: new Date(),
          createdBy: 'admin',
          approvedAt: new Date(),
        },
      ]),
      createRule: jest.fn().mockResolvedValue({
        id: 2,
        name: 'New Rule',
        isActive: true,
      }),
    };
    tool = new EDIActionTool(mockTenderService, mockRulesService);
  });

  it('respondToTender returns error without tenant', async () => {
    const r = await tool.respondToTender({
      loadId: 1,
      response: 'accept',
    });
    expect(JSON.parse(r.content[0].text).error).toBeDefined();
  });

  it('respondToTender requires counterRateCents for counter response', async () => {
    const r = await tool.respondToTender({
      loadId: 1,
      response: 'counter',
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.error).toContain('counterRateCents is required');
  });

  it('respondToTender accepts tender successfully', async () => {
    const r = await tool.respondToTender({
      loadId: 1,
      response: 'accept',
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.tenderResponse).toBe('accepted');
    expect(parsed.loadNumber).toBe('L-1001');
  });

  it('respondToTender counters with rate', async () => {
    const r = await tool.respondToTender({
      loadId: 1,
      response: 'counter',
      counterRateCents: 350000,
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.tenderResponse).toBe('countered');
    expect(parsed.counterRateDollars).toBe('3500.00');
  });

  it('respondToTender declines tender', async () => {
    mockTenderService.respondToTender.mockResolvedValue({
      id: 1,
      loadNumber: 'L-1001',
      status: 'declined',
    });
    const r = await tool.respondToTender({
      loadId: 1,
      response: 'decline',
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.tenderResponse).toBe('declined');
  });

  it('respondToTender handles service error', async () => {
    mockTenderService.respondToTender.mockRejectedValue(new Error('Tender expired'));
    const r = await tool.respondToTender({
      loadId: 1,
      response: 'accept',
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.error).toBe('Tender expired');
  });

  it('manageAutoAcceptRules returns error without tenant', async () => {
    const r = await tool.manageAutoAcceptRules({ action: 'list' });
    expect(JSON.parse(r.content[0].text).error).toBeDefined();
  });

  it('manageAutoAcceptRules lists rules', async () => {
    const r = await tool.manageAutoAcceptRules({
      action: 'list',
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.count).toBe(1);
    expect(parsed.rules[0].name).toBe('Auto-accept high-value');
    expect(parsed.rules[0].tradingPartnerName).toBe('TQL');
  });

  it('manageAutoAcceptRules creates a rule', async () => {
    const r = await tool.manageAutoAcceptRules({
      action: 'create',
      name: 'New Rule',
      conditions: { minRatePerMile: 2.5 },
      tradingPartnerId: 1,
      priority: 5,
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.name).toBe('New Rule');
  });

  it('manageAutoAcceptRules returns error when name or conditions missing for create', async () => {
    const r = await tool.manageAutoAcceptRules({
      action: 'create',
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.error).toContain('name and conditions are required');
  });

  it('manageAutoAcceptRules handles service error', async () => {
    mockRulesService.listRules.mockRejectedValue(new Error('DB error'));
    const r = await tool.manageAutoAcceptRules({
      action: 'list',
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.error).toBe('DB error');
  });
});

describe('RoutePlanningTool', () => {
  let tool: RoutePlanningTool;
  let mockPrisma: any;
  let mockEngine: any;

  beforeEach(() => {
    mockPrisma = {
      driver: {
        findFirst: jest.fn().mockResolvedValue({
          id: 42,
          driverId: 'drv_1',
          name: 'John Smith',
        }),
      },
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({
          vehicleId: 'veh_1',
          unitNumber: 'TRK-101',
        }),
      },
      load: {
        findMany: jest.fn().mockResolvedValue([
          { loadNumber: 'ld_1', status: 'pending' },
          { loadNumber: 'ld_2', status: 'assigned' },
        ]),
      },
      routePlan: {
        create: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({
          planId: 'rp_1',
          status: 'ACTIVE',
          isActive: true,
          isFeasible: true,
          departureTime: new Date(),
          estimatedArrival: new Date(),
          totalDistanceMiles: 500,
          totalDriveTimeHours: 8,
          totalTripTimeHours: 10,
          driver: { name: 'John', driverId: 'drv_1' },
          vehicle: { unitNumber: 'TRK-101', vehicleId: 'veh_1' },
          loads: [
            {
              load: {
                loadNumber: 'ld_1',
                status: 'in_transit',
                customerName: 'Acme',
              },
            },
          ],
          segments: [
            {
              sequenceOrder: 1,
              segmentType: 'drive',
              fromLocation: 'Dallas, TX',
              toLocation: 'Houston, TX',
              distanceMiles: 250,
              driveTimeHours: 4,
              estimatedDeparture: new Date(),
              estimatedArrival: new Date(),
            },
          ],
        }),
      },
    };
    mockEngine = {
      planRoute: jest.fn().mockResolvedValue({
        planId: 'RP-NEW',
        status: 'draft',
        isFeasible: true,
        feasibilityIssues: [],
        totalDistanceMiles: 500,
        totalDriveTimeHours: 8,
        totalDrivingDays: 1,
        estimatedArrival: new Date(),
        hosSource: 'ESTIMATED',
      }),
    };
    tool = new RoutePlanningTool(mockPrisma, mockEngine);
  });

  it('planRoute returns error when no driver found', async () => {
    mockPrisma.driver.findFirst.mockResolvedValue(null);
    const r = await tool.planRoute({
      driverName: 'Nobody',
      vehicleUnit: 'TRK',
      loadIds: ['ld_1'],
      optimizationPriority: 'balance',
      _tenantId: 1,
    });
    expect(JSON.parse(r.content[0].text).error).toContain('No active driver');
  });

  it('planRoute returns error when no vehicle found', async () => {
    mockPrisma.vehicle.findFirst.mockResolvedValue(null);
    const r = await tool.planRoute({
      driverName: 'John',
      vehicleUnit: 'NONE',
      loadIds: ['ld_1'],
      optimizationPriority: 'balance',
      _tenantId: 1,
    });
    expect(JSON.parse(r.content[0].text).error).toContain('No vehicle found');
  });

  it('planRoute refuses without a tenant context (no cross-tenant query)', async () => {
    const r = await tool.planRoute({
      driverName: 'John',
      vehicleUnit: 'TRK',
      loadIds: ['ld_1'],
      optimizationPriority: 'balance',
    });
    expect(JSON.parse(r.content[0].text).error).toMatch(/tenant context/i);
    // The guard fired before any DB lookup.
    expect(mockPrisma.driver.findFirst).not.toHaveBeenCalled();
  });

  it('planRoute returns error when loads not found', async () => {
    mockPrisma.load.findMany.mockResolvedValue([{ loadNumber: 'ld_1', status: 'pending' }]);
    const r = await tool.planRoute({
      driverName: 'John',
      vehicleUnit: 'TRK',
      loadIds: ['ld_1', 'ld_missing'],
      optimizationPriority: 'balance',
      _tenantId: 1,
    });
    expect(JSON.parse(r.content[0].text).error).toContain('ld_missing');
  });

  it('planRoute runs the real engine and returns the drafted plan', async () => {
    const r = await tool.planRoute({
      driverName: 'John',
      vehicleUnit: 'TRK',
      loadIds: ['ld_1', 'ld_2'],
      optimizationPriority: 'minimize_time',
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(mockEngine.planRoute).toHaveBeenCalledWith(
      expect.objectContaining({ driverId: 'drv_1', vehicleId: 'veh_1', loadIds: ['ld_1', 'ld_2'], tenantId: 1 }),
    );
    expect(parsed.status).toBe('draft_created');
    expect(parsed.planId).toBe('RP-NEW');
    expect(parsed.isFeasible).toBe(true);
    expect((r as any)._card?.type).toBe('route');
    expect((r as any)._card?.data).toMatchObject({ status: 'draft_created', planId: 'RP-NEW' });
  });

  it('planRoute surfaces feasibility issues from the engine', async () => {
    mockEngine.planRoute.mockResolvedValueOnce({
      planId: 'RP-BAD',
      status: 'draft',
      isFeasible: false,
      feasibilityIssues: ['Late arrival at Acme: 90m after the window closes'],
      totalDistanceMiles: 700,
      totalDriveTimeHours: 12,
      totalDrivingDays: 2,
      estimatedArrival: new Date(),
    });
    const r = await tool.planRoute({
      driverName: 'John',
      vehicleUnit: 'TRK',
      loadIds: ['ld_1'],
      optimizationPriority: 'balance',
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.isFeasible).toBe(false);
    expect(parsed.feasibilityIssues[0]).toMatch(/late arrival/i);
  });

  it('planRoute returns a friendly error when the engine throws', async () => {
    mockEngine.planRoute.mockRejectedValueOnce(new Error('No stops geocoded'));
    const r = await tool.planRoute({
      driverName: 'John',
      vehicleUnit: 'TRK',
      loadIds: ['ld_1'],
      optimizationPriority: 'balance',
      _tenantId: 1,
    });
    expect(JSON.parse(r.content[0].text).error).toMatch(/No stops geocoded/);
  });

  it('getRouteStatus returns error without planId or driverName', async () => {
    const r = await tool.getRouteStatus({});
    expect(JSON.parse(r.content[0].text).error).toContain('Provide either');
  });

  it('getRouteStatus returns route plan by planId', async () => {
    const r = await tool.getRouteStatus({ planId: 'rp_1', _tenantId: 1 });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.planId).toBe('rp_1');
    expect(parsed.driver).toBe('John');
    expect(parsed.segments).toHaveLength(1);
    expect((r as any)._card.type).toBe('route');
  });

  it('getRouteStatus returns route plan by driver name', async () => {
    const r = await tool.getRouteStatus({ driverName: 'John', _tenantId: 1 });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.planId).toBe('rp_1');
  });

  it('getRouteStatus returns error when driver not found', async () => {
    mockPrisma.driver.findFirst.mockResolvedValue(null);
    const r = await tool.getRouteStatus({ driverName: 'Nobody', _tenantId: 1 });
    expect(JSON.parse(r.content[0].text).error).toContain('No driver found');
  });

  it('getRouteStatus returns error when route plan not found', async () => {
    mockPrisma.routePlan.findFirst.mockResolvedValue(null);
    const r = await tool.getRouteStatus({ planId: 'rp_bad', _tenantId: 1 });
    expect(JSON.parse(r.content[0].text).error).toContain('not found');
  });
});

describe('ShieldTool', () => {
  let tool: ShieldTool;
  let mockShieldService: any;

  beforeEach(() => {
    mockShieldService = {
      getLatestScores: jest.fn().mockResolvedValue({
        overallScore: 85,
        hosScore: 90,
        driversScore: 80,
        vehiclesScore: 88,
        loadsScore: 82,
        statusLabel: 'PROTECTED',
        completedAt: new Date('2026-04-01'),
      }),
      getFindings: jest.fn().mockResolvedValue([
        {
          severity: 'WARNING',
          title: 'Driver CDL expiring soon',
          entityName: 'John Smith',
          recommendation: 'Renew CDL before expiration',
        },
        {
          severity: 'CRITICAL',
          title: 'Missing BOL',
          entityName: 'Load L-1001',
          recommendation: 'Upload BOL',
        },
      ]),
      triggerAudit: jest.fn().mockResolvedValue({
        queued: true,
        auditId: 'audit_123',
      }),
    };
    tool = new ShieldTool(mockShieldService);
  });

  it('getShieldScore returns error without tenant', async () => {
    const r = await tool.getShieldScore({});
    expect(JSON.parse(r.content[0].text).error).toBeDefined();
  });

  it('getShieldScore returns scores with card', async () => {
    const r = await tool.getShieldScore({ _tenantId: 1 });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.overallScore).toBe(85);
    expect(parsed.hosScore).toBe(90);
    expect(parsed.statusLabel).toBe('PROTECTED');
    expect((r as any)._card.type).toBe('shield');
  });

  it('getShieldFindings returns error without tenant', async () => {
    const r = await tool.getShieldFindings({});
    expect(JSON.parse(r.content[0].text).error).toBeDefined();
  });

  it('getShieldFindings returns findings with card', async () => {
    const r = await tool.getShieldFindings({ _tenantId: 1 });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.count).toBe(2);
    expect(parsed.findings[0].severity).toBe('WARNING');
    expect((r as any)._card.type).toBe('shield_findings');
  });

  it('getShieldFindings passes filters to service', async () => {
    await tool.getShieldFindings({
      category: 'DRIVERS',
      severity: 'CRITICAL',
      _tenantId: 1,
    });
    expect(mockShieldService.getFindings).toHaveBeenCalledWith(1, {
      category: 'DRIVERS',
      severity: 'CRITICAL',
      isResolved: false,
    });
  });

  it('triggerShieldAudit returns error without tenant', async () => {
    const r = await tool.triggerShieldAudit({});
    expect(JSON.parse(r.content[0].text).error).toBeDefined();
  });

  it('triggerShieldAudit queues audit successfully', async () => {
    const r = await tool.triggerShieldAudit({
      scope: 'HOS',
      _tenantId: 1,
      _userId: '42',
      _conversationId: 'conv_1',
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.auditId).toBe('audit_123');
    expect(mockShieldService.triggerAudit).toHaveBeenCalledWith({
      tenantId: 1,
      scope: 'HOS',
      includeAi: true,
      triggeredBy: 'MANUAL',
      triggeredById: 42,
      conversationId: 'conv_1',
    });
  });

  it('triggerShieldAudit defaults to FULL scope', async () => {
    await tool.triggerShieldAudit({ _tenantId: 1 });
    expect(mockShieldService.triggerAudit).toHaveBeenCalledWith(expect.objectContaining({ scope: 'FULL' }));
  });

  it('triggerShieldAudit handles already-in-progress', async () => {
    mockShieldService.triggerAudit.mockResolvedValue({
      queued: false,
      message: 'Audit already in progress',
    });
    const r = await tool.triggerShieldAudit({ _tenantId: 1 });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.success).toBe(false);
    expect(parsed.message).toContain('already in progress');
  });

  it('triggerShieldAudit handles service error', async () => {
    mockShieldService.triggerAudit.mockRejectedValue(new Error('Audit queue full'));
    const r = await tool.triggerShieldAudit({ _tenantId: 1 });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.error).toBe('Audit queue full');
  });
});

describe('IftaTool', () => {
  let tool: IftaTool;
  let mockIftaService: any;

  beforeEach(() => {
    mockIftaService = {
      getQuarters: jest.fn().mockResolvedValue([
        {
          id: 2,
          year: 2026,
          quarter: 1,
          status: 'OPEN',
          totalMiles: 50000,
          totalGallons: 7500,
          netTaxDueCents: 125000,
          anomalyCount: 2,
          filedAt: null,
          confirmedAt: null,
          periodStart: new Date('2026-01-01'),
          periodEnd: new Date('2026-03-31'),
        },
      ]),
      getQuarterSummary: jest.fn().mockResolvedValue({
        year: 2026,
        quarter: 1,
        status: 'OPEN',
        totalMiles: 50000,
        totalGallons: 7500,
        fleetAvgMpg: 6.67,
        totalTaxOwedCents: 175000,
        totalTaxPaidCents: 50000,
        netTaxDueCents: 125000,
        anomalyCount: 2,
        filingDeadline: new Date('2026-04-30'),
        daysUntilDeadline: 20,
      }),
      getQuarterDetail: jest.fn().mockResolvedValue({
        year: 2026,
        quarter: 1,
        status: 'OPEN',
        stateMileage: [
          {
            jurisdiction: 'TX',
            totalMiles: 20000,
            taxableGallons: 3000,
            taxRatePerGallon: 0.2,
            surchargeRate: 0.01,
            taxOwedCents: 60000,
            surchargeOwedCents: 3000,
            source: 'gps',
          },
          {
            jurisdiction: 'OK',
            totalMiles: 10000,
            taxableGallons: 1500,
            taxRatePerGallon: 0.19,
            surchargeRate: null,
            taxOwedCents: 28500,
            surchargeOwedCents: null,
            source: 'gps',
          },
        ],
      }),
    };
    tool = new IftaTool(mockIftaService);
  });

  it('getIftaSummary returns error without tenant', async () => {
    const r = await tool.getIftaSummary({});
    expect(JSON.parse(r.content[0].text).error).toBeDefined();
  });

  it('getIftaSummary returns quarter summary', async () => {
    const r = await tool.getIftaSummary({
      year: 2026,
      quarter: 1,
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.year).toBe(2026);
    expect(parsed.quarter).toBe(1);
    expect(parsed.netTaxDueDollars).toBe('1250.00');
    expect(parsed.totalMiles).toBe(50000);
    expect(parsed.anomalyCount).toBe(2);
  });

  it('getIftaSummary defaults to current quarter', async () => {
    await tool.getIftaSummary({ _tenantId: 1 });
    expect(mockIftaService.getQuarters).toHaveBeenCalledWith(1, expect.objectContaining({ year: expect.any(Number) }));
  });

  it('getIftaSummary returns error when quarter not found', async () => {
    mockIftaService.getQuarters.mockResolvedValue([]);
    const r = await tool.getIftaSummary({
      year: 2025,
      quarter: 4,
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.error).toContain('No IFTA quarter found');
  });

  it('getIftaSummary handles service error', async () => {
    mockIftaService.getQuarters.mockRejectedValue(new Error('DB error'));
    const r = await tool.getIftaSummary({ _tenantId: 1 });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.error).toBe('DB error');
  });

  it('getIftaStateBreakdown returns error without tenant', async () => {
    const r = await tool.getIftaStateBreakdown({ quarterId: 1 });
    expect(JSON.parse(r.content[0].text).error).toBeDefined();
  });

  it('getIftaStateBreakdown returns per-state breakdown', async () => {
    const r = await tool.getIftaStateBreakdown({
      quarterId: 2,
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.stateCount).toBe(2);
    expect(parsed.states[0].jurisdiction).toBe('TX');
    expect(parsed.states[0].netTaxCents).toBe(63000);
    expect(parsed.states[1].jurisdiction).toBe('OK');
    expect(parsed.states[1].netTaxCents).toBe(28500);
  });

  it('getIftaStateBreakdown handles null surcharge gracefully', async () => {
    const r = await tool.getIftaStateBreakdown({
      quarterId: 2,
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.states[1].surchargeRate).toBe(0);
    expect(parsed.states[1].surchargeOwedCents).toBe(0);
  });

  it('getIftaStateBreakdown handles service error', async () => {
    mockIftaService.getQuarterDetail.mockRejectedValue(new Error('Quarter not found'));
    const r = await tool.getIftaStateBreakdown({
      quarterId: 999,
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.error).toBe('Quarter not found');
  });

  it('queryIftaQuarters returns error without tenant', async () => {
    const r = await tool.queryIftaQuarters({});
    expect(JSON.parse(r.content[0].text).error).toBeDefined();
  });

  it('queryIftaQuarters returns quarter list', async () => {
    const r = await tool.queryIftaQuarters({ year: 2026, _tenantId: 1 });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.count).toBe(1);
    expect(parsed.quarters[0].label).toBe('Q1 2026');
    expect(parsed.quarters[0].netTaxDueDollars).toBe('1250.00');
  });

  it('queryIftaQuarters handles service error', async () => {
    mockIftaService.getQuarters.mockRejectedValue(new Error('Service unavailable'));
    const r = await tool.queryIftaQuarters({ _tenantId: 1 });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.error).toBe('Service unavailable');
  });
});

describe('ReportTool', () => {
  let tool: ReportTool;
  let mockReportService: any;

  beforeEach(() => {
    mockReportService = {
      exportCsv: jest.fn().mockResolvedValue('id,name\n1,John\n2,Jane'),
      exportPdf: jest.fn().mockResolvedValue(Buffer.from('PDF-content')),
    };
    tool = new ReportTool(mockReportService);
  });

  it('generateCustomReport returns error without tenant', async () => {
    const r = await tool.generateCustomReport({
      title: 'Test',
      format: 'csv',
      columns: [{ key: 'id', label: 'ID' }],
      rows: [{ id: '1' }],
    });
    expect(JSON.parse(r.content[0].text).error).toBeDefined();
  });

  it('generateCustomReport returns error when rows empty', async () => {
    const r = await tool.generateCustomReport({
      title: 'Empty Report',
      format: 'csv',
      columns: [{ key: 'id', label: 'ID' }],
      rows: [],
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.error).toContain('No data');
  });

  it('generateCustomReport generates CSV report with card', async () => {
    const r = await tool.generateCustomReport({
      title: 'Load Report',
      format: 'csv',
      columns: [
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Name' },
      ],
      rows: [
        { id: '1', name: 'John' },
        { id: '2', name: 'Jane' },
      ],
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.format).toBe('csv');
    expect(parsed.rowCount).toBe(2);
    expect(parsed.csv).toContain('id,name');
    expect((r as any)._card.type).toBe('report_download');
    expect((r as any)._card.data.mimeType).toBe('text/csv');
  });

  it('generateCustomReport generates PDF report with card', async () => {
    const r = await tool.generateCustomReport({
      title: 'Invoice Report',
      format: 'pdf',
      columns: [{ key: 'id', label: 'ID' }],
      rows: [{ id: '1' }],
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.format).toBe('pdf');
    expect((r as any)._card.type).toBe('report_download');
    expect((r as any)._card.data.mimeType).toBe('application/pdf');
    expect((r as any)._card.data.base64).toBeDefined();
  });
});

describe('CustomFieldQueryTool', () => {
  let tool: CustomFieldQueryTool;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      customFieldDefinition: {
        findMany: jest.fn().mockResolvedValue([
          {
            name: 'Priority',
            fieldKey: 'priority',
            fieldType: 'SELECT',
            options: ['low', 'medium', 'high', 'urgent'],
            isRequired: false,
            driverEditable: false,
          },
          {
            name: 'Reference Code',
            fieldKey: 'ref_code',
            fieldType: 'TEXT',
            options: null,
            isRequired: true,
            driverEditable: true,
          },
        ]),
      },
    };
    tool = new CustomFieldQueryTool(mockPrisma);
  });

  it('returns error without tenant context', async () => {
    const r = await tool.getCustomFieldDefinitions({ entityType: 'LOAD' });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.error).toContain('No tenant context');
  });

  it('returns field definitions for LOAD entity type', async () => {
    const r = await tool.getCustomFieldDefinitions({
      entityType: 'LOAD',
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.entityType).toBe('LOAD');
    expect(parsed.count).toBe(2);
    expect(parsed.definitions[0].fieldKey).toBe('priority');
    expect(parsed.definitions[1].fieldType).toBe('TEXT');
  });

  it('returns empty list when no definitions found', async () => {
    mockPrisma.customFieldDefinition.findMany.mockResolvedValue([]);
    const r = await tool.getCustomFieldDefinitions({
      entityType: 'DRIVER',
      _tenantId: 1,
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.count).toBe(0);
    expect(parsed.definitions).toHaveLength(0);
  });

  it('queries with correct tenant and entity type filter', async () => {
    await tool.getCustomFieldDefinitions({
      entityType: 'VEHICLE',
      _tenantId: 5,
    });
    expect(mockPrisma.customFieldDefinition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 5,
          entityType: 'VEHICLE',
          isActive: true,
        },
      }),
    );
  });
});
