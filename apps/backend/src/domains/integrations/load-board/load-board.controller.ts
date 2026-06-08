import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Request,
  Query,
  Logger,
  NotFoundException,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { LoadBoardService } from './load-board.service';
import { LoadBoardRecommendationsService } from './recommendations/load-board-recommendations.service';
import { SavedSearchService } from './saved-search/saved-search.service';
import { SearchLoadsDto } from './dto/search-loads.dto';
import { NlpSearchDto } from './dto/nlp-search.dto';
import { ImportLoadDto } from './dto/import-load.dto';
import { CreateSavedSearchDto } from './dto/create-saved-search.dto';
import { SearchHistoryService } from './services/search-history.service';
import type { LoadBoardSearchParams } from '@sally/shared-types';

@Controller('load-board')
@UseGuards(JwtAuthGuard)
export class LoadBoardController {
  private readonly logger = new Logger(LoadBoardController.name);

  constructor(
    private readonly loadBoardService: LoadBoardService,
    private readonly loadBoardRecommendationsService: LoadBoardRecommendationsService,
    private readonly savedSearchService: SavedSearchService,
    private readonly searchHistoryService: SearchHistoryService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('search')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  async search(@Request() req: any, @Body() dto: SearchLoadsDto) {
    const tenant = await this.getTenant(req);
    const result = await this.loadBoardService.search(tenant.id, dto as unknown as LoadBoardSearchParams);

    // Log search to history (non-blocking)
    const userId = await this.getUserDbId(req);
    this.searchHistoryService
      .logSearch(userId, dto as unknown as LoadBoardSearchParams)
      .catch((err) => this.logger.warn(`Failed to log search history: ${err.message}`));

    return result;
  }

  @Post('search/nlp')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  async searchNlp(@Request() req: any, @Body() dto: NlpSearchDto) {
    const tenant = await this.getTenant(req);
    const result = await this.loadBoardService.searchNlp(tenant.id, dto.query);

    // Log the resolved search to history (non-blocking)
    // NLP resolves to structured params internally — we log the result
    if (result.listings.length > 0 && result.listings[0]) {
      const firstListing = result.listings[0];
      const userId = await this.getUserDbId(req);
      this.searchHistoryService
        .logSearch(userId, {
          origin: {
            city: firstListing.origin.city,
            state: firstListing.origin.state,
            radius: 50,
          },
          destination: firstListing.destination
            ? {
                city: firstListing.destination.city,
                state: firstListing.destination.state,
                radius: 50,
              }
            : undefined,
          provider: 'dat',
          page: 1,
          limit: 25,
        } as LoadBoardSearchParams)
        .catch((err) => this.logger.warn(`Failed to log NLP search history: ${err.message}`));
    }

    return result;
  }

  @Get('listings/:externalId')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  async getListingDetail(
    @Request() req: any,
    @Param('externalId') externalId: string,
    @Query('provider') provider: string = 'dat',
  ) {
    const tenant = await this.getTenant(req);
    return this.loadBoardService.getListingDetail(tenant.id, provider as any, externalId);
  }

  @Get('recommendations')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  async getRecommendations(@Request() req: any) {
    const tenant = await this.getTenant(req);
    return this.loadBoardRecommendationsService.getRecommendations(tenant.id);
  }

  @Post('import')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  async importLoad(@Request() req: any, @Body() dto: ImportLoadDto) {
    const tenant = await this.getTenant(req);
    return this.loadBoardService.importListing(tenant.id, dto.provider as any, dto.externalId);
  }

  // ── Search History ──

  @Get('search-history')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  async getSearchHistory(@Request() req: any, @Query('q') query?: string) {
    const userId = await this.getUserDbId(req);
    return this.searchHistoryService.getHistory(userId, query);
  }

  @Delete('search-history')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  async clearSearchHistory(@Request() req: any) {
    const userId = await this.getUserDbId(req);
    await this.searchHistoryService.clearHistory(userId);
  }

  // ── Saved Searches ──

  @Post('saved-searches')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  async createSavedSearch(@Request() req: any, @Body() dto: CreateSavedSearchDto) {
    const tenant = await this.getTenant(req);
    const userId = await this.getUserDbId(req);
    return this.savedSearchService.create(tenant.id, userId, dto);
  }

  @Get('saved-searches')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  async listSavedSearches(@Request() req: any) {
    const tenant = await this.getTenant(req);
    const userId = await this.getUserDbId(req);
    return this.savedSearchService.findAllForUser(tenant.id, userId);
  }

  @Patch('saved-searches/:savedSearchId/toggle')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  async toggleSavedSearch(@Request() req: any, @Param('savedSearchId') savedSearchId: string) {
    const tenant = await this.getTenant(req);
    const userId = await this.getUserDbId(req);
    return this.savedSearchService.toggleActive(tenant.id, userId, savedSearchId);
  }

  @Delete('saved-searches/:savedSearchId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  async deleteSavedSearch(@Request() req: any, @Param('savedSearchId') savedSearchId: string) {
    const tenant = await this.getTenant(req);
    const userId = await this.getUserDbId(req);
    await this.savedSearchService.delete(tenant.id, userId, savedSearchId);
  }

  private async getUserDbId(req: any): Promise<number> {
    if (req.user.dbId) return req.user.dbId;
    const user = await this.prisma.user.findFirst({
      where: { userId: req.user.userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user.id;
  }

  private async getTenant(req: any) {
    if (req.user.tenantDbId) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: req.user.tenantDbId },
      });
      if (!tenant) throw new NotFoundException('Tenant not found');
      return tenant;
    }
    const tenant = await this.prisma.tenant.findFirst({
      where: { users: { some: { userId: req.user.userId } } },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }
}
