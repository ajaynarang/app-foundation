import { Inject, Injectable, Logger, NotFoundException, forwardRef } from '@nestjs/common';
import { generateText } from 'ai';
import { Prisma } from '@appshore/db';
import { FeedbackStatusEnum, type CursorList, type FeedbackStatus } from '@app/shared-types';
import {
  buildCursorPage,
  clampCursorLimit,
  encodeCursor,
  keysetWhere,
  pivotCounts,
} from '@appshore/kernel/shared/utils/cursor-pagination';
import { FEEDBACK_ADMIN_INCLUDE, toPublicFeedback, type PublicFeedback } from './feedback.serializer';
import { listTenantOptions, type TenantOption, type TenantOptionQuery } from '../../shared/lists/tenant-options';
import { ai } from '../ai/infrastructure/providers/ai-provider';
import { OUTPUT_CEILINGS } from '../ai/routing/output-ceilings';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { PromptingService, PROMPT_NAMES } from '../prompting';
import { CreateFeedbackDto, ResolveFeedbackDto, UpdateStatusDto, UpdateCategoryDto, ListFeedbackQueryDto } from './dto';

const VALID_CATEGORIES = ['bug', 'idea', 'general'];
/** One category word (plus the model's thinking). */
export const FEEDBACK_CATEGORY_MAX_OUTPUT_TOKENS = OUTPUT_CEILINGS.WORD;
const FEEDBACK_STATUS = FeedbackStatusEnum.enum;
const FEEDBACK_STATUSES = FeedbackStatusEnum.options;

