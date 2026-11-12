import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { CursorList } from '@app/shared-types';
import {
  buildCursorPage,
  clampCursorLimit,
  encodeCursor,
  keysetWhere,
} from '@appshore/kernel/shared/utils/cursor-pagination';
import { AnnouncementStatus } from '@appshore/db';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AppCacheService } from '../../infrastructure/cache/app-cache.service';
import { buildKey } from '@appshore/kernel/infrastructure/cache/cache-key.constants';
import { CACHE_TTL_COLD_30M } from '@appshore/kernel/constants/cache.constants';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import {
  ACTIVE_BROADCAST_CAP,
  ACTIVE_BROADCAST_SCAN_CAP,
  BROADCAST_AUTHOR_SELECT,
  toPublicBroadcast,
  type BroadcastResponse,
} from './broadcast.serializer';

const CREATED_BY_SELECT = BROADCAST_AUTHOR_SELECT;
const BROADCAST_KEYSET = { field: 'createdAt', idField: 'publicId', kind: 'date', direction: 'desc' } as const;

export interface BroadcastListQuery {
  status?: AnnouncementStatus;
  cursor?: string;
  limit?: string | number;
}
const WITH_AUTHOR = { createdBy: { select: CREATED_BY_SELECT } } as const;

@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AppCacheService,
  ) {}

  /** Newest first, cursor-paged: a log of hand-written broadcasts, no status pivot. */
  async findAll(query: BroadcastListQuery = {}): Promise<CursorList<BroadcastResponse>> {
    const take = clampCursorLimit(query.limit);
    const scope = query.status ? { status: query.status } : {};
    const where = query.cursor ? { AND: [scope, keysetWhere({ ...BROADCAST_KEYSET, cursor: query.cursor })] } : scope;
    const [rows, total] = await Promise.all([
      this.prisma.announcement.findMany({
        where,
        include: WITH_AUTHOR,
        orderBy: [{ createdAt: 'desc' }, { publicId: 'desc' }],
        take: take + 1,
      }),
      this.prisma.announcement.count({ where: scope }),
    ]);
    const page = buildCursorPage(rows, take, (row) => encodeCursor(row.createdAt, row.publicId));
    return { items: page.items.map(toPublicBroadcast), nextCursor: page.nextCursor, total };
  }

  async findOne(publicId: string): Promise<BroadcastResponse> {
    const row = await this.prisma.announcement.findFirst({ where: { publicId }, include: WITH_AUTHOR });
    if (!row) throw new NotFoundException('Broadcast not found');
    return toPublicBroadcast(row);
  }

  /** Public id → PK for a write; a missing broadcast is a 404, never a Prisma P2025. */
  private async resolveId(publicId: string): Promise<number> {
    const row = await this.prisma.announcement.findFirst({ where: { publicId }, select: { id: true } });
    if (!row) throw new NotFoundException('Broadcast not found');
    return row.id;
  }

  private async invalidateAnnouncementCache(): Promise<void> {
    // Announcements target ALL tenants, so use a global key
    await this.cache.del(buildKey('app:announcements', 'active', 'global'));
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
      include: WITH_AUTHOR,
    });
    await this.invalidateAnnouncementCache();
    return toPublicBroadcast(result);
  }

  async update(publicId: string, dto: UpdateAnnouncementDto) {
    const id = await this.resolveId(publicId);
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
      include: WITH_AUTHOR,
    });
    await this.invalidateAnnouncementCache();
    return toPublicBroadcast(result);
  }

  async publish(publicId: string) {
    const id = await this.resolveId(publicId);
    const result = await this.prisma.announcement.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
      include: WITH_AUTHOR,
    });
    await this.invalidateAnnouncementCache();
    return toPublicBroadcast(result);
  }

  async archive(publicId: string) {
    const id = await this.resolveId(publicId);
    const result = await this.prisma.announcement.update({
      where: { id },
      data: { status: 'ARCHIVED' },
      include: WITH_AUTHOR,
    });
    await this.invalidateAnnouncementCache();
    return toPublicBroadcast(result);
  }

  async findActiveForTenant(tenantId: string, planSlug?: string) {
    // Use global key since announcements target all tenants and tenant-specific
    // filtering happens in the query. A per-tenant cache would require invalidating
    // all tenant keys on publish/archive which is impractical.
    const cacheKey = buildKey('app:announcements', 'active', 'global');
    const allActive = await this.cache.getOrSet(cacheKey, () => this.fetchAllActiveAnnouncements(), CACHE_TTL_COLD_30M);

    // Filter for this tenant in-memory, then cap what the banner shows (most urgent first)
    return allActive
      .filter((a: any) => {
        if (a.targetType === 'ALL') return true;
        if (a.targetType === 'TENANT' && a.targetIds?.includes(tenantId)) return true;
        if (planSlug && a.targetType === 'PLAN' && a.targetIds?.includes(planSlug)) return true;
        return false;
      })
      .slice(0, ACTIVE_BROADCAST_CAP);
  }

  async findActiveForAllOnly() {
    const cacheKey = buildKey('app:announcements', 'active', 'global');
    const allActive = await this.cache.getOrSet(cacheKey, () => this.fetchAllActiveAnnouncements(), CACHE_TTL_COLD_30M);

    return allActive.filter((a: any) => a.targetType === 'ALL').slice(0, ACTIVE_BROADCAST_CAP);
  }

  private async fetchAllActiveAnnouncements() {
    const now = new Date();
    const results = await this.prisma.announcement.findMany({
      where: {
        status: 'PUBLISHED',
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: [{ publishedAt: 'desc' }, { publicId: 'desc' }],
      take: ACTIVE_BROADCAST_SCAN_CAP,
      select: {
        publicId: true,
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
