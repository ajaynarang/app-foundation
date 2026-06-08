import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ActionRequestStatusSchema } from '@sally/shared-types';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { AlertTriggersService } from '../../../operations/alerts/services/alert-triggers.service';
import { Prisma } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';

const ACTION_REQUEST_STATUS = ActionRequestStatusSchema.enum;

const ALERT_TYPE_MAP: Record<string, string> = {
  detention: 'DETENTION_REPORT',
  issue_report: 'ISSUE_REPORT',
};

@Injectable()
export class DriverActionsService {
  private readonly logger = new Logger(DriverActionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly alertTriggers: AlertTriggersService,
  ) {}

  async create(params: {
    tenantId: number;
    loadId: number;
    driverId: number;
    stopId?: number;
    actionType: string;
    note?: string;
    metadata?: Record<string, unknown>;
  }) {
    const action = await this.prisma.driverActionRequest.create({
      data: {
        actionRequestId: createId(),
        tenantId: params.tenantId,
        loadId: params.loadId,
        stopId: params.stopId ?? null,
        driverId: params.driverId,
        actionType: params.actionType,
        status: ACTION_REQUEST_STATUS.SUBMITTED,
        note: params.note ?? null,
        metadata: (params.metadata ?? null) as Prisma.InputJsonValue | null,
      },
    });

    // Fire alert for detention and issue reports
    const alertType = ALERT_TYPE_MAP[params.actionType];
    if (alertType) {
      const [driver, load] = await Promise.all([
        this.prisma.driver.findUnique({
          where: { id: params.driverId },
          select: { driverId: true, name: true },
        }),
        this.prisma.load.findUnique({
          where: { id: params.loadId },
          select: { loadNumber: true },
        }),
      ]);

      if (driver && load) {
        // driver.driverId is the STRING driver ID
        await this.alertTriggers.trigger(alertType, params.tenantId, driver.driverId, {
          driverName: driver.name,
          loadNumber: load.loadNumber,
          actionType: params.actionType,
          note: params.note,
          priority: params.actionType === 'issue_report' ? 'critical' : 'high',
        });
      }
    }

    return this.formatResponse(action);
  }

  async acknowledge(actionRequestId: string, tenantId: number, acknowledgedBy: number) {
    const action = await this.findByIdOrThrow(actionRequestId, tenantId);
    if (action.status !== ACTION_REQUEST_STATUS.SUBMITTED) {
      throw new BadRequestException('Action already acknowledged or resolved');
    }

    // Use updateMany with status in WHERE for atomic transition —
    // prevents double-acknowledge from concurrent calls
    const result = await this.prisma.driverActionRequest.updateMany({
      where: { id: action.id, status: ACTION_REQUEST_STATUS.SUBMITTED },
      data: {
        status: ACTION_REQUEST_STATUS.ACKNOWLEDGED,
        acknowledgedAt: new Date(),
        acknowledgedBy,
      },
    });
    if (result.count === 0) {
      throw new BadRequestException('Action already acknowledged or resolved');
    }

    const updated = await this.prisma.driverActionRequest.findUniqueOrThrow({
      where: { id: action.id },
    });

    return this.formatResponse(updated);
  }

  async resolve(params: { actionRequestId: string; tenantId: number; documentId?: number; loadChargeId?: number }) {
    const action = await this.findByIdOrThrow(params.actionRequestId, params.tenantId);
    if (action.status === ACTION_REQUEST_STATUS.RESOLVED) {
      throw new BadRequestException('Action already resolved');
    }

    // Use updateMany with status in WHERE for atomic transition —
    // prevents double-resolve from concurrent calls
    const result = await this.prisma.driverActionRequest.updateMany({
      where: { id: action.id, status: { not: ACTION_REQUEST_STATUS.RESOLVED } },
      data: {
        status: ACTION_REQUEST_STATUS.RESOLVED,
        resolvedAt: new Date(),
        documentId: params.documentId ?? action.documentId,
        loadChargeId: params.loadChargeId ?? action.loadChargeId,
      },
    });
    if (result.count === 0) {
      throw new BadRequestException('Action already resolved');
    }

    const updated = await this.prisma.driverActionRequest.findUniqueOrThrow({
      where: { id: action.id },
    });

    return this.formatResponse(updated);
  }

  async getByLoad(loadId: number, tenantId: number) {
    const actions = await this.prisma.driverActionRequest.findMany({
      where: { loadId, tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return actions.map((a) => this.formatResponse(a));
  }

  private async findByIdOrThrow(actionRequestId: string, tenantId: number) {
    const action = await this.prisma.driverActionRequest.findUnique({
      where: { actionRequestId },
    });
    if (!action || action.tenantId !== tenantId) {
      throw new NotFoundException('Action request not found');
    }
    return action;
  }

  private formatResponse(action: any) {
    return {
      id: action.id,
      actionRequestId: action.actionRequestId,
      loadId: action.loadId,
      stopId: action.stopId,
      driverId: action.driverId,
      actionType: action.actionType,
      status: action.status,
      note: action.note,
      metadata: action.metadata,
      documentId: action.documentId,
      loadChargeId: action.loadChargeId,
      acknowledgedAt: action.acknowledgedAt?.toISOString?.() ?? action.acknowledgedAt,
      resolvedAt: action.resolvedAt?.toISOString?.() ?? action.resolvedAt,
      createdAt: action.createdAt?.toISOString?.() ?? action.createdAt,
    };
  }
}
