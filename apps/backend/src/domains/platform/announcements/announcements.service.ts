import { Injectable, Logger } from '@nestjs/common';
import { AnnouncementStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { AppCacheService } from '../../../infrastructure/cache/app-cache.service';
import { buildKey } from '../../../infrastructure/cache/cache-key.constants';
import { CACHE_TTL_COLD_30M } from '../../../constants/cache.constants';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

const CREATED_BY_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} as const;

@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AppCacheService,
  ) {}

  async findAll(status?: AnnouncementStatus) {
    const where = status ? { status } : {};
    return this.prisma.announcement.findMany({
      where,
      include: { createdBy: { select: CREATED_BY_SELECT } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    return this.prisma.announcement.findUniqueOrThrow({
      where: { id },
      include: { createdBy: { select: CREATED_BY_SELECT } },
    });
  }

  private async invalidateAnnouncementCache(): Promise<void> {
    // Announcements target ALL tenants, so use a global key
    await this.cache.del(buildKey('sally:announcements', 'active', 'global'));
  }

  async create(dto: CreateAnnouncementDto, userId: number) {
    const result = await this.prisma.announcement.create({
      data: {
        title: dto.title,
        body: dto.body,
        targetType: dto.targetType || 'ALL',
        targetIds: dto.targetIds || [],
        priority: dto.priority || 'INFO',
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        createdById: userId,
      },
      include: { createdBy: { select: CREATED_BY_SELECT } },
    });
    await this.invalidateAnnouncementCache();
    return result;
  }

  async update(id: number, dto: UpdateAnnouncementDto) {
    const { title, body, targetType, targetIds, priority, expiresAt } = dto;
    const result = await this.prisma.announcement.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(body !== undefined && { body }),
        ...(targetType !== undefined && { targetType }),
        ...(targetIds !== undefined && { targetIds }),
        ...(priority !== undefined && { priority }),
        ...(expiresAt !== undefined && { expiresAt: new Date(expiresAt) }),
      },
      include: { createdBy: { select: CREATED_BY_SELECT } },
    });
    await this.invalidateAnnouncementCache();
    return result;
  }

  async publish(id: number) {
    const result = await this.prisma.announcement.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
    await this.invalidateAnnouncementCache();
    return result;
  }

  async archive(id: number) {
    const result = await this.prisma.announcement.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });
    await this.invalidateAnnouncementCache();
    return result;
  }

  async findActiveForTenant(tenantId: string, planSlug?: string) {
    // Use global key since announcements target all tenants and tenant-specific
    // filtering happens in the query. A per-tenant cache would require invalidating
    // all tenant keys on publish/archive which is impractical.
    const cacheKey = buildKey('sally:announcements', 'active', 'global');
    const allActive = await this.cache.getOrSet(cacheKey, () => this.fetchAllActiveAnnouncements(), CACHE_TTL_COLD_30M);

    // Filter for this tenant in-memory
    return allActive.filter((a: any) => {
      if (a.targetType === 'ALL') return true;
      if (a.targetType === 'TENANT' && a.targetIds?.includes(tenantId)) return true;
      if (planSlug && a.targetType === 'PLAN' && a.targetIds?.includes(planSlug)) return true;
      return false;
    });
  }

  async findActiveForAllOnly() {
    const cacheKey = buildKey('sally:announcements', 'active', 'global');
    const allActive = await this.cache.getOrSet(cacheKey, () => this.fetchAllActiveAnnouncements(), CACHE_TTL_COLD_30M);

    return allActive.filter((a: any) => a.targetType === 'ALL');
  }

  private async fetchAllActiveAnnouncements() {
    const now = new Date();
    const results = await this.prisma.announcement.findMany({
      where: {
        status: 'PUBLISHED',
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: [{ publishedAt: 'desc' }],
      select: {
        id: true,
        title: true,
        body: true,
        priority: true,
        publishedAt: true,
        expiresAt: true,
        targetType: true,
        targetIds: true,
      },
    });

    const priorityOrder: Record<string, number> = {
      CRITICAL: 0,
      WARNING: 1,
      INFO: 2,
    };
    results.sort((a, b) => (priorityOrder[a.priority] ?? 99) - (priorityOrder[b.priority] ?? 99));

    return results;
  }
}
