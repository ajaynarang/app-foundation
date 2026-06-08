import { Injectable, Logger } from '@nestjs/common';
import { Prisma, EDIDirection, EDIMessageType, EDIMessageStatus } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

export interface LogMessageParams {
  tenantId: number;
  tradingPartnerId: number;
  direction: EDIDirection;
  messageType: EDIMessageType;
  transactionSetId?: string;
  referenceNumber?: string;
  rawPayload?: string;
  parsedData?: Record<string, unknown>;
  loadId?: number;
  invoiceId?: number;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface ListMessagesParams {
  direction?: string;
  messageType?: string;
  status?: string;
  tradingPartnerId?: number;
  loadId?: number;
  page?: number;
  limit?: number;
}

@Injectable()
export class EDIMessageService {
  private readonly logger = new Logger(EDIMessageService.name);

  constructor(private readonly prisma: PrismaService) {}

  async logMessage(params: LogMessageParams) {
    return this.prisma.eDIMessage.create({
      data: {
        tenantId: params.tenantId,
        tradingPartnerId: params.tradingPartnerId,
        direction: params.direction,
        messageType: params.messageType,
        transactionSetId: params.transactionSetId,
        referenceNumber: params.referenceNumber,
        status: params.direction === 'INBOUND' ? EDIMessageStatus.RECEIVED : EDIMessageStatus.PROCESSING,
        rawPayload: params.rawPayload,
        parsedData: (params.parsedData as Prisma.InputJsonValue) ?? undefined,
        loadId: params.loadId,
        invoiceId: params.invoiceId,
        expiresAt: params.expiresAt,
        metadata: (params.metadata as Prisma.InputJsonValue) ?? undefined,
      },
    });
  }

  async updateStatus(messageId: number, status: EDIMessageStatus, errorMessage?: string) {
    return this.prisma.eDIMessage.update({
      where: { id: messageId },
      data: {
        status: status,
        ...(errorMessage ? { errorMessage, retryCount: { increment: 1 } } : {}),
      },
    });
  }

  async markResponded(messageId: number) {
    return this.prisma.eDIMessage.update({
      where: { id: messageId },
      data: { respondedAt: new Date() },
    });
  }

  async listMessages(tenantId: number, params: ListMessagesParams = {}) {
    const { direction, messageType, status, tradingPartnerId, loadId, page = 1, limit = 50 } = params;
    const where: any = { tenantId };
    if (direction) where.direction = direction;
    if (messageType) where.messageType = messageType;
    if (status) where.status = status;
    if (tradingPartnerId) where.tradingPartnerId = tradingPartnerId;
    if (loadId) where.loadId = loadId;

    const [data, total] = await Promise.all([
      this.prisma.eDIMessage.findMany({
        where,
        include: {
          tradingPartner: { select: { name: true } },
          load: { select: { loadNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.eDIMessage.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findPendingTenders(tenantId: number) {
    return this.prisma.eDIMessage.findMany({
      where: {
        tenantId,
        messageType: EDIMessageType.T204,
        status: EDIMessageStatus.RECEIVED,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: { tradingPartner: true, load: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
