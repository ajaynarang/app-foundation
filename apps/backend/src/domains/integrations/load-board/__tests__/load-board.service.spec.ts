// Mock mastra modules that cause ESM issues in Jest
jest.mock('../../../../domains/ai/sally-ai/mastra/mastra.provider', () => ({}));
jest.mock('langfuse', () => ({ Langfuse: jest.fn() }));
jest.mock('../../../../domains/ai/infrastructure/providers/structured-output.service', () => ({
  StructuredOutputService: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { LoadBoardService } from '../load-board.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { AdapterFactoryService } from '../../adapters/adapter-factory.service';
import { AuthTokenService } from '../../oauth/auth-token.service';
import { LoadsService } from '../../../fleet/loads/services/loads.service';
import { SearchQueryParser } from '../nlp/search-query-parser';
import { LaneRateService } from '../services/lane-rate.service';

const mockAdapter = {
  search: jest.fn().mockResolvedValue({
    listings: [
      {
        externalId: 'l1',
        origin: { city: 'Dallas', state: 'TX' },
        destination: { city: 'Houston', state: 'TX' },
        rate: 2000,
        ratePerMile: 2.5,
        broker: { name: 'Broker A', mcNumber: 'MC123' },
        provider: 'dat',
      },
    ],
    totalCount: 1,
    page: 1,
  }),
  getListingDetail: jest.fn().mockResolvedValue({
    externalId: 'l1',
    origin: { city: 'Dallas', state: 'TX', zipCode: '75001' },
    destination: { city: 'Houston', state: 'TX', zipCode: '77001' },
    rate: 2000,
    ratePerMile: 2.5,
    weight: 40000,
    commodity: 'Dry Goods',
    equipmentType: 'van',
    broker: { name: 'Broker A', mcNumber: 'MC123' },
    provider: 'dat',
    referenceNumber: 'REF-1',
    pickupDate: '2026-04-01',
    deliveryDate: '2026-04-02',
  }),
};

const mockPrisma = {
  integrationConfig: { findFirst: jest.fn() },
  customer: { findFirst: jest.fn() },
};

const mockAdapterFactory = {
  getLoadBoardAdapter: jest.fn().mockReturnValue(mockAdapter),
};

const mockAuthTokenService = {
  decryptCredentials: jest.fn().mockReturnValue({ apiKey: 'key', apiSecret: 'secret' }),
};

const mockLoadsService = {
  create: jest.fn().mockResolvedValue({ loadId: 'LOAD-1', loadNumber: 'LN-001' }),
};

const mockSearchQueryParser = {
  parse: jest.fn(),
};

const mockLaneRateService = {
  getLaneInsights: jest.fn().mockResolvedValue(new Map()),
  computeVerdict: jest.fn().mockReturnValue({ percentDiff: 0, verdict: 'fair' }),
};

// In live mode, tests need integration config
const env = process.env;

describe('LoadBoardService', () => {
  let service: LoadBoardService;

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.MOCK_MODE = 'off';

    mockPrisma.integrationConfig.findFirst.mockResolvedValue({
      id: 1,
      tenantId: 5,
      vendor: 'DAT_LOAD_BOARD',
      isEnabled: true,
      credentials: 'enc',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoadBoardService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AdapterFactoryService, useValue: mockAdapterFactory },
        { provide: AuthTokenService, useValue: mockAuthTokenService },
        { provide: LoadsService, useValue: mockLoadsService },
        { provide: SearchQueryParser, useValue: mockSearchQueryParser },
        { provide: LaneRateService, useValue: mockLaneRateService },
      ],
    }).compile();

    service = module.get<LoadBoardService>(LoadBoardService);
  });

  afterEach(() => {
    process.env = env;
  });

  // --------------------------------------------------------------------------
  // search
  // --------------------------------------------------------------------------

  describe('search', () => {
    it('should search and enrich with lane insights', async () => {
      const result = await service.search(5, {
        origin: { city: 'Dallas', state: 'TX', radius: 50 },
        provider: 'dat',
        page: 1,
        limit: 25,
      } as any);

      expect(result.listings).toHaveLength(1);
      expect(mockAdapter.search).toHaveBeenCalled();
      expect(mockLaneRateService.getLaneInsights).toHaveBeenCalled();
    });

    it('should throw for unsupported provider', async () => {
      await expect(
        service.search(5, {
          origin: { city: 'X', state: 'TX', radius: 50 },
          provider: 'unknown_provider' as any,
          page: 1,
          limit: 25,
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if no adapter available', async () => {
      mockAdapterFactory.getLoadBoardAdapter.mockReturnValueOnce(null);

      await expect(
        service.search(5, {
          origin: { city: 'X', state: 'TX', radius: 50 },
          provider: 'dat',
          page: 1,
          limit: 25,
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if no active integration', async () => {
      mockPrisma.integrationConfig.findFirst.mockResolvedValue(null);

      await expect(
        service.search(5, {
          origin: { city: 'X', state: 'TX', radius: 50 },
          provider: 'dat',
          page: 1,
          limit: 25,
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should skip integration lookup in DAT mock mode', async () => {
      process.env.MOCK_MODE = 'dat';
      mockPrisma.integrationConfig.findFirst.mockResolvedValue(null);

      const result = await service.search(5, {
        origin: { city: 'X', state: 'TX', radius: 50 },
        provider: 'dat',
        page: 1,
        limit: 25,
      } as any);

      expect(result.listings).toBeDefined();
      expect(mockAuthTokenService.decryptCredentials).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // searchNlp
  // --------------------------------------------------------------------------

  describe('searchNlp', () => {
    it('should parse NLP query and search', async () => {
      mockSearchQueryParser.parse.mockResolvedValue({
        originCity: 'Chicago',
        originState: 'IL',
        destinationCity: 'Memphis',
        destinationState: 'TN',
        equipmentTypes: ['van'],
        minRatePerMile: 2.5,
        maxDeadheadMiles: 100,
        minWeight: 10000,
        maxWeight: 45000,
      });

      await service.searchNlp(5, 'van loads Chicago to Memphis $2.50/mile');

      expect(mockAdapter.search).toHaveBeenCalledWith(
        expect.objectContaining({
          origin: expect.objectContaining({ city: 'Chicago', state: 'IL' }),
          destination: expect.objectContaining({
            city: 'Memphis',
            state: 'TN',
          }),
          equipmentType: ['van'],
          minRate: 2.5,
          maxDeadhead: 100,
        }),
        expect.anything(),
      );
    });

    it('should throw BadRequestException if NLP parse fails', async () => {
      mockSearchQueryParser.parse.mockResolvedValue(null);

      await expect(service.searchNlp(5, 'gibberish text')).rejects.toThrow(BadRequestException);
    });
  });

  // --------------------------------------------------------------------------
  // getListingDetail
  // --------------------------------------------------------------------------

  describe('getListingDetail', () => {
    it('should get listing detail from adapter', async () => {
      await service.getListingDetail(5, 'dat' as any, 'ext-1');

      expect(mockAdapter.getListingDetail).toHaveBeenCalledWith('ext-1', expect.anything());
    });
  });

  // --------------------------------------------------------------------------
  // importListing
  // --------------------------------------------------------------------------

  describe('importListing', () => {
    it('should import listing and create load', async () => {
      mockPrisma.customer.findFirst.mockResolvedValue({ id: 42 });

      const result = await service.importListing(5, 'dat' as any, 'ext-1');
      expect(mockLoadsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 5,
          customerName: 'Broker A',
          customerId: 42,
          intakeSource: 'load_board',
          status: 'DRAFT',
        }),
      );
    });

    it('should set customerId via MC number match', async () => {
      mockPrisma.customer.findFirst.mockResolvedValueOnce({ id: 100 }); // MC match

      await service.importListing(5, 'dat' as any, 'ext-1');

      expect(mockPrisma.customer.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ mcNumber: 'MC123' }),
        }),
      );
    });

    it('should fall back to name match if MC not found', async () => {
      mockAdapter.getListingDetail.mockResolvedValueOnce({
        externalId: 'l1',
        origin: { city: 'A', state: 'TX', zipCode: '75001' },
        destination: { city: 'B', state: 'TX', zipCode: '77001' },
        rate: 2000,
        broker: { name: 'No MC Broker', mcNumber: 'MC-NOMATCH' },
        provider: 'dat',
      });
      mockPrisma.customer.findFirst
        .mockResolvedValueOnce(null) // MC match fails
        .mockResolvedValueOnce({ id: 200 }); // name match succeeds

      await service.importListing(5, 'dat' as any, 'ext-1');

      expect(mockPrisma.customer.findFirst).toHaveBeenCalledTimes(2);
    });
  });

  // --------------------------------------------------------------------------
  // lane insights enrichment
  // --------------------------------------------------------------------------

  describe('enrichWithLaneInsights', () => {
    it('should handle lane insight enrichment failure gracefully', async () => {
      mockLaneRateService.getLaneInsights.mockRejectedValue(new Error('insight error'));

      // Should not throw
      const result = await service.search(5, {
        origin: { city: 'Dallas', state: 'TX', radius: 50 },
        provider: 'dat',
        page: 1,
        limit: 25,
      } as any);

      expect(result.listings).toHaveLength(1);
    });

    it('should skip enrichment when no listings', async () => {
      mockAdapter.search.mockResolvedValueOnce({
        listings: [],
        totalCount: 0,
        page: 1,
      });

      await service.search(5, {
        origin: { city: 'X', state: 'TX', radius: 50 },
        provider: 'dat',
        page: 1,
        limit: 25,
      } as any);

      expect(mockLaneRateService.getLaneInsights).not.toHaveBeenCalled();
    });
  });
});
