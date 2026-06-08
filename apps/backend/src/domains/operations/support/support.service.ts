import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { CreateMessageDto } from './dto/create-message.dto';

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Atomic ticket number generation using Postgres sequence.
   * Avoids race conditions from read-then-write patterns.
   */
  private async generateTicketNumber(): Promise<string> {
    // Create sequence on first use (idempotent via IF NOT EXISTS)
    await this.prisma.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS support_ticket_seq START WITH 1001`);
    const result: Array<{ nextval: string }> = await this.prisma.$queryRawUnsafe(
      `SELECT nextval('support_ticket_seq')::text`,
    );
    return `ST-${result[0].nextval}`;
  }

  // ─── Tenant endpoints ───

  async createTicket(tenantId: number, userId: number, dto: CreateTicketDto) {
    const ticketNumber = await this.generateTicketNumber();

    const ticket = await this.prisma.supportTicket.create({
      data: {
        ticketNumber,
        tenantId,
        createdById: userId,
        subject: dto.subject,
        description: dto.description,
        category: (dto.category as any) ?? 'GENERAL',
        priority: (dto.priority as any) ?? 'MEDIUM',
        conversationId: dto.conversationId ?? null,
        relatedEntities: dto.relatedEntities ? (dto.relatedEntities as any) : undefined,
      },
      include: {
        createdBy: {
          select: {
            userId: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
      },
    });

    this.logger.log(`Ticket ${ticketNumber} created by user ${userId} for tenant ${tenantId}`);
    return this.mapTicketResponse(ticket);
  }

  async listTicketsForTenant(tenantId: number, params: { status?: string; limit?: number; offset?: number }) {
    const where: any = { tenantId };
    if (params.status) where.status = params.status;

    const [tickets, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: params.limit ?? 50,
        skip: params.offset ?? 0,
        include: {
          createdBy: {
            select: {
              userId: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
            },
          },
          _count: { select: { messages: true } },
        },
      }),
      this.prisma.supportTicket.count({ where }),
    ]);

    return {
      tickets: tickets.map((t) => this.mapTicketResponse(t)),
      total,
      limit: params.limit ?? 50,
      offset: params.offset ?? 0,
    };
  }

  async getTicket(ticketId: number, tenantId: number, isSuperAdmin = false) {
    const where: any = { id: ticketId };
    if (!isSuperAdmin) where.tenantId = tenantId;

    const ticket = await this.prisma.supportTicket.findFirst({
      where,
      include: {
        createdBy: {
          select: {
            userId: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
        tenant: {
          select: { tenantId: true, companyName: true, plan: true },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            author: {
              select: {
                userId: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
              },
            },
          },
        },
        conversation: {
          select: {
            conversationId: true,
            messages: {
              orderBy: { createdAt: 'asc' },
              take: 50,
              select: { role: true, content: true, createdAt: true },
            },
          },
        },
      },
    });

    if (!ticket) throw new NotFoundException('Ticket not found');

    // Filter internal notes for non-admin requests
    const messages = isSuperAdmin ? ticket.messages : ticket.messages.filter((m: any) => !m.isInternal);

    return this.mapTicketDetailResponse({ ...ticket, messages });
  }

  async addMessage(
    ticketId: number,
    authorId: number,
    authorRole: string,
    dto: CreateMessageDto,
    tenantId: number,
    isSuperAdmin = false,
  ) {
    const where: any = { id: ticketId };
    if (!isSuperAdmin) where.tenantId = tenantId;

    const ticket = await this.prisma.supportTicket.findFirst({
      where,
      select: { id: true, firstResponseAt: true },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    // Track first response time for admin replies
    const isAdminReply = authorRole === 'admin';
    const shouldTrackResponse = isAdminReply && !ticket.firstResponseAt;

    const message = await this.prisma.supportTicketMessage.create({
      data: {
        ticketId,
        authorId,
        authorRole,
        content: dto.content,
        isInternal: dto.isInternal ?? false,
      },
      include: {
        author: {
          select: {
            userId: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
      },
    });

    if (shouldTrackResponse) {
      await this.prisma.supportTicket.update({
        where: { id: ticketId },
        data: { firstResponseAt: new Date() },
      });
    }

    return {
      messageId: message.messageId,
      ticketId: message.ticketId,
      authorRole: message.authorRole,
      content: message.content,
      isInternal: message.isInternal,
      author: message.author,
      createdAt: message.createdAt,
    };
  }

  // ─── Super Admin endpoints ───

  async listAllTickets(params: {
    tenantId?: number;
    status?: string;
    priority?: string;
    category?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) {
    const where: any = {};
    if (params.tenantId) where.tenantId = params.tenantId;
    if (params.status) where.status = params.status;
    if (params.priority) where.priority = params.priority;
    if (params.category) where.category = params.category;
    if (params.search) {
      where.OR = [
        { subject: { contains: params.search, mode: 'insensitive' } },
        { ticketNumber: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [tickets, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        orderBy: [{ status: 'asc' }, { priority: 'asc' }, { createdAt: 'desc' }],
        take: params.limit ?? 50,
        skip: params.offset ?? 0,
        include: {
          createdBy: {
            select: {
              userId: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
            },
          },
          tenant: {
            select: { tenantId: true, companyName: true, plan: true },
          },
          _count: { select: { messages: true } },
        },
      }),
      this.prisma.supportTicket.count({ where }),
    ]);

    return {
      tickets: tickets.map((t) => this.mapTicketResponse(t)),
      total,
      limit: params.limit ?? 50,
      offset: params.offset ?? 0,
    };
  }

  async updateTicket(ticketId: number, dto: UpdateTicketDto) {
    const data: any = {};
    if (dto.status) {
      data.status = dto.status;
      if (dto.status === 'RESOLVED') data.resolvedAt = new Date();
      if (dto.status === 'CLOSED') data.closedAt = new Date();
    }
    if (dto.priority) data.priority = dto.priority;
    if (dto.category) data.category = dto.category;

    const ticket = await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data,
      include: {
        createdBy: {
          select: {
            userId: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
        tenant: {
          select: { tenantId: true, companyName: true, plan: true },
        },
      },
    });

    return this.mapTicketResponse(ticket);
  }

  async getStats() {
    const [open, inProgress, waiting, resolvedLast30d] = await Promise.all([
      this.prisma.supportTicket.count({ where: { status: 'OPEN' } }),
      this.prisma.supportTicket.count({ where: { status: 'IN_PROGRESS' } }),
      this.prisma.supportTicket.count({
        where: { status: 'WAITING_ON_CUSTOMER' },
      }),
      this.prisma.supportTicket.count({
        where: {
          status: { in: ['RESOLVED', 'CLOSED'] },
          resolvedAt: { gte: new Date(Date.now() - 30 * 86400000) },
        },
      }),
    ]);

    // Compute average response time in SQL to avoid loading all rows into memory
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const avgResult: Array<{ avg_hours: number | null }> = await this.prisma.$queryRawUnsafe(
      `SELECT ROUND(AVG(EXTRACT(EPOCH FROM (first_response_at - created_at)) / 3600)::numeric, 1) as avg_hours
         FROM support_tickets
         WHERE first_response_at IS NOT NULL AND created_at >= $1`,
      thirtyDaysAgo,
    );
    const avgResponseHours = avgResult[0]?.avg_hours ?? 0;

    return { open, inProgress, waiting, resolvedLast30d, avgResponseHours };
  }

  async getTenants() {
    const tenants = await this.prisma.supportTicket.findMany({
      select: { tenant: { select: { id: true, companyName: true } } },
      distinct: ['tenantId'],
      orderBy: { tenant: { companyName: 'asc' } },
    });
    return tenants.map((t) => t.tenant);
  }

  // ─── Mappers ───

  private mapTicketResponse(ticket: any) {
    return {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      description: ticket.description,
      category: ticket.category,
      priority: ticket.priority,
      status: ticket.status,
      aiResolved: ticket.aiResolved,
      relatedEntities: ticket.relatedEntities,
      createdBy: ticket.createdBy,
      tenant: ticket.tenant ?? undefined,
      messageCount: ticket._count?.messages ?? 0,
      firstResponseAt: ticket.firstResponseAt,
      resolvedAt: ticket.resolvedAt,
      closedAt: ticket.closedAt,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
    };
  }

  private mapTicketDetailResponse(ticket: any) {
    return {
      ...this.mapTicketResponse(ticket),
      messages: ticket.messages.map((m: any) => ({
        messageId: m.messageId,
        authorRole: m.authorRole,
        content: m.content,
        isInternal: m.isInternal,
        author: m.author,
        createdAt: m.createdAt,
      })),
      conversation: ticket.conversation
        ? {
            conversationId: ticket.conversation.conversationId,
            messages: ticket.conversation.messages,
          }
        : null,
    };
  }
}
