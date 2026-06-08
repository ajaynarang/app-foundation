import { Inject, Injectable, Logger, NotFoundException, forwardRef } from '@nestjs/common';
import { generateText } from 'ai';
import { FeedbackStatusEnum } from '@app/shared-types';
import { ai } from '../../ai/infrastructure/providers/ai-provider';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { PromptingService, PROMPT_NAMES } from '../../../domains/prompting';
import { CreateFeedbackDto, ResolveFeedbackDto, UpdateStatusDto, UpdateCategoryDto, ListFeedbackQueryDto } from './dto';

const VALID_CATEGORIES = ['bug', 'idea', 'general'];
const FEEDBACK_STATUS = FeedbackStatusEnum.enum;

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => PromptingService))
    private readonly promptService: PromptingService,
  ) {}

  async create(userId: number, tenantId: number, dto: CreateFeedbackDto) {
    return this.prisma.feedback.create({
      data: {
        userId,
        tenantId,
        sentiment: dto.sentiment,
        message: dto.message,
        page: dto.page,
      },
    });
  }

  async listOwn(userId: number, tenantId: number) {
    return this.prisma.feedback.findMany({
      where: { userId, tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        category: true,
        sentiment: true,
        message: true,
        page: true,
        status: true,
        createdAt: true,
      },
    });
  }

  async listAll(query: ListFeedbackQueryDto) {
    const where: Record<string, unknown> = {};

    if (query.status) where.status = query.status;
    if (query.category === 'uncategorized') {
      where.category = null;
    } else if (query.category) {
      where.category = query.category;
    }
    if (query.tenantId) where.tenantId = query.tenantId;
    if (query.sentimentMin || query.sentimentMax) {
      const sentiment: Record<string, number> = {};
      if (query.sentimentMin) sentiment.gte = query.sentimentMin;
      if (query.sentimentMax) sentiment.lte = query.sentimentMax;
      where.sentiment = sentiment;
    }
    if (query.from || query.to) {
      const createdAt: Record<string, Date> = {};
      if (query.from) createdAt.gte = new Date(query.from);
      if (query.to) createdAt.lte = new Date(query.to);
      where.createdAt = createdAt;
    }

    const page = query.page || 1;
    const limit = query.limit || 20;

    const [data, total] = await Promise.all([
      this.prisma.feedback.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              role: true,
            },
          },
          tenant: {
            select: {
              id: true,
              companyName: true,
            },
          },
          resolver: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      this.prisma.feedback.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async getDetail(id: number) {
    const feedback = await this.prisma.feedback.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            role: true,
          },
        },
        tenant: {
          select: {
            id: true,
            companyName: true,
          },
        },
        resolver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!feedback) throw new NotFoundException('Feedback not found');
    return feedback;
  }

  async resolve(id: number, adminUserId: number, dto: ResolveFeedbackDto) {
    const feedback = await this.prisma.feedback.findUnique({ where: { id } });
    if (!feedback) throw new NotFoundException('Feedback not found');

    return this.prisma.feedback.update({
      where: { id },
      data: {
        status: FEEDBACK_STATUS.RESOLVED,
        note: dto.note,
        resolvedBy: adminUserId,
        resolvedAt: new Date(),
      },
    });
  }

  async updateStatus(id: number, dto: UpdateStatusDto) {
    const feedback = await this.prisma.feedback.findUnique({ where: { id } });
    if (!feedback) throw new NotFoundException('Feedback not found');

    return this.prisma.feedback.update({
      where: { id },
      data: { status: dto.status },
    });
  }

  async updateCategory(id: number, dto: UpdateCategoryDto) {
    const feedback = await this.prisma.feedback.findUnique({ where: { id } });
    if (!feedback) throw new NotFoundException('Feedback not found');

    return this.prisma.feedback.update({
      where: { id },
      data: { category: dto.category },
    });
  }

  async categorizeWithAi(id: number) {
    const feedback = await this.prisma.feedback.findUnique({ where: { id } });
    if (!feedback) throw new NotFoundException('Feedback not found');

    const category = await this.inferCategory(feedback.message);

    return this.prisma.feedback.update({
      where: { id },
      data: { category },
    });
  }

  async bulkCategorize() {
    const uncategorized = await this.prisma.feedback.findMany({
      where: { category: null },
      select: { id: true, message: true },
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
        this.logger.warn(`Failed to categorize feedback #${fb.id}: ${error}`);
      }
    }

    return { categorized, total: uncategorized.length };
  }

  async getTenants() {
    const tenants = await this.prisma.feedback.findMany({
      select: {
        tenant: { select: { id: true, companyName: true } },
      },
      distinct: ['tenantId'],
    });
    return tenants.map((f) => f.tenant);
  }

  private async inferCategory(message: string, cachedPrompt?: string): Promise<string> {
    const systemPrompt = cachedPrompt ?? (await this.promptService.getPrompt(PROMPT_NAMES.FEEDBACK_CATEGORIZER));

    const { text } = await generateText({
      model: ai('fast'),
      system: systemPrompt,
      prompt: message,
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
