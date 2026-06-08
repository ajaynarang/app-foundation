import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { ShiftNoteDto, ShiftNoteLinkedEntityDto } from '../command-center.types';

@Injectable()
export class ShiftNotesService {
  constructor(private readonly prisma: PrismaService) {}

  async getShiftNotes(tenantId: number): Promise<{ notes: ShiftNoteDto[]; handoffStatus: any }> {
    const now = new Date();

    const notes = await this.prisma.shiftNote.findMany({
      where: {
        tenantId,
        deletedAt: null,
        OR: [{ isPinned: true }, { expiresAt: { gt: now } }],
      },
      include: {
        createdByUser: {
          select: { userId: true, firstName: true, lastName: true },
        },
        acknowledgedByUser: {
          select: { userId: true, firstName: true, lastName: true },
        },
      },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      take: 20,
    });

    // Sort by: pinned first, then priority (urgent > action_required > info), then recency
    const priorityOrder = { urgent: 0, action_required: 1, info: 2 };
    const sorted = notes.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      const pa = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 2;
      const pb = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 2;
      if (pa !== pb) return pa - pb;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    // Build linked entities — batch fetch all referenced IDs
    const driverIds = [...new Set(sorted.filter((n) => n.linkedDriverId).map((n) => n.linkedDriverId))];
    const loadIds = [...new Set(sorted.filter((n) => n.linkedLoadId).map((n) => n.linkedLoadId))];
    const vehicleIds = [...new Set(sorted.filter((n) => n.linkedVehicleId).map((n) => n.linkedVehicleId))];

    const [linkedDrivers, linkedLoads, linkedVehicles] = await Promise.all([
      driverIds.length > 0
        ? this.prisma.driver.findMany({
            where: { driverId: { in: driverIds }, tenantId },
            select: { driverId: true, name: true },
          })
        : [],
      loadIds.length > 0
        ? this.prisma.load.findMany({
            where: { loadNumber: { in: loadIds }, tenantId },
            select: { loadNumber: true, referenceNumber: true },
          })
        : [],
      vehicleIds.length > 0
        ? this.prisma.vehicle.findMany({
            where: { vehicleId: { in: vehicleIds }, tenantId },
            select: { vehicleId: true, unitNumber: true },
          })
        : [],
    ]);

    const driverMap = new Map(linkedDrivers.map((d) => [d.driverId, d.name ?? d.driverId] as const));
    const loadMap = new Map(linkedLoads.map((l) => [l.loadNumber, l.referenceNumber ?? l.loadNumber] as const));
    const vehicleMap = new Map(linkedVehicles.map((v) => [v.vehicleId, v.unitNumber ?? v.vehicleId] as const));

    const mappedNotes: ShiftNoteDto[] = sorted.map((note) => {
      const entities: ShiftNoteLinkedEntityDto[] = [];

      if (note.linkedDriverId) {
        entities.push({
          type: 'driver',
          id: note.linkedDriverId,
          label: driverMap.get(note.linkedDriverId) ?? note.linkedDriverId,
        });
      }
      if (note.linkedLoadId) {
        entities.push({
          type: 'load',
          id: note.linkedLoadId,
          label: loadMap.get(note.linkedLoadId) ?? note.linkedLoadId,
        });
      }
      if (note.linkedRoutePlanId) {
        entities.push({
          type: 'route',
          id: note.linkedRoutePlanId,
          label: note.linkedRoutePlanId,
        });
      }
      if (note.linkedVehicleId) {
        entities.push({
          type: 'vehicle',
          id: note.linkedVehicleId,
          label: vehicleMap.get(note.linkedVehicleId) ?? note.linkedVehicleId,
        });
      }

      return {
        noteId: note.noteId,
        content: note.content,
        priority: note.priority as 'urgent' | 'action_required' | 'info',
        createdBy: {
          userId: note.createdByUser.userId,
          name: `${note.createdByUser.firstName} ${note.createdByUser.lastName}`,
        },
        createdAt: note.createdAt.toISOString(),
        expiresAt: note.expiresAt.toISOString(),
        isPinned: note.isPinned,
        linkedEntities: entities,
        acknowledgedBy: note.acknowledgedByUser
          ? {
              userId: note.acknowledgedByUser.userId,
              name: `${note.acknowledgedByUser.firstName} ${note.acknowledgedByUser.lastName}`,
            }
          : null,
        acknowledgedAt: note.acknowledgedAt?.toISOString() ?? null,
      };
    });

    // Handoff status: find the most recent acknowledgment
    const lastAck = notes.find((n) => n.acknowledgedAt);

    return {
      notes: mappedNotes,
      handoffStatus: lastAck
        ? {
            acknowledged: true,
            acknowledgedBy: {
              userId: lastAck.acknowledgedByUser?.userId,
              name: `${lastAck.acknowledgedByUser?.firstName} ${lastAck.acknowledgedByUser?.lastName}`,
            },
            acknowledgedAt: lastAck.acknowledgedAt?.toISOString(),
          }
        : { acknowledged: false },
    };
  }

