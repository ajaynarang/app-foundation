import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { CreateSavedSearchDto } from '../dto/create-saved-search.dto';

@Injectable()
export class SavedSearchService {
  private readonly logger = new Logger(SavedSearchService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: number, userId: number, dto: CreateSavedSearchDto) {
    const saved = await this.prisma.loadBoardSavedSearch.create({
      data: {
        tenantId,
        userId,
        name: dto.name,
        searchParams: dto.searchParams as any,
        minRate: dto.minRate ?? null,
      },
    });

    this.logger.log(`Created saved search "${dto.name}" (${saved.savedSearchId}) for user ${userId}`);

    return this.toResponse(saved);
  }

  async findAllForUser(tenantId: number, userId: number) {
    const searches = await this.prisma.loadBoardSavedSearch.findMany({
      where: { tenantId, userId },
      orderBy: { createdAt: 'desc' },
    });

    return searches.map((s) => this.toResponse(s));
  }

  async toggleActive(tenantId: number, userId: number, savedSearchId: string) {
    const search = await this.findAndAuthorize(tenantId, userId, savedSearchId);

    const updated = await this.prisma.loadBoardSavedSearch.update({
      where: { id: search.id },
      data: { isActive: !search.isActive },
    });

    this.logger.log(`Toggled saved search "${search.name}" active=${updated.isActive}`);

    return this.toResponse(updated);
  }

  async delete(tenantId: number, userId: number, savedSearchId: string) {
    const search = await this.findAndAuthorize(tenantId, userId, savedSearchId);

    await this.prisma.loadBoardSavedSearch.delete({
      where: { id: search.id },
    });

    this.logger.log(`Deleted saved search "${search.name}" (${savedSearchId})`);
  }

  async findAllActive() {
    return this.prisma.loadBoardSavedSearch.findMany({
      where: { isActive: true },
      include: { user: { select: { userId: true } } },
    });
  }

  async updatePolled(id: number, matchCount: number, seenIds: string[]) {
    await this.prisma.loadBoardSavedSearch.update({
      where: { id },
      data: {
        lastPolledAt: new Date(),
        lastMatchCount: matchCount,
        lastSeenIds: seenIds,
      },
    });
  }

  private async findAndAuthorize(tenantId: number, userId: number, savedSearchId: string) {
    const search = await this.prisma.loadBoardSavedSearch.findUnique({
      where: { savedSearchId },
    });

    if (!search || search.tenantId !== tenantId) {
      throw new NotFoundException('Saved search not found');
    }

    if (search.userId !== userId) {
      throw new ForbiddenException('Not authorized to modify this saved search');
    }

    return search;
  }

  private toResponse(search: any) {
    return {
      savedSearchId: search.savedSearchId,
      name: search.name,
      searchParams: search.searchParams,
      isActive: search.isActive,
      minRate: search.minRate,
      lastPolledAt: search.lastPolledAt,
      lastMatchCount: search.lastMatchCount,
      createdAt: search.createdAt,
      updatedAt: search.updatedAt,
    };
  }
}
