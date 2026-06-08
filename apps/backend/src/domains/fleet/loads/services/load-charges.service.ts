import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

@Injectable()
export class LoadChargesService {
  private readonly logger = new Logger(LoadChargesService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async assertChargesEditable(loadId: number) {
    const load = await this.prisma.load.findUniqueOrThrow({
      where: { id: loadId },
      select: { billingStatus: true },
    });
    if (load.billingStatus === 'APPROVED' || load.billingStatus === 'INVOICED') {
      throw new BadRequestException(
        'Charges cannot be modified after billing approval. Send the load back for review first.',
      );
    }
  }

  async addCharge(params: {
    loadId: number;
    chargeType: string;
    description: string;
    quantity?: number;
    unitPriceCents: number;
    isBillable?: boolean;
    isPayable?: boolean;
    addedBy?: number;
  }) {
    await this.assertChargesEditable(params.loadId);
    const quantity = params.quantity ?? 1;
    const totalCents = Math.round(quantity * params.unitPriceCents);

    const charge = await this.prisma.loadCharge.create({
      data: {
        loadId: params.loadId,
        chargeType: params.chargeType,
        description: params.description,
        quantity,
        unitPriceCents: params.unitPriceCents,
        totalCents,
        isBillable: params.isBillable ?? true,
        isPayable: params.isPayable ?? false,
        addedBy: params.addedBy,
      },
    });
    return this.formatChargeResponse(charge);
  }

  async getCharges(loadId: number) {
    const charges = await this.prisma.loadCharge.findMany({
      where: { loadId },
      orderBy: { createdAt: 'asc' },
    });
    return charges.map((c) => this.formatChargeResponse(c));
  }

  async updateCharge(
    chargeId: number,
    data: {
      description?: string;
      quantity?: number;
      unitPriceCents?: number;
      isBillable?: boolean;
      isPayable?: boolean;
    },
  ) {
    const existing = await this.prisma.loadCharge.findUnique({
      where: { id: chargeId },
    });
    if (!existing) {
      throw new NotFoundException(`Charge not found: ${chargeId}`);
    }

    await this.assertChargesEditable(existing.loadId);

    const quantity = data.quantity ?? existing.quantity;
    const unitPriceCents = data.unitPriceCents ?? existing.unitPriceCents;
    const totalCents = Math.round(quantity * unitPriceCents);

    const charge = await this.prisma.loadCharge.update({
      where: { id: chargeId },
      data: {
        ...(data.description !== undefined && {
          description: data.description,
        }),
        quantity,
        unitPriceCents,
        totalCents,
        ...(data.isBillable !== undefined && { isBillable: data.isBillable }),
        ...(data.isPayable !== undefined && { isPayable: data.isPayable }),
      },
    });
    return this.formatChargeResponse(charge);
  }

  async removeCharge(chargeId: number) {
    const existing = await this.prisma.loadCharge.findUnique({
      where: { id: chargeId },
    });
    if (!existing) {
      throw new NotFoundException(`Charge not found: ${chargeId}`);
    }

    await this.assertChargesEditable(existing.loadId);

    return this.prisma.loadCharge.delete({ where: { id: chargeId } });
  }

  private formatChargeResponse(charge: any) {
    return {
      id: charge.id,
      loadId: charge.loadId,
      chargeType: charge.chargeType,
      description: charge.description,
      quantity: charge.quantity,
      unitPriceCents: charge.unitPriceCents,
      totalCents: charge.totalCents,
      isBillable: charge.isBillable,
      isPayable: charge.isPayable,
      createdAt: charge.createdAt?.toISOString?.() ?? charge.createdAt,
    };
  }
}
