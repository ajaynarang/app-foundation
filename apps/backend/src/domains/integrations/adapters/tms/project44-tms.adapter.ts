import { Logger, BadRequestException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { ITMSAdapter, LoadData, VehicleData, DriverData } from './tms-adapter.interface';
import { EARTH_RADIUS_MILES } from '@sally/shared-types';
import { MOCK_TMS } from '../../../../infrastructure/mock/mock.config';

/**
 * project44 TMS Adapter
 *
 * When MOCK_MODE includes 'tms' (or 'all'): returns data from the unified mock dataset.
 * Otherwise: calls real project44 API.
 *
 * API Documentation: https://developers.project44.com/
 *
 * Authentication: OAuth 2.0 (Client Credentials)
 * Base URL: https://na12.api.project44.com/api/v4
 * Sandbox: https://na12.api.sandbox.p-44.com/api/v4
 */
export class Project44TMSAdapter implements ITMSAdapter {
  private readonly logger = new Logger(Project44TMSAdapter.name);
  private readonly baseUrl = 'https://na12.api.project44.com/api/v4';

  // In-memory token cache
  private tokenCache: {
    token: string | null;
    expiresAt: number | null;
  } = {
    token: null,
    expiresAt: null,
  };

  /**
   * Test connection to project44 API
   *
   * In mock mode: Only succeeds if credentials are provided (any non-empty values)
   * This makes it feel like a real connection test
   */
  async testConnection(clientId: string, clientSecret: string): Promise<boolean> {
    // Validate credentials are provided (even in mock mode)
    if (!clientId || !clientSecret) {
      return false;
    }

    if (MOCK_TMS) {
      // In mock mode, accept any non-empty credentials
      return true;
    }

    try {
      const token = await this.getOAuthToken(clientId, clientSecret);
      return !!token;
    } catch (error) {
      this.logger.error('project44 connection test failed:', error);
      return false;
    }
  }

  /**
   * Get all active loads from project44
   *
   * In mock mode: Only returns data if credentials are provided
   */
  async getActiveLoads(clientId: string, clientSecret: string): Promise<LoadData[]> {
    // Validate credentials are provided
    if (!clientId || !clientSecret) {
      throw new BadRequestException('project44 integration credentials are not configured');
    }

    if (MOCK_TMS) {
      return [];
    }

    try {
      const token = await this.getOAuthToken(clientId, clientSecret);

      const response = await fetch(`${this.baseUrl}/loads?status=active`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new InternalServerErrorException('project44 API request failed — please try again');
      }

      const data = await response.json();
      const loads = data.data || [];

      return loads.map((load: any) => this.transformLoadData(load));
    } catch (error) {
      this.logger.error('Failed to fetch loads from project44:', error);
      throw error;
    }
  }

  /**
   * Get specific load by ID
   *
   * In mock mode: Only returns data if credentials are provided
   */
  async getLoad(clientId: string, clientSecret: string, loadId: string): Promise<LoadData> {
    // Validate credentials are provided
    if (!clientId || !clientSecret) {
      throw new BadRequestException('project44 integration credentials are not configured');
    }

    if (MOCK_TMS) {
      throw new NotFoundException('Load not found');
    }

    try {
      const token = await this.getOAuthToken(clientId, clientSecret);

      const response = await fetch(`${this.baseUrl}/loads/${loadId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new InternalServerErrorException('project44 API request failed — please try again');
      }

      const load = await response.json();
      return this.transformLoadData(load);
    } catch (error) {
      this.logger.error(`Failed to fetch load ${loadId} from project44:`, error);
      throw error;
    }
  }

  /**
   * Sync all loads (fetch and return IDs)
   *
   * In mock mode: Only returns data if credentials are provided
   */
  async syncAllLoads(clientId: string, clientSecret: string): Promise<string[]> {
    // Validate credentials are provided
    if (!clientId || !clientSecret) {
      throw new BadRequestException('project44 integration credentials are not configured');
    }

    const loads = await this.getActiveLoads(clientId, clientSecret);
    return loads.map((load) => load.load_id);
  }

  /**
   * Get all drivers from project44
   *
   * In mock mode: Only returns data if credentials are provided
   */
  async getDrivers(clientId: string, clientSecret: string): Promise<DriverData[]> {
    // Validate credentials are provided
    if (!clientId || !clientSecret) {
      throw new BadRequestException('project44 integration credentials are not configured');
    }

    if (MOCK_TMS) {
      return [];
    }

    try {
      const token = await this.getOAuthToken(clientId, clientSecret);

      const response = await fetch(`${this.baseUrl}/drivers`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new InternalServerErrorException('project44 API request failed — please try again');
      }

      const data = await response.json();
      const drivers = data.data || [];

      return drivers.map((driver: any) => this.transformDriverData(driver));
    } catch (error) {
      this.logger.error('Failed to fetch drivers from project44:', error);
      throw error;
    }
  }

  /**
   * Get all vehicles from project44
   *
   * In mock mode: Only returns data if credentials are provided
   */
  async getVehicles(clientId: string, clientSecret: string): Promise<VehicleData[]> {
    // Validate credentials are provided
    if (!clientId || !clientSecret) {
      throw new BadRequestException('project44 integration credentials are not configured');
    }

    if (MOCK_TMS) {
      return [];
    }

    try {
      const token = await this.getOAuthToken(clientId, clientSecret);

      const response = await fetch(`${this.baseUrl}/vehicles`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new InternalServerErrorException('project44 API request failed — please try again');
      }

      const data = await response.json();
      const vehicles = data.data || [];

      return vehicles.map((vehicle: any) => this.transformVehicleData(vehicle));
    } catch (error) {
      this.logger.error('Failed to fetch vehicles from project44:', error);
      throw error;
    }
  }

  /**
   * Get OAuth 2.0 access token from project44
   * Tokens are cached and reused for 12 hours
   */
  private async getOAuthToken(clientId: string, clientSecret: string): Promise<string> {
    // Check if cached token is still valid
    if (this.tokenCache.token && this.tokenCache.expiresAt) {
      const now = Date.now();
      if (now < this.tokenCache.expiresAt) {
        return this.tokenCache.token;
      }
    }

    // Get new token
    const response = await fetch(`${this.baseUrl}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!response.ok) {
      throw new InternalServerErrorException('project44 authentication failed — please reconnect');
    }

    const data = await response.json();

    // Cache token (expires in ~12 hours = 43200 seconds)
    this.tokenCache.token = data.access_token;
    this.tokenCache.expiresAt = Date.now() + data.expires_in * 1000;

    return data.access_token;
  }

  /**
   * Transform project44 driver data to DriverData format
   */
  private transformDriverData(p44Driver: any): DriverData {
    return {
      driver_id: p44Driver.id || p44Driver.driverId,
      first_name: p44Driver.firstName || '',
      last_name: p44Driver.lastName || '',
      phone: p44Driver.phone || p44Driver.phoneNumber || '',
      email: p44Driver.email,
      license_number: p44Driver.licenseNumber,
      status: this.mapDriverStatus(p44Driver.status),
      data_source: 'project44_tms',
    };
  }

  /**
   * Transform project44 vehicle data to VehicleData format
   */
  private transformVehicleData(p44Vehicle: any): VehicleData {
    return {
      vehicle_id: p44Vehicle.id || p44Vehicle.vehicleId,
      unit_number: p44Vehicle.unitNumber || p44Vehicle.number || '',
      make: p44Vehicle.make || '',
      model: p44Vehicle.model || '',
      year: p44Vehicle.year || 0,
      vin: p44Vehicle.vin,
      license_plate: p44Vehicle.licensePlate,
      status: this.mapVehicleStatus(p44Vehicle.status),
      data_source: 'project44_tms',
    };
  }

  /**
   * Transform project44 load data to SALLY LoadData format
   */
  private transformLoadData(p44Load: any): LoadData {
    return {
      load_id: p44Load.externalLoadNumber || p44Load.id,
      load_number: p44Load.externalLoadNumber || p44Load.id,
      customer_name: p44Load.customerName || 'Unknown',
      weight_lbs: p44Load.weight || 0,
      commodity_type: p44Load.commodityType || 'General Freight',
      pickup_location: {
        address: p44Load.pickupStopReference?.address || '',
        city: p44Load.pickupStopReference?.city || '',
        state: p44Load.pickupStopReference?.state || '',
        zip: p44Load.pickupStopReference?.zip || '',
        latitude: p44Load.pickupStopReference?.latitude || 0,
        longitude: p44Load.pickupStopReference?.longitude || 0,
      },
      delivery_location: {
        address: p44Load.deliveryStopReference?.address || '',
        city: p44Load.deliveryStopReference?.city || '',
        state: p44Load.deliveryStopReference?.state || '',
        zip: p44Load.deliveryStopReference?.zip || '',
        latitude: p44Load.deliveryStopReference?.latitude || 0,
        longitude: p44Load.deliveryStopReference?.longitude || 0,
      },
      pickup_appointment: p44Load.pickupStopReference?.appointmentTime || null,
      delivery_appointment: p44Load.deliveryStopReference?.appointmentTime || null,
      assigned_driver_id: null, // project44 doesn't directly expose driver ID
      status: this.mapStatus(p44Load.status),
      total_miles: this.calculateDistance(
        p44Load.pickupStopReference?.latitude,
        p44Load.pickupStopReference?.longitude,
        p44Load.deliveryStopReference?.latitude,
        p44Load.deliveryStopReference?.longitude,
      ),
      data_source: 'project44_tms',
    };
  }

  /**
   * Map project44 load status to SALLY status
   */
  private mapStatus(p44Status: string): 'UNASSIGNED' | 'ASSIGNED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED' {
    const statusMap: Record<string, 'UNASSIGNED' | 'ASSIGNED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED'> = {
      CREATED: 'ASSIGNED',
      ACTIVE: 'ASSIGNED',
      IN_TRANSIT: 'IN_TRANSIT',
      DELIVERED: 'DELIVERED',
      CANCELLED: 'CANCELLED',
      PENDING: 'ASSIGNED',
    };

    return statusMap[p44Status] || 'ASSIGNED';
  }

  /**
   * Map project44 driver status to standard status
   */
  private mapDriverStatus(p44Status: string): 'ACTIVE' | 'INACTIVE' | 'IN_SERVICE' | 'OUT_OF_SERVICE' {
    const statusMap: Record<string, 'ACTIVE' | 'INACTIVE' | 'IN_SERVICE' | 'OUT_OF_SERVICE'> = {
      ACTIVE: 'ACTIVE',
      INACTIVE: 'INACTIVE',
      ON_DUTY: 'IN_SERVICE',
      OFF_DUTY: 'OUT_OF_SERVICE',
      AVAILABLE: 'ACTIVE',
      UNAVAILABLE: 'INACTIVE',
    };

    return statusMap[p44Status] || 'ACTIVE';
  }

  /**
   * Map project44 vehicle status
   */
  private mapVehicleStatus(p44Status: string): 'ACTIVE' | 'INACTIVE' | 'IN_SERVICE' | 'OUT_OF_SERVICE' {
    const statusMap: Record<string, 'ACTIVE' | 'INACTIVE' | 'IN_SERVICE' | 'OUT_OF_SERVICE'> = {
      ACTIVE: 'ACTIVE',
      INACTIVE: 'INACTIVE',
      IN_SERVICE: 'IN_SERVICE',
      OUT_OF_SERVICE: 'OUT_OF_SERVICE',
      AVAILABLE: 'ACTIVE',
      UNAVAILABLE: 'INACTIVE',
      MAINTENANCE: 'OUT_OF_SERVICE',
    };

    return statusMap[p44Status] || 'ACTIVE';
  }

  /**
   * Calculate distance between two coordinates (Haversine formula)
   */
  private calculateDistance(lat1?: number, lon1?: number, lat2?: number, lon2?: number): number {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 0;

    const R = EARTH_RADIUS_MILES;
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  }

  private toRad(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }
}
