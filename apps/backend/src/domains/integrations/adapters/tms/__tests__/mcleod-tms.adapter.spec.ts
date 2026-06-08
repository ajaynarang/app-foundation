import { NotFoundException } from '@nestjs/common';
import { McLeodTMSAdapter } from '../mcleod-tms.adapter';

// Mock the mock.config — set MOCK_TMS to true for all tests in this file
jest.mock('../../../../../infrastructure/mock/mock.config', () => ({
  MOCK_TMS: true,
  MOCK_DAT: true,
  isMockModeFor: () => true,
}));

describe('McLeodTMSAdapter', () => {
  let adapter: McLeodTMSAdapter;

  beforeEach(() => {
    adapter = new McLeodTMSAdapter();
  });

  describe('getLoad', () => {
    it('should throw NotFoundException in mock mode', async () => {
      await expect(adapter.getLoad('key', 'secret', 'LOAD-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getActiveLoads', () => {
    it('should return empty array in mock mode', async () => {
      const result = await adapter.getActiveLoads('key', 'secret');
      expect(result).toEqual([]);
    });
  });

  describe('testConnection', () => {
    it('should return true when apiKey is long enough', async () => {
      const result = await adapter.testConnection('valid-api-key-12345');
      expect(result).toBe(true);
    });

    it('should return false when apiKey is too short', async () => {
      const result = await adapter.testConnection('short');
      expect(result).toBe(false);
    });

    it('should return false when apiKey is empty', async () => {
      const result = await adapter.testConnection('');
      expect(result).toBe(false);
    });
  });

  describe('getVehicles', () => {
    it('should return empty array in mock mode', async () => {
      const result = await adapter.getVehicles('key', 'secret');
      expect(result).toEqual([]);
    });
  });

  describe('getDrivers', () => {
    it('should return empty array in mock mode', async () => {
      const result = await adapter.getDrivers('key', 'secret');
      expect(result).toEqual([]);
    });
  });

  describe('syncAllLoads', () => {
    it('should return empty array in mock mode', async () => {
      const result = await adapter.syncAllLoads('key', 'secret');
      expect(result).toEqual([]);
    });
  });
});
