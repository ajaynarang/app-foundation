import { Injectable } from '@nestjs/common';
import type { UserRole } from '@appshore/db';
import { PrismaService } from '../../database/prisma.service';
import type { Recipient } from './dispatch.types';

const RECIPIENT_SELECT = { id: true, userId: true, firebaseUid: true, email: true, phone: true } as const;

@Injectable()
export class RecipientResolutionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Membership scoping is defense in depth: a caller bug passing a foreign user id
   * must not become a cross-tenant leak. A caller whose audience is legitimately
   * built from non-members (followers, room-verified entrants) opts out.
   */
  resolveByUserIds(tenantId: number, userIds: number[], opts: { scopeToMembership: boolean }): Promise<Recipient[]> {
    if (userIds.length === 0) return Promise.resolve([]);
    return this.prisma.user.findMany({
      where: {
        id: { in: userIds },
        isActive: true,
        ...(opts.scopeToMembership && { memberships: { some: { tenantId } } }),
      },
      select: RECIPIENT_SELECT,
    });
  }

  resolveByRoles(tenantId: number, roles: UserRole[]): Promise<Recipient[]> {
    if (roles.length === 0) return Promise.resolve([]);
    return this.prisma.user.findMany({
      where: { tenantId, role: { in: roles }, isActive: true },
      select: RECIPIENT_SELECT,
    });
  }
}
