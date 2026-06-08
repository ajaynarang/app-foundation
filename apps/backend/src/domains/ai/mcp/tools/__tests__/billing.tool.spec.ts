import { BillingTool } from '../billing.tool';

describe('BillingTool', () => {
  let tool: BillingTool;
  let mockBillingReadiness: any;
  let mockCloseOut: any;
  let mockPrisma: any;

  beforeEach(() => {
    mockBillingReadiness = {
      evaluate: jest.fn(),
    };
    mockCloseOut = {
      approveForBilling: jest.fn(),
    };
    mockPrisma = {
      load: {
        findFirst: jest.fn(),
      },
    };
    tool = new BillingTool(mockBillingReadiness, mockCloseOut, mockPrisma);
  });

  describe('getBillingReadiness', () => {
    it('returns error when no tenant context', async () => {
      const result = await tool.getBillingReadiness({ loadId: 'ld_1' });
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('No tenant context');
    });

    it('returns billing readiness evaluation', async () => {
      mockPrisma.load.findFirst.mockResolvedValue({
        loadNumber: 'L-1001',
        referenceNumber: 'PO-123',
      });
      mockBillingReadiness.evaluate.mockResolvedValue({
        score: 85,
        hasBlockers: false,
        readyToApprove: true,
        totalRequired: 5,
        totalSatisfied: 4,
        overrideAllowed: true,
        overrideExists: false,
        items: [
          {
            category: 'document',
            type: 'BOL',
            label: 'Bill of Lading',
            enforcement: 'required',
            status: 'satisfied',
            reason: null,
            dueBy: null,
            amountCents: null,
          },
        ],
      });

      const result = await tool.getBillingReadiness({
        loadId: 'ld_1',
        _tenantId: 1,
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.score).toBe(85);
      expect(data.readyToApprove).toBe(true);
      expect(data.items).toHaveLength(1);
      expect(result._card.type).toBe('doc_compliance');
    });

    it('handles evaluation error', async () => {
      mockPrisma.load.findFirst.mockResolvedValue(null);
      mockBillingReadiness.evaluate.mockRejectedValue(new Error('Load not found'));

      const result = await tool.getBillingReadiness({
        loadId: 'ld_x',
        _tenantId: 1,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('Load not found');
    });
  });

  describe('approveForBilling', () => {
    it('returns error when no tenant context', async () => {
      const result = await tool.approveForBilling({ loadId: 'ld_1' });
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('No tenant context');
    });

    it('approves a load for billing', async () => {
      mockCloseOut.approveForBilling.mockResolvedValue({
        loadNumber: 'ld_1',
        billingStatus: 'APPROVED',
      });

      const result = await tool.approveForBilling({
        loadId: 'ld_1',
        _tenantId: 1,
        _userId: '42',
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.billingStatus).toBe('APPROVED');
    });

    it('handles approval error', async () => {
      mockCloseOut.approveForBilling.mockRejectedValue(new Error('Not delivered'));

      const result = await tool.approveForBilling({
        loadId: 'ld_1',
        _tenantId: 1,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('Not delivered');
    });
  });

  describe('getLoadCharges', () => {
    it('returns error when no tenant context', async () => {
      const result = await tool.getLoadCharges({ loadId: 'ld_1' });
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('No tenant context');
    });

    it('returns load charges', async () => {
      mockPrisma.load.findFirst.mockResolvedValue({
        loadNumber: 'L-1001',
        referenceNumber: 'PO-123',
        charges: [
          {
            chargeType: 'linehaul',
            description: 'Base rate',
            quantity: 1,
            unitPriceCents: 250000,
            totalCents: 250000,
            isBillable: true,
            isPayable: true,
          },
          {
            chargeType: 'detention',
            description: 'Detention fee',
            quantity: 2,
            unitPriceCents: 5000,
            totalCents: 10000,
            isBillable: true,
            isPayable: false,
          },
        ],
      });

      const result = await tool.getLoadCharges({
        loadId: 'ld_1',
        _tenantId: 1,
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.chargeCount).toBe(2);
      expect(data.totalBillableDollars).toBe('2600.00');
      expect(data.totalPayableDollars).toBe('2500.00');
    });

    it('returns error when load not found', async () => {
      mockPrisma.load.findFirst.mockResolvedValue(null);

      const result = await tool.getLoadCharges({
        loadId: 'ld_x',
        _tenantId: 1,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('not found');
    });
  });
});
