import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { MoneyCodeMethod } from '@prisma/client';
import { MoneyCodeStatusSchema, type MoneyCodeStatus } from '@sally/shared-types';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { LoadChargesService } from './load-charges.service';
import { AlertTriggersService } from '../../../operations/alerts/services/alert-triggers.service';
import { PushService } from '../../../../infrastructure/push/push.service';
import { createId } from '@paralleldrive/cuid2';

const MC_STATUS = MoneyCodeStatusSchema.enum;

const VALID_STATUS_TRANSITIONS: Record<MoneyCodeStatus, readonly MoneyCodeStatus[]> = {
  REQUESTED: [MC_STATUS.APPROVED, MC_STATUS.DENIED, MC_STATUS.CANCELLED],
  APPROVED: [MC_STATUS.USED, MC_STATUS.EXPIRED, MC_STATUS.CANCELLED],
  DENIED: [],
  USED: [],
  EXPIRED: [],
  CANCELLED: [],
};

@Injectable()
export class MoneyCodeService {
  private readonly logger = new Logger(MoneyCodeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly loadChargesService: LoadChargesService,
    private readonly alertTriggers: AlertTriggersService,
    private readonly pushService: PushService,
  ) {}

  async create(params: {
    tenantId: number;
    loadId: number;
    driverId: number;
    stopId?: number;
    requestedCents: number;
    method: MoneyCodeMethod;
    driverNote?: string;
  }) {
    const moneyCode = await this.prisma.moneyCode.create({
      data: {
        moneyCodeId: createId(),
        tenantId: params.tenantId,
        loadId: params.loadId,
        stopId: params.stopId ?? null,
        driverId: params.driverId,
        amountCents: params.requestedCents,
        requestedCents: params.requestedCents,
        method: params.method,
        status: MC_STATUS.REQUESTED,
        requestedAt: new Date(),
        driverNote: params.driverNote ?? null,
      },
    });

    // Get driver and load info for alert
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

    // Fire alert to dispatcher — use STRING driverId
    if (driver && load) {
      await this.alertTriggers.trigger('LUMPER_REQUEST', params.tenantId, driver.driverId, {
        driverName: driver.name,
        loadNumber: load.loadNumber,
        moneyCodeId: moneyCode.moneyCodeId,
        requestedCents: params.requestedCents,
        method: params.method,
        priority: 'high',
      });
    }

    return this.formatResponse(moneyCode);
  }

  async approve(params: {
    moneyCodeId: string;
    tenantId: number;
    approvedBy: number;
    code: string;
    amountCents: number;
    dispatcherNote?: string;
    expiresInHours?: number;
  }) {
    const mc = await this.findByIdOrThrow(params.moneyCodeId, params.tenantId);
    this.assertTransition(mc.status, MC_STATUS.APPROVED);

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + (params.expiresInHours ?? 24));

    const updated = await this.atomicTransition(mc.id, mc.status, {
      status: MC_STATUS.APPROVED,
      code: params.code,
      amountCents: params.amountCents,
      approvedAt: new Date(),
      approvedBy: params.approvedBy,
      expiresAt,
      dispatcherNote: params.dispatcherNote ?? null,
    });

    // Send push notification to driver
    const driver = await this.prisma.driver.findUnique({
      where: { id: mc.driverId },
      select: { user: { select: { id: true } } },
    });
    if (driver?.user?.id) {
      this.pushService
        .sendPushToUser(driver.user.id, {
          title: `Lumper Approved — $${(params.amountCents / 100).toFixed(2)}`,
          body: `Your money code: ${params.code}`,
          tag: `lumper-${mc.moneyCodeId}`,
          url: '/driver/trip',
        })
        .catch(() => {}); // Fire-and-forget
    }

