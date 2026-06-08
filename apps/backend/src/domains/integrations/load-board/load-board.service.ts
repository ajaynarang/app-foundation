import { randomUUID } from 'crypto';
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { AdapterFactoryService } from '../adapters/adapter-factory.service';
import { AuthTokenService } from '../oauth/auth-token.service';
import { LoadsService } from '../../fleet/loads/services/loads.service';
import type { IntegrationVendor } from '@prisma/client';
import { SearchQueryParser } from './nlp/search-query-parser';
import { LaneRateService } from './services/lane-rate.service';
import { isMockModeFor } from '../../../infrastructure/mock/mock.config';
import type {
  LoadBoardSearchParams,
  LoadBoardSearchResult,
  LoadBoardListing,
  LoadBoardProvider,
  LoadBoardImportResult,
} from '@sally/shared-types';

const PROVIDER_TO_VENDOR: Record<string, string> = {
  dat: 'DAT_LOAD_BOARD',
};

@Injectable()
export class LoadBoardService {
  private readonly logger = new Logger(LoadBoardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adapterFactory: AdapterFactoryService,
    private readonly authTokenService: AuthTokenService,
    private readonly loadsService: LoadsService,
    private readonly searchQueryParser: SearchQueryParser,
    private readonly laneRateService: LaneRateService,
  ) {}

  async search(tenantId: number, params: LoadBoardSearchParams): Promise<LoadBoardSearchResult> {
    const { adapter, credentials } = await this.resolveAdapter(tenantId, params.provider);

    this.logger.log(
      `Load board search: ${params.origin.city}, ${params.origin.state} → ${params.destination?.city || 'any'} [${params.provider}]`,
    );

    const result = await adapter.search(params, credentials);

    // Enrich with lane insights (non-blocking)
    await this.enrichWithLaneInsights(tenantId, result.listings);

    return result;
  }

  async searchNlp(tenantId: number, query: string): Promise<LoadBoardSearchResult> {
    const extraction = await this.searchQueryParser.parse(query);

    if (!extraction) {
      throw new BadRequestException(
        "Couldn't understand that search. Try something like: van loads out of Chicago paying $2.50/mile",
      );
    }

    const params: LoadBoardSearchParams = {
      origin: {
        city: extraction.originCity,
        state: extraction.originState,
        radius: 50,
      },
      provider: 'dat',
      page: 1,
      limit: 25,
    };

    if (extraction.destinationCity && extraction.destinationState) {
      params.destination = {
        city: extraction.destinationCity,
        state: extraction.destinationState,
        radius: 50,
      };
    }
    if (extraction.equipmentTypes?.length) {
      params.equipmentType = extraction.equipmentTypes as any;
    }
    if (extraction.minRatePerMile) {
      params.minRate = extraction.minRatePerMile;
    }
    if (extraction.maxDeadheadMiles) {
      params.maxDeadhead = extraction.maxDeadheadMiles;
    }
    if (extraction.minWeight) params.minWeight = extraction.minWeight;
    if (extraction.maxWeight) params.maxWeight = extraction.maxWeight;

    this.logger.log(`NLP search: "${query}" → ${params.origin.city}, ${params.origin.state}`);

    return this.search(tenantId, params);
  }

  async getListingDetail(tenantId: number, provider: LoadBoardProvider, externalId: string): Promise<LoadBoardListing> {
    const { adapter, credentials } = await this.resolveAdapter(tenantId, provider);
    return adapter.getListingDetail(externalId, credentials);
  }

