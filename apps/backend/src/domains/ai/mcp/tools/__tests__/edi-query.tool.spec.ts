import { EDIQueryTool } from '../edi-query.tool';

describe('EDIQueryTool', () => {
  let tool: EDIQueryTool;
  let mockMessageService: any;
  let mockPartnerService: any;
  let mockRulesService: any;

  beforeEach(() => {
    mockMessageService = {
      findPendingTenders: jest.fn().mockResolvedValue([]),
      listMessages: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    };

    mockPartnerService = {
      listPartners: jest.fn().mockResolvedValue([]),
    };

    mockRulesService = {
      listRules: jest.fn().mockResolvedValue([]),
    };

    tool = new EDIQueryTool(mockMessageService, mockPartnerService, mockRulesService);
  });

  describe('queryTenders', () => {
    it('should return error without tenant context', async () => {
      const result = await tool.queryTenders({});
      expect(JSON.parse(result.content[0].text).error).toBe('No tenant context');
    });

    it('should return empty tenders list', async () => {
      const result = await tool.queryTenders({ _tenantId: 1 });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.count).toBe(0);
      expect(parsed.tenders).toEqual([]);
    });

    it('should map tender data correctly', async () => {
      mockMessageService.findPendingTenders.mockResolvedValue([
        {
          id: 1,
          referenceNumber: 'REF-001',
          parsedData: {
            rateCents: 320000,
            brokerName: 'TestBroker',
            brokerReference: 'BR-001',
            equipmentType: 'dry_van',
            stops: [
              { city: 'Dallas', state: 'TX' },
              { city: 'Chicago', state: 'IL' },
            ],
          },
          tradingPartner: { name: 'TestBroker' },
          expiresAt: null,
          createdAt: new Date(),
          load: { loadNumber: 'LOAD-001' },
        },
      ]);

      const result = await tool.queryTenders({ _tenantId: 1 });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.count).toBe(1);
      expect(parsed.tenders[0].brokerName).toBe('TestBroker');
      expect(parsed.tenders[0].rateDollars).toBe('3200.00');
      expect(parsed.tenders[0].originCity).toBe('Dallas');
      expect(parsed.tenders[0].destinationCity).toBe('Chicago');
    });

    it('should handle errors', async () => {
      mockMessageService.findPendingTenders.mockRejectedValue(new Error('DB error'));
      const result = await tool.queryTenders({ _tenantId: 1 });
      expect(JSON.parse(result.content[0].text).error).toBe('DB error');
    });
  });

  describe('getEdiAnalytics', () => {
    it('should return error without tenant context', async () => {
      const result = await tool.getEdiAnalytics({});
      expect(JSON.parse(result.content[0].text).error).toBe('No tenant context');
    });

    it('should return analytics with broker stats', async () => {
      mockPartnerService.listPartners.mockResolvedValue([
        {
          id: 1,
          name: 'Broker A',
          tendersReceived: 100,
          tendersAccepted: 80,
          tendersDeclined: 20,
          lastMessageAt: new Date(),
        },
      ]);
      mockRulesService.listRules.mockResolvedValue([{ isActive: true }, { isActive: false }]);

      const result = await tool.getEdiAnalytics({ _tenantId: 1 });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.totalTendersReceived).toBe(100);
      expect(parsed.totalTendersAccepted).toBe(80);
      expect(parsed.activeAutoAcceptRules).toBe(1);
      expect(parsed.brokerStats).toHaveLength(1);
      expect(parsed.brokerStats[0].acceptRate).toBe('80.0%');
    });
  });

  describe('getTradingPartners', () => {
    it('should return error without tenant context', async () => {
      const result = await tool.getTradingPartners({});
      expect(JSON.parse(result.content[0].text).error).toBe('No tenant context');
    });

    it('should return partners', async () => {
      mockPartnerService.listPartners.mockResolvedValue([
        {
          id: 1,
          name: 'Broker A',
          isaId: 'ISA1',
          gsId: 'GS1',
          vanProvider: 'test',
          isActive: true,
          supportedMessages: ['204'],
          _count: { messages: 5, autoAcceptRules: 2 },
          tendersReceived: 10,
          tendersAccepted: 8,
          tendersDeclined: 2,
          lastMessageAt: null,
        },
      ]);
      const result = await tool.getTradingPartners({ _tenantId: 1 });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.count).toBe(1);
      expect(parsed.partners[0].name).toBe('Broker A');
    });
  });

  describe('getEdiMessageLog', () => {
    it('should return error without tenant context', async () => {
      const result = await tool.getEdiMessageLog({ limit: 25 });
      expect(JSON.parse(result.content[0].text).error).toBe('No tenant context');
    });

    it('should return message log', async () => {
      mockMessageService.listMessages.mockResolvedValue({
        data: [
          {
            id: 1,
            direction: 'INBOUND',
            messageType: 'T204',
            status: 'RECEIVED',
            referenceNumber: 'REF-1',
            tradingPartner: { name: 'Broker A' },
            load: { loadNumber: 'L-1045' },
            createdAt: new Date(),
            respondedAt: null,
            errorMessage: null,
          },
        ],
        total: 1,
      });
      const result = await tool.getEdiMessageLog({ limit: 25, _tenantId: 1 });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.count).toBe(1);
      expect(parsed.total).toBe(1);
    });
  });
});
