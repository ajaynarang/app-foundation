import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ILoadBoardAdapter } from '../../interfaces/load-board-adapter.interface';
import type { LoadBoardSearchParams, LoadBoardSearchResult, LoadBoardListing } from '@sally/shared-types';
import { DATApiClient } from './dat-api.client';
import { MOCK_LISTINGS } from './dat-mock-data';
import type { DATMatch } from './dat.types';
import { isMockModeFor } from '../../../../../infrastructure/mock/mock.config';

function isMockMode() {
  return isMockModeFor('dat');
}

@Injectable()
export class DATLoadBoardAdapter implements ILoadBoardAdapter {
  readonly providerId = 'dat';
  private readonly logger = new Logger(DATLoadBoardAdapter.name);
  private readonly client = new DATApiClient();

  async search(params: LoadBoardSearchParams, credentials: Record<string, string>): Promise<LoadBoardSearchResult> {
    if (isMockMode()) {
      return this.mockSearch(params);
    }

    const token = await this.client.authenticate(credentials.apiKey, credentials.apiSecret);

    const response = await this.client.searchLoads(token, {
      origin: params.origin,
      destination: params.destination,
      equipmentTypes: params.equipmentType,
      minRate: params.minRate,
      maxDeadhead: params.maxDeadhead,
      minWeight: params.minWeight,
      maxWeight: params.maxWeight,
      pickupDateFrom: params.pickupDateFrom,
      pickupDateTo: params.pickupDateTo,
      page: params.page,
      limit: params.limit,
    });

    const listings = response.matches.map((match) => this.normalizeMatch(match));

    return {
      listings,
      total: response.totalCount,
      page: params.page,
      limit: params.limit,
      hasMore: params.page * params.limit < response.totalCount,
    };
  }

  async getListingDetail(externalId: string, credentials: Record<string, string>): Promise<LoadBoardListing> {
    if (isMockMode()) {
      const listing = MOCK_LISTINGS.find((l) => l.externalId === externalId);
      if (!listing) throw new NotFoundException('Load board listing not found');
      return listing;
    }

    const token = await this.client.authenticate(credentials.apiKey, credentials.apiSecret);
    const match = await this.client.getLoadDetail(token, externalId);
    return this.normalizeMatch(match);
  }

  async testConnection(credentials: Record<string, string>): Promise<boolean> {
    if (isMockMode()) return true;

    try {
      await this.client.authenticate(credentials.apiKey, credentials.apiSecret);
      return true;
    } catch {
      return false;
    }
  }

  private mockSearch(params: LoadBoardSearchParams): LoadBoardSearchResult {
    // Filter mock data by origin city/state (case-insensitive)
    let filtered = MOCK_LISTINGS;
    const originCity = params.origin.city.toLowerCase();
    const originState = params.origin.state.toUpperCase();

    // If origin doesn't match any mock data, return all (for demo purposes)
    const originMatches = filtered.filter(
      (l) => l.origin.city.toLowerCase().includes(originCity) || l.origin.state === originState,
    );
    if (originMatches.length > 0) filtered = originMatches;

    if (params.destination) {
      const destMatches = filtered.filter(
        (l) =>
          l.destination.city.toLowerCase().includes(params.destination.city.toLowerCase()) ||
          l.destination.state === params.destination.state.toUpperCase(),
      );
      if (destMatches.length > 0) filtered = destMatches;
    }

    if (params.equipmentType?.length) {
      const types = params.equipmentType.map((t) => t.toLowerCase());
      const eqMatches = filtered.filter((l) => types.includes(l.equipmentType.toLowerCase()));
      if (eqMatches.length > 0) filtered = eqMatches;
    }

    const start = (params.page - 1) * params.limit;
    const page = filtered.slice(start, start + params.limit);

    this.logger.log(`[MOCK] Load board search returned ${page.length} of ${filtered.length} results`);

    return {
      listings: page,
      total: filtered.length,
      page: params.page,
      limit: params.limit,
      hasMore: start + params.limit < filtered.length,
    };
  }

  private normalizeMatch(match: DATMatch): LoadBoardListing {
    return {
      externalId: match.matchId,
      provider: 'dat',
      origin: {
        city: match.origin.city,
        state: match.origin.state,
        zipCode: match.origin.postalCode,
        lat: match.origin.latitude,
        lng: match.origin.longitude,
      },
      destination: {
        city: match.destination.city,
        state: match.destination.state,
        zipCode: match.destination.postalCode,
        lat: match.destination.latitude,
        lng: match.destination.longitude,
      },
      rate: match.rate.rateDollars,
      ratePerMile: match.rate.ratePerMileDollars,
      distance: match.distance.miles,
      deadheadMiles: match.deadheadMiles,
      equipmentType: match.equipment.type,
      weight: match.weight?.pounds,
      commodity: match.commodity,
      pickupDate: match.pickupDate,
      deliveryDate: match.deliveryDate,
      broker: {
        name: match.broker.name,
        contact: match.broker.contact,
        phone: match.broker.phone,
        email: match.broker.email,
        mcNumber: match.broker.mcNumber,
      },
      specialInstructions: match.specialInstructions,
      referenceNumber: match.referenceNumber,
      postedAt: match.postedAt,
      length: match.length,
    };
  }
}
