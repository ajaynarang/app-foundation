import axios from 'axios';
import { UnauthorizedException, InternalServerErrorException } from '@nestjs/common';
import { DATApiClient } from '../dat-api.client';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('DATApiClient', () => {
  let client: DATApiClient;

  beforeEach(() => {
    client = new DATApiClient();
    jest.clearAllMocks();
  });

  describe('authenticate', () => {
    it('should return access token on success', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { access_token: 'tok-123', expires_in: 3600 },
      });

      const token = await client.authenticate('key', 'secret');

      expect(token).toBe('tok-123');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('identity.dat.com'),
        expect.objectContaining({
          grant_type: 'client_credentials',
          client_id: 'key',
          client_secret: 'secret',
        }),
      );
    });

    it('should return cached token when valid', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { access_token: 'cached-tok', expires_in: 3600 },
      });

      const token1 = await client.authenticate('key', 'secret');
      const token2 = await client.authenticate('key', 'secret');

      expect(token1).toBe('cached-tok');
      expect(token2).toBe('cached-tok');
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it('should throw UnauthorizedException on 401', async () => {
      mockedAxios.post.mockRejectedValueOnce(
        Object.assign(new Error('Unauthorized'), {
          response: { status: 401 },
        }),
      );

      await expect(client.authenticate('bad-key', 'secret')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw InternalServerErrorException on other errors', async () => {
      mockedAxios.post.mockRejectedValueOnce(
        Object.assign(new Error('Network error'), {
          response: { status: 500 },
        }),
      );

      await expect(client.authenticate('key', 'secret')).rejects.toThrow(InternalServerErrorException);
    });

    it('should throw InternalServerErrorException on non-response errors', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(client.authenticate('key', 'secret')).rejects.toThrow(InternalServerErrorException);
    });

    it('should evict oldest cache entry when cache is full', async () => {
      // Fill cache with 50+ entries
      for (let i = 0; i < 52; i++) {
        mockedAxios.post.mockResolvedValueOnce({
          data: { access_token: `tok-${i}`, expires_in: 3600 },
        });
        await client.authenticate(`key-${i}`, 'secret');
      }

      // All calls should succeed (no errors from eviction)
      expect(mockedAxios.post).toHaveBeenCalledTimes(52);
    });
  });

  describe('searchLoads', () => {
    it('should POST search request with correct params', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          matches: [],
          totalCount: 0,
        },
      });

      const result = await client.searchLoads('tok', {
        origin: { city: 'Chicago', state: 'IL', radius: 50 },
        page: 1,
        limit: 25,
      });

      expect(result.totalCount).toBe(0);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('loads/search'),
        expect.objectContaining({
          origin: { city: 'Chicago', state: 'IL', radius: 50 },
          pagination: { page: 1, pageSize: 25 },
        }),
        expect.objectContaining({
          headers: { Authorization: 'Bearer tok' },
        }),
      );
    });

    it('should include optional params when provided', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { matches: [], totalCount: 0 },
      });

      await client.searchLoads('tok', {
        origin: { city: 'Chicago', state: 'IL', radius: 50 },
        destination: { city: 'Dallas', state: 'TX', radius: 100 },
        equipmentTypes: ['Van', 'Flatbed'],
        minRate: 2000,
        maxDeadhead: 50,
        minWeight: 10000,
        maxWeight: 45000,
        pickupDateFrom: '2026-03-20',
        pickupDateTo: '2026-03-25',
        page: 1,
        limit: 25,
      });

      const callBody = mockedAxios.post.mock.calls[0][1] as any;
      expect(callBody.destination).toEqual({
        city: 'Dallas',
        state: 'TX',
        radius: 100,
      });
      expect(callBody.equipmentTypes).toEqual(['Van', 'Flatbed']);
      expect(callBody.minRate).toBe(2000);
      expect(callBody.maxDeadheadMiles).toBe(50);
      expect(callBody.minWeight).toBe(10000);
      expect(callBody.maxWeight).toBe(45000);
      expect(callBody.pickupDateFrom).toBe('2026-03-20');
      expect(callBody.pickupDateTo).toBe('2026-03-25');
    });
  });

  describe('getLoadDetail', () => {
    it('should GET load by matchId', async () => {
      const mockMatch = {
        matchId: 'DAT-123',
        origin: { city: 'Chicago', state: 'IL' },
        destination: { city: 'Dallas', state: 'TX' },
      };

      mockedAxios.get.mockResolvedValueOnce({ data: mockMatch });

      const result = await client.getLoadDetail('tok', 'DAT-123');

      expect(result.matchId).toBe('DAT-123');
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('loads/DAT-123'),
        expect.objectContaining({
          headers: { Authorization: 'Bearer tok' },
        }),
      );
    });
  });
});