  async createShiftNote(
    tenantId: number,
    userStringId: string,
    content: string,
    isPinned: boolean = false,
    priority: string = 'info',
  ): Promise<ShiftNoteDto> {
    const user = await this.prisma.user.findUnique({
      where: { userId: userStringId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Auto-link entities from content
    const linked = await this.autoLinkEntities(content, tenantId);

    const note = await this.prisma.shiftNote.create({
      data: {
        tenantId,
        content,
        createdBy: user.id,
        expiresAt,
        isPinned,
        priority,
        linkedDriverId: linked.driverId,
        linkedLoadId: linked.loadId,
        linkedRoutePlanId: linked.routePlanId,
        linkedVehicleId: linked.vehicleId,
      },
      include: {
        createdByUser: {
          select: { userId: true, firstName: true, lastName: true },
        },
      },
    });

    return {
      noteId: note.noteId,
      content: note.content,
      priority: note.priority as 'urgent' | 'action_required' | 'info',
      createdBy: {
        userId: note.createdByUser.userId,
        name: `${note.createdByUser.firstName} ${note.createdByUser.lastName}`,
      },
      createdAt: note.createdAt.toISOString(),
      expiresAt: note.expiresAt.toISOString(),
      isPinned: note.isPinned,
      linkedEntities: linked.entities,
      acknowledgedBy: null,
      acknowledgedAt: null,
    };
  }

  async togglePinShiftNote(tenantId: number, noteId: string): Promise<ShiftNoteDto> {
    const note = await this.prisma.shiftNote.findFirst({
      where: { noteId, tenantId, deletedAt: null },
    });

    if (!note) {
      throw new NotFoundException('Shift note not found');
    }

    const updated = await this.prisma.shiftNote.update({
      where: { id: note.id },
      data: { isPinned: !note.isPinned },
      include: {
        createdByUser: {
          select: { userId: true, firstName: true, lastName: true },
        },
        acknowledgedByUser: {
          select: { userId: true, firstName: true, lastName: true },
        },
      },
    });

    return {
      noteId: updated.noteId,
      content: updated.content,
      priority: updated.priority as 'urgent' | 'action_required' | 'info',
      createdBy: {
        userId: updated.createdByUser.userId,
        name: `${updated.createdByUser.firstName} ${updated.createdByUser.lastName}`,
      },
      createdAt: updated.createdAt.toISOString(),
      expiresAt: updated.expiresAt.toISOString(),
      isPinned: updated.isPinned,
      linkedEntities: [],
      acknowledgedBy: updated.acknowledgedByUser
        ? {
            userId: updated.acknowledgedByUser.userId,
            name: `${updated.acknowledgedByUser.firstName} ${updated.acknowledgedByUser.lastName}`,
          }
        : null,
      acknowledgedAt: updated.acknowledgedAt?.toISOString() ?? null,
    };
  }

  async deleteShiftNote(tenantId: number, noteId: string): Promise<void> {
    await this.prisma.shiftNote.updateMany({
      where: { noteId, tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  async acknowledgeHandoff(tenantId: number, userStringId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { userId: userStringId },
      select: { id: true },
    });

    if (!user) throw new NotFoundException('User not found');

    const now = new Date();

    await this.prisma.shiftNote.updateMany({
      where: {
        tenantId,
        deletedAt: null,
        acknowledgedAt: null,
        OR: [{ isPinned: true }, { expiresAt: { gt: now } }],
      },
      data: {
        acknowledgedBy: user.id,
        acknowledgedAt: now,
      },
    });
  }

  private async autoLinkEntities(
    content: string,
    tenantId: number,
  ): Promise<{
    driverId: string | null;
    loadId: string | null;
    routePlanId: string | null;
    vehicleId: string | null;
    entities: ShiftNoteLinkedEntityDto[];
  }> {
    const entities: ShiftNoteLinkedEntityDto[] = [];
    let driverId: string | null = null;
    let loadId: string | null = null;
    let routePlanId: string | null = null;
    let vehicleId: string | null = null;

    // Load references: LD-XXXX pattern
    const loadMatch = content.match(/LD-\d{3,6}/gi);
    if (loadMatch) {
      const load = await this.prisma.load.findFirst({
        where: { tenantId, referenceNumber: loadMatch[0].toUpperCase() },
        select: { loadNumber: true, referenceNumber: true },
      });
      if (load) {
        loadId = load.loadNumber;
        entities.push({
          type: 'load',
          id: load.loadNumber,
          label: load.referenceNumber ?? load.loadNumber,
        });
      }
    }

    // Vehicle references: TRK-XXX pattern
    const vehicleMatch = content.match(/TRK-\d{2,4}/gi);
    if (vehicleMatch) {
      const vehicle = await this.prisma.vehicle.findFirst({
        where: { tenantId, unitNumber: vehicleMatch[0].toUpperCase() },
        select: { vehicleId: true, unitNumber: true },
      });
      if (vehicle) {
        vehicleId = vehicle.vehicleId;
        entities.push({
          type: 'vehicle',
          id: vehicle.vehicleId,
          label: vehicle.unitNumber ?? vehicle.vehicleId,
        });
      }
    }

    // Route references: RP-XXXXXX pattern
    const routeMatch = content.match(/RP-[A-Z0-9]{6,}/gi);
    if (routeMatch) {
      const plan = await this.prisma.routePlan.findFirst({
        where: { tenantId, planId: routeMatch[0] },
        select: { planId: true },
      });
      if (plan) {
        routePlanId = plan.planId;
        entities.push({ type: 'route', id: plan.planId, label: plan.planId });
      }
    }

    // Driver names: fuzzy match against active drivers (only if unambiguous)
    if (!driverId) {
      const drivers = await this.prisma.driver.findMany({
        where: { tenantId, status: { in: ['PENDING_ACTIVATION', 'ACTIVE'] } },
        select: { driverId: true, name: true },
      });

      const contentLower = content.toLowerCase();
      const matches = drivers.filter((d) => {
        if (!d.name) return false;
        return contentLower.includes(d.name.toLowerCase());
      });

      if (matches.length === 1) {
        driverId = matches[0].driverId;
        entities.push({
          type: 'driver',
          id: matches[0].driverId,
          label: matches[0].name ?? matches[0].driverId,
        });
      }
    }

    return { driverId, loadId, routePlanId, vehicleId, entities };
  }
}