/** Newest first; the public id (uuid) is the tiebreak. The Int key never goes in a cursor. */
const FEEDBACK_KEYSET = { field: 'createdAt', idField: 'publicId', kind: 'date', direction: 'desc' } as const;
const NEWEST_FIRST = [
  { createdAt: 'desc' },
  { publicId: 'desc' },
] as const satisfies Prisma.FeedbackOrderByWithRelationInput[];

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => PromptingService))
    private readonly promptService: PromptingService,
  ) {}

  async create(userId: number, tenantId: number, dto: CreateFeedbackDto): Promise<PublicFeedback> {
    const row = await this.prisma.feedback.create({
      data: {
        userId,
        tenantId,
        sentiment: dto.sentiment,
        message: dto.message,
        page: dto.page,
      },
    });
    return toPublicFeedback(row);
  }

  /** The caller's own feedback in this workspace, newest first, as a cursor list. */
  async listOwn(
    userId: number,
    tenantId: number,
    query: { limit?: number; cursor?: string } = {},
  ): Promise<CursorList<PublicFeedback>> {
    const take = clampCursorLimit(query.limit);
    // Decoded before any query runs: a malformed cursor is a 400 and costs nothing.
    const keyset = query.cursor ? keysetWhere({ ...FEEDBACK_KEYSET, cursor: query.cursor }) : undefined;
    const where: Prisma.FeedbackWhereInput = { userId, tenantId };
    const [rows, total] = await Promise.all([
      this.prisma.feedback.findMany({
        where: keyset ? { AND: [where, keyset] } : where,
        orderBy: [...NEWEST_FIRST],
        take: take + 1,
      }),
      this.prisma.feedback.count({ where }),
    ]);
    const page = buildCursorPage(rows, take, (row) => encodeCursor(row.createdAt, row.publicId));
    return { items: page.items.map(toPublicFeedback), nextCursor: page.nextCursor, total };
  }

  /**
   * Every tenant's feedback (super admin), newest first, with a status pivot: `counts` holds every status for
   * the current filters, ignoring the status filter; `total` counts the status in view.
   */
  async listAll(query: ListFeedbackQueryDto = {}): Promise<CursorList<PublicFeedback, FeedbackStatus>> {
    const take = clampCursorLimit(query.limit);
    // Decoded before any query runs: a malformed cursor is a 400 and costs nothing.
    const keyset = query.cursor ? keysetWhere({ ...FEEDBACK_KEYSET, cursor: query.cursor }) : undefined;
    const scope: Prisma.FeedbackWhereInput = {};
    if (query.category === 'uncategorized') {
      scope.category = null;
    } else if (query.category) {
      scope.category = query.category;
    }
    if (query.tenantId) scope.tenantId = query.tenantId;
    if (query.sentimentMin || query.sentimentMax) {
      scope.sentiment = {
        ...(query.sentimentMin ? { gte: query.sentimentMin } : {}),
        ...(query.sentimentMax ? { lte: query.sentimentMax } : {}),
      };
    }
    if (query.from || query.to) {
      scope.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }
    const view: Prisma.FeedbackWhereInput = query.status ? { AND: [scope, { status: query.status }] } : scope;

    const [rows, grouped] = await Promise.all([
      this.prisma.feedback.findMany({
        where: keyset ? { AND: [view, keyset] } : view,
        orderBy: [...NEWEST_FIRST],
        take: take + 1,
        include: FEEDBACK_ADMIN_INCLUDE,
      }),
      this.prisma.feedback.groupBy({ by: ['status'], where: scope, _count: { _all: true } }),
    ]);
    const { counts, total } = pivotCounts(
      grouped.map((row) => ({ key: row.status, count: row._count._all })),
      FEEDBACK_STATUSES,
      query.status ? [query.status] : undefined,
    );
    const page = buildCursorPage(rows, take, (row) => encodeCursor(row.createdAt, row.publicId));
    return { items: page.items.map(toPublicFeedback), nextCursor: page.nextCursor, total, counts };
  }

  async getDetail(feedbackId: string): Promise<PublicFeedback> {
    const feedback = await this.prisma.feedback.findUnique({
      where: { publicId: feedbackId },
      include: FEEDBACK_ADMIN_INCLUDE,
    });
    if (!feedback) throw new NotFoundException('Feedback not found');
    return toPublicFeedback(feedback);
  }

  async resolve(feedbackId: string, adminUserId: number, dto: ResolveFeedbackDto): Promise<PublicFeedback> {
    const feedback = await this.findRow(feedbackId);
    return this.save(feedback.id, {
      status: FEEDBACK_STATUS.RESOLVED,
      note: dto.note,
      resolvedBy: adminUserId,
      resolvedAt: new Date(),
    });
  }

  async updateStatus(feedbackId: string, dto: UpdateStatusDto): Promise<PublicFeedback> {
    const feedback = await this.findRow(feedbackId);
    return this.save(feedback.id, { status: dto.status });
  }

  async updateCategory(feedbackId: string, dto: UpdateCategoryDto): Promise<PublicFeedback> {
    const feedback = await this.findRow(feedbackId);
    return this.save(feedback.id, { category: dto.category });
  }

  async categorizeWithAi(feedbackId: string): Promise<PublicFeedback> {
    const feedback = await this.findRow(feedbackId);
    const category = await this.inferCategory(feedback.message);
    return this.save(feedback.id, { category });
  }

  /** Public id → the row (a 404 when unknown). Admin routes are super-admin and cross-tenant by design. */
  private async findRow(feedbackId: string) {
    const feedback = await this.prisma.feedback.findUnique({ where: { publicId: feedbackId } });
    if (!feedback) throw new NotFoundException('Feedback not found');
    return feedback;
  }

  private async save(id: number, data: Prisma.FeedbackUncheckedUpdateInput): Promise<PublicFeedback> {
    const row = await this.prisma.feedback.update({ where: { id }, data, include: FEEDBACK_ADMIN_INCLUDE });
    return toPublicFeedback(row);
  }

  async bulkCategorize() {
    const uncategorized = await this.prisma.feedback.findMany({
      where: { category: null },
      select: { id: true, publicId: true, message: true },
    });

    if (uncategorized.length === 0) {
      return { categorized: 0 };
    }

    const systemPrompt = await this.promptService.getPrompt(PROMPT_NAMES.FEEDBACK_CATEGORIZER);

    let categorized = 0;
    for (const fb of uncategorized) {
      try {
        const category = await this.inferCategory(fb.message, systemPrompt);
        await this.prisma.feedback.update({
          where: { id: fb.id },
          data: { category },
        });
        categorized++;
      } catch (error) {
        this.logger.warn(`Failed to categorize feedback ${fb.publicId}: ${error}`);
      }
    }

    return { categorized, total: uncategorized.length };
  }

  /** Tenants that have submitted feedback, by company name: the rows behind the admin tenant filter (a picker). */
  async getTenants(query: TenantOptionQuery = {}): Promise<CursorList<TenantOption>> {
    return listTenantOptions(this.prisma, { feedback: { some: {} } }, query);
  }

  private async inferCategory(message: string, cachedPrompt?: string): Promise<string> {
    const systemPrompt = cachedPrompt ?? (await this.promptService.getPrompt(PROMPT_NAMES.FEEDBACK_CATEGORIZER));

    const { text } = await generateText({
      model: ai('fast'),
      system: systemPrompt,
      prompt: message,
      maxOutputTokens: FEEDBACK_CATEGORY_MAX_OUTPUT_TOKENS,
    });

    const parsed = text.trim().toLowerCase();
    return VALID_CATEGORIES.includes(parsed) ? parsed : 'general';
  }

  async getStats() {
    const [total, byStatus, bySentiment] = await Promise.all([
      this.prisma.feedback.count(),
      this.prisma.feedback.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      this.prisma.feedback.groupBy({
        by: ['sentiment'],
        _count: { id: true },
      }),
    ]);

    const statusCounts: Record<string, number> = {
      [FEEDBACK_STATUS.NEW]: 0,
      [FEEDBACK_STATUS.REVIEWED]: 0,
      [FEEDBACK_STATUS.RESOLVED]: 0,
    };
    byStatus.forEach((s) => {
      statusCounts[s.status] = s._count.id;
    });

    return {
      total,
      ...statusCounts,
      bySentiment: bySentiment.map((s) => ({
        sentiment: s.sentiment,
        count: s._count.id,
      })),
    };
  }
}
