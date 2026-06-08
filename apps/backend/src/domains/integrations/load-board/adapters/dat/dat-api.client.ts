import { createHash } from 'crypto';
import axios from 'axios';
import { Logger, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import type { DATAuthResponse, DATSearchResponse, DATMatch } from './dat.types';

const DAT_BASE_URL = 'https://power.dat.com/api/v2';
const DAT_AUTH_URL = 'https://identity.dat.com/access/token';
const REQUEST_TIMEOUT = 15_000;
const TOKEN_BUFFER_MS = 60_000;
const MAX_CACHE_ENTRIES = 50;

export class DATApiClient {
  private readonly logger = new Logger(DATApiClient.name);
  private readonly tokenCache = new Map<string, { token: string; expiresAt: number }>();

  private cacheKey(apiKey: string): string {
    return createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
  }

  async authenticate(apiKey: string, apiSecret: string): Promise<string> {
    const key = this.cacheKey(apiKey);
    const cached = this.tokenCache.get(key);
    if (cached && Date.now() < cached.expiresAt - TOKEN_BUFFER_MS) {
      return cached.token;
    }

    try {
      const response = await axios.post<DATAuthResponse>(DAT_AUTH_URL, {
        grant_type: 'client_credentials',
        client_id: apiKey,
        client_secret: apiSecret,
      });

      const { access_token, expires_in } = response.data;

      // Evict oldest entries if cache grows too large
      if (this.tokenCache.size >= MAX_CACHE_ENTRIES) {
        const firstKey = this.tokenCache.keys().next().value;
        if (firstKey) this.tokenCache.delete(firstKey);
      }

      this.tokenCache.set(key, {
        token: access_token,
        expiresAt: Date.now() + expires_in * 1000,
      });
      return access_token;
    } catch (error: any) {
      this.tokenCache.delete(key);
      if (error.response?.status === 401) {
        throw new UnauthorizedException('DAT authentication failed — please check your API credentials.');
      }
      this.logger.error(`DAT auth error: ${error.message}`);
      throw new InternalServerErrorException('DAT authentication failed — please try again');
    }
  }

  async searchLoads(
    token: string,
    params: {
      origin: { city: string; state: string; radius: number };
      destination?: { city: string; state: string; radius: number };
      equipmentTypes?: string[];
      minRate?: number;
      maxDeadhead?: number;
      minWeight?: number;
      maxWeight?: number;
      pickupDateFrom?: string;
      pickupDateTo?: string;
      page: number;
      limit: number;
    },
  ): Promise<DATSearchResponse> {
    const body: Record<string, any> = {
      origin: {
        city: params.origin.city,
        state: params.origin.state,
        radius: params.origin.radius,
      },
      pagination: { page: params.page, pageSize: params.limit },
    };

    if (params.destination) {
      body.destination = {
        city: params.destination.city,
        state: params.destination.state,
        radius: params.destination.radius,
      };
    }
    if (params.equipmentTypes?.length) body.equipmentTypes = params.equipmentTypes;
    if (params.minRate) body.minRate = params.minRate;
    if (params.maxDeadhead) body.maxDeadheadMiles = params.maxDeadhead;
    if (params.minWeight) body.minWeight = params.minWeight;
    if (params.maxWeight) body.maxWeight = params.maxWeight;
    if (params.pickupDateFrom) body.pickupDateFrom = params.pickupDateFrom;
    if (params.pickupDateTo) body.pickupDateTo = params.pickupDateTo;

    const response = await axios.post<DATSearchResponse>(`${DAT_BASE_URL}/loads/search`, body, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: REQUEST_TIMEOUT,
    });

    return response.data;
  }

  async getLoadDetail(token: string, matchId: string): Promise<DATMatch> {
    const response = await axios.get<DATMatch>(`${DAT_BASE_URL}/loads/${matchId}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: REQUEST_TIMEOUT,
    });

    return response.data;
  }
}