  async importListing(
    tenantId: number,
    provider: LoadBoardProvider,
    externalId: string,
  ): Promise<LoadBoardImportResult> {
    const listing = await this.getListingDetail(tenantId, provider, externalId);

    // Match customer by MC number first (industry standard), then by name
    const customerId = await this.findCustomerId(tenantId, listing);

    const load = await this.loadsService.create({
      tenantId,
      customerName: listing.broker.name,
      customerId,
      weightLbs: listing.weight || 0,
      commodityType: listing.commodity || 'General Freight',
      equipmentType: listing.equipmentType,
      referenceNumber: listing.referenceNumber,
      rateCents: Math.round(listing.rate * 100),
      intakeSource: 'load_board',
      intakeMetadata: {
        provider: listing.provider,
        externalId: listing.externalId,
        broker: listing.broker,
        importedAt: new Date().toISOString(),
      },
      status: 'DRAFT',
      stops: [
        {
          stopId: `STOP-${randomUUID()}`,
          sequenceOrder: 1,
          actionType: 'pickup',
          city: listing.origin.city,
          state: listing.origin.state,
          zipCode: listing.origin.zipCode,
          appointmentDate: listing.pickupDate,
          estimatedDockHours: 2,
        },
        {
          stopId: `STOP-${randomUUID()}`,
          sequenceOrder: 2,
          actionType: 'delivery',
          city: listing.destination.city,
          state: listing.destination.state,
          zipCode: listing.destination.zipCode,
          appointmentDate: listing.deliveryDate,
          estimatedDockHours: 2,
        },
      ],
    });

    this.logger.log(`Imported load board listing ${listing.externalId} as ${load.loadNumber}`);

    return { loadNumber: load.loadNumber };
  }

  private async enrichWithLaneInsights(tenantId: number, listings: LoadBoardListing[]): Promise<void> {
    if (listings.length === 0) return;

    const lanes = listings.map((l) => ({
      originState: l.origin.state,
      destState: l.destination.state,
    }));

    try {
      const insights = await this.laneRateService.getLaneInsights(tenantId, lanes);

      for (const listing of listings) {
        const key = `${listing.origin.state}-${listing.destination.state}`;
        const insight = insights.get(key);
        if (insight) {
          const { percentDiff, verdict } = this.laneRateService.computeVerdict(
            listing.ratePerMile,
            insight.avgRatePerMile,
          );
          listing.laneInsight = { ...insight, percentDiff, verdict };
        }
      }
    } catch (error: any) {
      // Non-critical — don't fail the search if lane insights fail
      this.logger.warn(`Lane insight enrichment failed: ${error.message}`);
    }
  }

  private async findCustomerId(tenantId: number, listing: LoadBoardListing): Promise<number | undefined> {
    // Try MC number first (most reliable)
    if (listing.broker.mcNumber) {
      const byMc = await this.prisma.customer.findFirst({
        where: { tenantId, mcNumber: listing.broker.mcNumber },
        select: { id: true },
      });
      if (byMc) return byMc.id;
    }

    // Fall back to company name (case-insensitive)
    if (listing.broker.name) {
      const byName = await this.prisma.customer.findFirst({
        where: {
          tenantId,
          companyName: { equals: listing.broker.name, mode: 'insensitive' },
        },
        select: { id: true },
      });
      if (byName) return byName.id;
    }

    return undefined;
  }

  private async resolveAdapter(tenantId: number, provider: LoadBoardProvider) {
    const vendorId = PROVIDER_TO_VENDOR[provider];
    if (!vendorId) {
      throw new BadRequestException(`Unsupported load board provider: ${provider}`);
    }

    const adapter = this.adapterFactory.getLoadBoardAdapter(vendorId);
    if (!adapter) {
      throw new BadRequestException(`No adapter available for ${vendorId}`);
    }

    // In mock mode, skip DB integration check — return empty credentials
    if (isMockModeFor('dat')) {
      this.logger.debug(`[MOCK] Skipping integration config lookup for ${vendorId}`);
      return { adapter, credentials: {} as Record<string, string> };
    }

    const integration = await this.prisma.integrationConfig.findFirst({
      where: {
        tenantId,
        vendor: vendorId as IntegrationVendor,
        isEnabled: true,
      },
    });

    if (!integration) {
      throw new NotFoundException(
        `No active ${provider.toUpperCase()} integration found. Connect it in Settings → Integrations.`,
      );
    }

    const credentials = this.authTokenService.decryptCredentials(integration.credentials);

    return { adapter, credentials };
  }
}