    return this.formatResponse(updated);
  }

  async deny(params: { moneyCodeId: string; tenantId: number; deniedBy: number; dispatcherNote?: string }) {
    const mc = await this.findByIdOrThrow(params.moneyCodeId, params.tenantId);
    this.assertTransition(mc.status, MC_STATUS.DENIED);

    const updated = await this.atomicTransition(mc.id, mc.status, {
      status: MC_STATUS.DENIED,
      approvedBy: params.deniedBy,
      approvedAt: new Date(),
      dispatcherNote: params.dispatcherNote ?? null,
    });

    // Push notification to driver
    const driver = await this.prisma.driver.findUnique({
      where: { id: mc.driverId },
      select: { user: { select: { id: true } } },
    });
    if (driver?.user?.id) {
      this.pushService
        .sendPushToUser(driver.user.id, {
          title: 'Lumper Request Denied',
          body: params.dispatcherNote || 'Your lumper request was denied',
          tag: `lumper-${mc.moneyCodeId}`,
          url: '/driver/trip',
        })
        .catch(() => {}); // Fire-and-forget
    }

    return this.formatResponse(updated);
  }

  async markUsed(params: {
    moneyCodeId: string;
    tenantId: number;
    actualAmountCents: number;
    receiptDocumentId?: number;
  }) {
    const mc = await this.findByIdOrThrow(params.moneyCodeId, params.tenantId);
    this.assertTransition(mc.status, MC_STATUS.USED);

    // Use a transaction to ensure the LoadCharge creation and status update
    // are atomic, and use updateMany with status in WHERE to prevent duplicates
    const updated = await this.prisma.$transaction(async (tx) => {
      // Atomic transition: only one concurrent call can win
      const result = await tx.moneyCode.updateMany({
        where: { id: mc.id, status: mc.status },
        data: {
          status: MC_STATUS.USED,
          usedAt: new Date(),
          receiptDocumentId: params.receiptDocumentId ?? null,
        },
      });
      if (result.count === 0) {
        throw new BadRequestException('This request has already been processed');
      }

      // Create LoadCharge for the lumper expense (inside txn to rollback on failure)
      const charge = await this.loadChargesService.addCharge({
        loadId: mc.loadId,
        chargeType: 'lumper',
        description: `Lumper — ${mc.method.toUpperCase()} #${mc.code ?? 'N/A'}`,
        unitPriceCents: params.actualAmountCents,
        quantity: 1,
        isBillable: true,
        isPayable: true,
      });

      // Link the charge to the money code
      await tx.moneyCode.update({
        where: { id: mc.id },
        data: { loadChargeId: charge.id },
      });

      return tx.moneyCode.findUniqueOrThrow({ where: { id: mc.id } });
    });

    return this.formatResponse(updated);
  }

  async cancel(moneyCodeId: string, tenantId: number) {
    const mc = await this.findByIdOrThrow(moneyCodeId, tenantId);
    this.assertTransition(mc.status, MC_STATUS.CANCELLED);

    const updated = await this.prisma.moneyCode.update({
      where: { id: mc.id },
      data: { status: MC_STATUS.CANCELLED },
    });

    return this.formatResponse(updated);
  }

  async getByLoad(loadId: number, tenantId: number) {
    const codes = await this.prisma.moneyCode.findMany({
      where: { loadId, tenantId },
      orderBy: { createdAt: 'desc' },
    });

    // Read-time expiry: transition approved codes past their expiresAt
    // Use updateMany with status in WHERE to prevent concurrent calls from
    // both trying to expire the same codes
    const now = new Date();
    const expiredIds = codes
      .filter((code) => code.status === MC_STATUS.APPROVED && code.expiresAt && code.expiresAt < now)
      .map((code) => code.id);

    if (expiredIds.length > 0) {
      await this.prisma.moneyCode.updateMany({
        where: { id: { in: expiredIds }, status: MC_STATUS.APPROVED },
        data: { status: MC_STATUS.EXPIRED },
      });
      // Update local objects for response
      for (const code of codes) {
        if (expiredIds.includes(code.id)) {
          code.status = MC_STATUS.EXPIRED;
        }
      }
    }

    return codes.map((c) => this.formatResponse(c));
  }

  async getById(moneyCodeId: string, tenantId: number) {
    return this.formatResponse(await this.findByIdOrThrow(moneyCodeId, tenantId));
  }

  // --- Proactive issuance (dispatcher creates without driver request) ---

  async issueProactively(params: {
    tenantId: number;
    loadId: number;
    driverId: number;
    stopId?: number;
    code: string;
    amountCents: number;
    method: MoneyCodeMethod;
    dispatcherNote?: string;
    issuedBy: number;
    expiresInHours?: number;
  }) {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + (params.expiresInHours ?? 24));

    const moneyCode = await this.prisma.moneyCode.create({
      data: {
        moneyCodeId: createId(),
        tenantId: params.tenantId,
        loadId: params.loadId,
        stopId: params.stopId ?? null,
        driverId: params.driverId,
        code: params.code,
        amountCents: params.amountCents,
        requestedCents: params.amountCents,
        method: params.method,
        status: MC_STATUS.APPROVED,
        requestedAt: new Date(),
        approvedAt: new Date(),
        approvedBy: params.issuedBy,
        expiresAt,
        dispatcherNote: params.dispatcherNote ?? null,
      },
    });

    // Send push notification to driver
    const driver = await this.prisma.driver.findUnique({
      where: { id: params.driverId },
      select: { user: { select: { id: true } } },
    });
    if (driver?.user?.id) {
      this.pushService
        .sendPushToUser(driver.user.id, {
          title: `Lumper Code Issued — $${(params.amountCents / 100).toFixed(2)}`,
          body: `Your money code: ${params.code}`,
          tag: `lumper-${moneyCode.moneyCodeId}`,
          url: '/driver/trip',
        })
        .catch(() => {}); // Fire-and-forget
    }

    return this.formatResponse(moneyCode);
  }

  // --- Sally Insights ---

  async getLumperInsights(loadId: number, tenantId: number) {
    const load = await this.prisma.load.findUnique({
      where: { id: loadId },
      select: {
        id: true,
        driverId: true,
        stops: {
          where: { actionType: 'delivery' },
          select: { stop: { select: { name: true, city: true, state: true } } },
          take: 1,
        },
      },
    });

    if (!load) throw new NotFoundException('Load not found');

    // Facility average — match by stop name (facility name)
    const facilityName = load.stops[0]?.stop?.name;
    let facilityAvg: { avg: number; count: number } | null = null;

    if (facilityName) {
      const facilityCharges = await this.prisma.loadCharge.findMany({
        where: {
          chargeType: 'lumper',
          load: {
            tenantId,
            stops: {
              some: {
                stop: { name: facilityName },
                actionType: 'delivery',
              },
            },
          },
        },
        select: { totalCents: true },
      });

      if (facilityCharges.length > 0) {
        const total = facilityCharges.reduce((sum, c) => sum + c.totalCents, 0);
        facilityAvg = {
          avg: Math.round(total / facilityCharges.length),
          count: facilityCharges.length,
        };
      }
    }

    // Driver history
    let driverHistory: { count: number; allMatched: boolean } | null = null;
    if (load.driverId) {
      const driverCodes = await this.prisma.moneyCode.findMany({
        where: { driverId: load.driverId, tenantId, status: MC_STATUS.USED },
        select: { requestedCents: true, amountCents: true },
      });

      if (driverCodes.length > 0) {
        const allMatched = driverCodes.every((c) => c.requestedCents === c.amountCents);
        driverHistory = { count: driverCodes.length, allMatched };
      }
    }

    return {
      facilityAvg,
      driverHistory,
      facilityName: facilityName ?? null,
    };
  }

  // --- Private helpers ---

  private async findByIdOrThrow(moneyCodeId: string, tenantId: number) {
    const mc = await this.prisma.moneyCode.findUnique({
      where: { moneyCodeId },
    });
    if (!mc || mc.tenantId !== tenantId) {
      throw new NotFoundException('Money code not found');
    }
    return mc;
  }

  private assertTransition(currentStatus: string, targetStatus: MoneyCodeStatus) {
    const allowed = VALID_STATUS_TRANSITIONS[currentStatus as MoneyCodeStatus] ?? [];
    if (!(allowed as readonly string[]).includes(targetStatus)) {
      throw new BadRequestException(`Cannot transition from "${currentStatus}" to "${targetStatus}"`);
    }
  }

  /**
   * Atomic status transition — prevents race conditions where two concurrent
   * requests both read the same status and both succeed.
   * Uses updateMany with status in the WHERE clause so only one wins.
   */
  private async atomicTransition(id: number, expectedStatus: MoneyCodeStatus, data: Record<string, any>) {
    const result = await this.prisma.moneyCode.updateMany({
      where: { id, status: expectedStatus },
      data,
    });
    if (result.count === 0) {
      throw new BadRequestException('This request has already been processed');
    }
    // Re-fetch to return updated record
    return this.prisma.moneyCode.findUniqueOrThrow({ where: { id } });
  }

  private formatResponse(mc: any) {
    return {
      id: mc.id,
      moneyCodeId: mc.moneyCodeId,
      loadId: mc.loadId,
      stopId: mc.stopId,
      driverId: mc.driverId,
      code: mc.code,
      amountCents: mc.amountCents,
      requestedCents: mc.requestedCents,
      method: mc.method,
      status: mc.status,
      requestedAt: mc.requestedAt?.toISOString?.() ?? mc.requestedAt,
      approvedAt: mc.approvedAt?.toISOString?.() ?? mc.approvedAt,
      usedAt: mc.usedAt?.toISOString?.() ?? mc.usedAt,
      expiresAt: mc.expiresAt?.toISOString?.() ?? mc.expiresAt,
      driverNote: mc.driverNote,
      dispatcherNote: mc.dispatcherNote,
      receiptDocumentId: mc.receiptDocumentId,
      loadChargeId: mc.loadChargeId,
      createdAt: mc.createdAt?.toISOString?.() ?? mc.createdAt,
    };
  }
}
