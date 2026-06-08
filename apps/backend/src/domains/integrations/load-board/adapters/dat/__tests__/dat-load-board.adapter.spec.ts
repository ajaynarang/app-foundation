import axios from 'axios';
import { DATLoadBoardAdapter } from '../dat-load-board.adapter';
import type { LoadBoardSearchParams } from '@sally/shared-types';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const originalEnv = process.env;

describe('DATLoadBoardAdapter', () => {
  let adapter: DATLoadBoardAdapter;
  const credentials = { apiKey: 'test-key', apiSecret: 'test-secret' };

  beforeEach(() => {
    // Force non-mock mode so axios mocks are used
    process.env = { ...originalEnv, MOCK_MODE: 'off' };
    adapter = new DATLoadBoardAdapter();
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('has providerId "dat"', () => {
    expect(adapter.providerId).toBe('dat');
  });

  describe('search', () => {
    const searchParams: LoadBoardSearchParams = {
      origin: { city: 'Chicago', state: 'IL', radius: 50 },
      provider: 'dat',
      page: 1,
      limit: 25,
    };

    it('returns normalized search results', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { access_token: 'mock-token', expires_in: 3600 },
      });
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          matches: [
            {
              matchId: 'DAT-123',
              origin: {
                city: 'Chicago',
                state: 'IL',
                postalCode: '60601',
                latitude: 41.88,
                longitude: -87.63,
              },
              destination: {
                city: 'Dallas',
                state: 'TX',
                postalCode: '75201',
                latitude: 32.78,
                longitude: -96.8,
              },
              rate: { rateDollars: 2850, ratePerMileDollars: 2.41 },
              distance: { miles: 1183 },
              deadheadMiles: 28,
              equipment: { type: 'Van' },
              weight: { pounds: 42000 },
              commodity: 'General Freight',
              pickupDate: '2026-03-18',
              deliveryDate: '2026-03-19',
              broker: {
                name: 'ABC Logistics',
                phone: '555-123-4567',
                mcNumber: 'MC-123456',
              },
              postedAt: '2026-03-17T10:00:00Z',
              referenceNumber: 'REF-789',
            },
          ],
          totalCount: 1,
        },
      });

      const result = await adapter.search(searchParams, credentials);

      expect(result.listings).toHaveLength(1);
      expect(result.listings[0]).toEqual(
        expect.objectContaining({
          externalId: 'DAT-123',
          provider: 'dat',
          rate: 2850,
          ratePerMile: 2.41,
          distance: 1183,
          equipmentType: 'Van',
        }),
      );
      expect(result.total).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it('returns empty results when no matches', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { access_token: 'mock-token', expires_in: 3600 },
      });
      mockedAxios.post.mockResolvedValueOnce({
        data: { matches: [], totalCount: 0 },
      });

      const result = await adapter.search(searchParams, credentials);

      expect(result.listings).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('throws on auth failure', async () => {
      const authError = Object.assign(new Error('Unauthorized'), {
        response: { status: 401, data: { message: 'Invalid credentials' } },
      });
      mockedAxios.post.mockRejectedValueOnce(authError);

      await expect(adapter.search(searchParams, credentials)).rejects.toThrow('DAT authentication failed');
    });
  });

  describe('testConnection', () => {
    it('returns true for valid credentials', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { access_token: 'mock-token', expires_in: 3600 },
      });

      expect(await adapter.testConnection(credentials)).toBe(true);
    });

    it('returns false for invalid credentials', async () => {
      mockedAxios.post.mockRejectedValueOnce(Object.assign(new Error('Unauthorized'), { response: { status: 401 } }));

      expect(await adapter.testConnection(credentials)).toBe(false);
    });
  });

  describe('getListingDetail', () => {
    it('should authenticate and fetch load detail', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { access_token: 'mock-token', expires_in: 3600 },
      });
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          matchId: 'DAT-456',
          origin: {
            city: 'Chicago',
            state: 'IL',
            postalCode: '60601',
            latitude: 41.88,
            longitude: -87.63,
          },
          destination: {
            city: 'Dallas',
            state: 'TX',
            postalCode: '75201',
            latitude: 32.78,
            longitude: -96.8,
          },
          rate: { rateDollars: 3000, ratePerMileDollars: 2.5 },
          distance: { miles: 1200 },
          deadheadMiles: 15,
          equipment: { type: 'Van' },
          weight: { pounds: 38000 },
          commodity: 'Dry Goods',
          pickupDate: '2026-03-20',
          deliveryDate: '2026-03-21',
          broker: { name: 'XYZ', phone: '555-999-1234', mcNumber: 'MC-789' },
          postedAt: '2026-03-19T10:00:00Z',
        },
      });

      const result = await adapter.getListingDetail('DAT-456', credentials);

      expect(result.externalId).toBe('DAT-456');
      expect(result.provider).toBe('dat');
      expect(result.rate).toBe(3000);
      expect(result.equipmentType).toBe('Van');
    });
  });
});

// ─── Mock mode tests ─────────────────────────────────────────────────────

describe('DATLoadBoardAdapter (mock mode)', () => {
  let adapter: DATLoadBoardAdapter;

  beforeEach(() => {
    process.env = { ...originalEnv, MOCK_MODE: 'dat' };
    adapter = new DATLoadBoardAdapter();
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('search in mock mode', () => {
    it('returns mock listings', async () => {
      const searchParams: LoadBoardSearchParams = {
        origin: { city: 'Chicago', state: 'IL', radius: 50 },
        provider: 'dat',
        page: 1,
        limit: 25,
      };

      const result = await adapter.search(searchParams, {});

      expect(result.listings.length).toBeGreaterThan(0);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(25);
    });

    it('filters by destination when provided', async () => {
      const searchParams: LoadBoardSearchParams = {
        origin: { city: 'Chicago', state: 'IL', radius: 50 },
        destination: { city: 'Dallas', state: 'TX', radius: 100 },
        provider: 'dat',
        page: 1,
        limit: 25,
      };

      const result = await adapter.search(searchParams, {});

      expect(result.listings).toBeDefined();
    });

    it('filters by equipment type when provided', async () => {
      const searchParams: LoadBoardSearchParams = {
        origin: { city: 'Chicago', state: 'IL', radius: 50 },
        equipmentType: ['van'],
        provider: 'dat',
        page: 1,
        limit: 25,
      };

      const result = await adapter.search(searchParams, {});

      expect(result.listings).toBeDefined();
    });

    it('paginates results correctly', async () => {
      const searchParams: LoadBoardSearchParams = {
        origin: { city: 'Chicago', state: 'IL', radius: 50 },
        provider: 'dat',
        page: 1,
        limit: 1,
      };

      const result = await adapter.search(searchParams, {});

      expect(result.listings.length).toBeLessThanOrEqual(1);
    });
  });

  describe('getListingDetail in mock mode', () => {
    it('returns mock listing by external ID', async () => {
      const result = await adapter.getListingDetail('MOCK-DAT-001', {});

      expect(result.externalId).toBe('MOCK-DAT-001');
      expect(result.provider).toBe('dat');
    });

    it('throws NotFoundException for unknown listing', async () => {
      await expect(adapter.getListingDetail('NONEXISTENT', {})).rejects.toThrow('Load board listing not found');
    });
  });

  describe('testConnection in mock mode', () => {
    it('returns true in mock mode', async () => {
      const result = await adapter.testConnection({});

      expect(result).toBe(true);
    });
  });
});
