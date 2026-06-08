import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { ITMSAdapter, LoadData, VehicleData, DriverData } from './tms-adapter.interface';
import { MOCK_TMS } from '../../../../infrastructure/mock/mock.config';

/**
 * McLeod TMS Adapter
 *
 * When MOCK_MODE includes 'tms' (or 'all'): returns data from the unified mock dataset.
 * Otherwise: calls real McLeod TMS API (Phase 2/3).
 */
@Injectable()
export class McLeodTMSAdapter implements ITMSAdapter {
  getLoad(_apiKey: string, _apiSecret: string, _loadId: string): Promise<LoadData> {
    if (MOCK_TMS) {
      return Promise.reject(new NotFoundException('Load not found'));
    }

    // Real API call (Phase 2)
    return Promise.reject(new InternalServerErrorException('McLeod TMS integration is not available yet'));
  }

  getActiveLoads(_apiKey: string, _apiSecret: string): Promise<LoadData[]> {
    if (MOCK_TMS) return Promise.resolve([]);

    // Real API call (Phase 2)
    return Promise.reject(new InternalServerErrorException('McLeod TMS integration is not available yet'));
  }

  testConnection(apiKey: string, _apiSecret?: string): Promise<boolean> {
    if (MOCK_TMS) {
      return Promise.resolve(!!apiKey && apiKey.length > 10);
    }

    // Real API test (Phase 2)
    return Promise.resolve(false);
  }

  getVehicles(_apiKey: string, _apiSecret: string): Promise<VehicleData[]> {
    if (MOCK_TMS) return Promise.resolve([]);

    // Real API call (Phase 2)
    return Promise.reject(new InternalServerErrorException('McLeod TMS integration is not available yet'));
  }

  getDrivers(_apiKey: string, _apiSecret: string): Promise<DriverData[]> {
    if (MOCK_TMS) return Promise.resolve([]);

    // Real API call (Phase 2)
    return Promise.reject(new InternalServerErrorException('McLeod TMS integration is not available yet'));
  }

  syncAllLoads(_apiKey: string, _apiSecret?: string): Promise<string[]> {
    if (MOCK_TMS) return Promise.resolve([]);

    // Real API call (Phase 2)
    return Promise.resolve([]);
  }
}
