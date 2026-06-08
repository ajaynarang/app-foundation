import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma, EDIVanProvider, EDIStatusUpdateLevel, EDIMessageType } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

import { IsString, IsOptional, IsObject, IsArray, IsBoolean } from 'class-validator';

export class CreatePartnerDto {
  @IsString()
  name: string;

  @IsString()
  isaId: string;

  @IsString()
  gsId: string;

  @IsString()
  @IsOptional()
  vanProvider?: string;

  @IsObject()
  @IsOptional()
  vanConfig?: Record<string, unknown>;

  @IsArray()
  @IsOptional()
  supportedMessages?: string[];

  @IsString()
  @IsOptional()
  statusUpdateLevel?: string;
}

export class UpdatePartnerDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsObject()
  @IsOptional()
  vanConfig?: Record<string, unknown>;

  @IsArray()
  @IsOptional()
  supportedMessages?: string[];

  @IsString()
  @IsOptional()
  statusUpdateLevel?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

@Injectable()
export class EDIPartnerService {
  private readonly logger = new Logger(EDIPartnerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listPartners(tenantId: number) {
    return this.prisma.eDITradingPartner.findMany({
      where: { tenantId },
      include: {
        _count: { select: { messages: true, autoAcceptRules: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getPartner(tenantId: number, partnerId: number) {
    const partner = await this.prisma.eDITradingPartner.findFirst({
      where: { id: partnerId, tenantId },
      include: {
        autoAcceptRules: {
          where: { isActive: true },
          orderBy: { priority: 'desc' },
        },
      },
    });
    if (!partner) throw new NotFoundException(`Trading partner ${partnerId} not found`);
    return partner;
  }

  async findByIsaId(tenantId: number, isaId: string) {
    return this.prisma.eDITradingPartner.findFirst({
      where: { tenantId, isaId },
    });
  }

  async createPartner(tenantId: number, data: CreatePartnerDto) {
    const existing = await this.findByIsaId(tenantId, data.isaId);
    if (existing) throw new ConflictException(`Trading partner with ISA ID ${data.isaId} already exists`);

    return this.prisma.eDITradingPartner.create({
      data: {
        tenantId,
        name: data.name,
        isaId: data.isaId,
        gsId: data.gsId,
        vanProvider: (data.vanProvider as EDIVanProvider) ?? EDIVanProvider.SPS_COMMERCE,
        vanConfig: (data.vanConfig ?? {}) as Prisma.InputJsonValue,
        supportedMessages: (data.supportedMessages as EDIMessageType[]) ?? [
          EDIMessageType.T204,
          EDIMessageType.T210,
          EDIMessageType.T214,
        ],
        statusUpdateLevel: (data.statusUpdateLevel as EDIStatusUpdateLevel) ?? EDIStatusUpdateLevel.STANDARD,
      },
    });
  }

  async updatePartner(tenantId: number, partnerId: number, data: UpdatePartnerDto) {
    // getPartner validates tenant scoping (findFirst with tenantId) before update
    await this.getPartner(tenantId, partnerId);
    return this.prisma.eDITradingPartner.update({
      where: { id: partnerId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.vanConfig !== undefined && {
          vanConfig: data.vanConfig as Prisma.InputJsonValue,
        }),
        ...(data.supportedMessages !== undefined && {
          supportedMessages: data.supportedMessages as EDIMessageType[],
        }),
        ...(data.statusUpdateLevel !== undefined && {
          statusUpdateLevel: data.statusUpdateLevel as EDIStatusUpdateLevel,
        }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  // Note: partnerId is always resolved from tenant-scoped lookups (getPartner/findByIsaId),
  // so direct ID usage here is safe.
  async incrementTenderStats(partnerId: number, field: 'tendersReceived' | 'tendersAccepted' | 'tendersDeclined') {
    return this.prisma.eDITradingPartner.update({
      where: { id: partnerId },
      data: { [field]: { increment: 1 }, lastMessageAt: new Date() },
    });
  }
}
