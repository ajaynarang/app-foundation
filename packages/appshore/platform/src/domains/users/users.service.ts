import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import type { Prisma } from '@appshore/db';
import type { CursorList } from '@app/shared-types';
import {
  buildCursorPage,
  clampCursorLimit,
  encodeCursor,
  keysetWhere,
} from '@appshore/kernel/shared/utils/cursor-pagination';
import { containsText } from '@appshore/kernel/shared/utils/list-query';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as crypto from 'crypto';
import { USER_LIFECYCLE_HOOKS, type UserLifecycleHooks } from '../platform-hooks';

const USER_KEYSET = { field: 'createdAt', idField: 'userId', kind: 'date', direction: 'desc' } as const;

/** What a user list row carries: the public `userId`, never the Int key. */
const USER_LIST_SELECT = {
  userId: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  isActive: true,
  emailVerified: true,
  createdAt: true,
  lastLoginAt: true,
  tenant: { select: { tenantId: true, companyName: true } },
} satisfies Prisma.UserSelect;

export type UserListItem = Prisma.UserGetPayload<{ select: typeof USER_LIST_SELECT }>;

/** `GET /users`: `q` searches email and name. */
export interface UserListQuery {
  q?: string;
  limit?: number;
  cursor?: string;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    @Optional() @Inject(USER_LIFECYCLE_HOOKS) private readonly lifecycleHooks?: UserLifecycleHooks,
  ) {}

  /**
   * A workspace's users (or, with no tenant, every tenant's), newest first, as a cursor list. Super admins are
   * never listed. The tiebreak is the public `userId`; the Int key never leaves the service.
   */
  async listUsers(tenantIdString?: string, query: UserListQuery = {}): Promise<CursorList<UserListItem>> {
    const take = clampCursorLimit(query.limit);
    // Decoded before any query runs: a malformed cursor is a 400 and costs nothing.
    const keyset = query.cursor ? keysetWhere({ ...USER_KEYSET, cursor: query.cursor }) : undefined;

    let tenantDbId: number | undefined;
    if (tenantIdString) {
      const tenant = await this.prisma.tenant.findUnique({ where: { tenantId: tenantIdString } });
      if (!tenant) throw new NotFoundException('Tenant not found');
      tenantDbId = tenant.id;
    }

    const scope: Prisma.UserWhereInput = {
      ...(tenantDbId !== undefined && { tenantId: tenantDbId }),
      NOT: { role: 'SUPER_ADMIN' },
    };
    if (query.q) {
      scope.OR = [
        { email: containsText(query.q) },
        { firstName: containsText(query.q) },
        { lastName: containsText(query.q) },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where: keyset ? { AND: [scope, keyset] } : scope,
        select: USER_LIST_SELECT,
        orderBy: [{ createdAt: 'desc' }, { userId: 'desc' }],
        take: take + 1,
      }),
      this.prisma.user.count({ where: scope }),
    ]);
    return { ...buildCursorPage(rows, take, (row) => encodeCursor(row.createdAt, row.userId)), total };
  }

  async getUser(userId: string, tenantIdString?: string) {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      include: {
        tenant: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // ADMIN can only access users in their tenant
    if (tenantIdString && user.tenant?.tenantId !== tenantIdString) {
      // Another workspace's user answers as a missing one: a 403 would confirm it exists.
      throw new NotFoundException('User not found');
    }

    return {
      userId: user.userId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      tenant: user.tenant,
    };
  }

  async createUser(dto: CreateUserDto, tenantIdString?: string) {
    // Validate tenant assignment
    if (dto.role !== 'SUPER_ADMIN' && !tenantIdString) {
      throw new BadRequestException('Tenant ID required for non-super-admin users');
    }

    // Get tenant database ID if provided
    let tenantDbId: number | null = null;
    if (tenantIdString) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { tenantId: tenantIdString },
      });
      if (!tenant) {
        throw new NotFoundException('Tenant not found');
      }
      tenantDbId = tenant.id;
    }

    // Generate unique user ID
    const userIdPrefix = dto.role === 'SUPER_ADMIN' ? 'super' : 'user';
    const randomSuffix = crypto.randomBytes(4).toString('hex');
    const userId = `${userIdPrefix}_${randomSuffix}`;

    // Create user (without password - they'll set it via invitation flow)
    const user = await this.prisma.user.create({
      data: {
        userId,
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role,
        tenantId: tenantDbId,
        isActive: true,
        emailVerified: false,
      },
      include: {
        tenant: true,
      },
    });

    // Fire-and-forget: notify team about new user
    if (tenantDbId) {
      this.lifecycleHooks?.userJoined(tenantDbId, `${user.firstName} ${user.lastName}`, user.role).catch(() => {});
    }

    return {
      userId: user.userId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      isActive: user.isActive,
      tenant: user.tenant,
    };
  }

  async updateUser(userId: string, dto: UpdateUserDto, tenantIdString?: string, currentUser?: any) {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      include: { tenant: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // ADMIN can only update users in their tenant
    if (tenantIdString && user.tenant?.tenantId !== tenantIdString) {
      // Another workspace's user answers as a missing one: a 403 would confirm it exists.
      throw new NotFoundException('User not found');
    }

    // Cannot modify OWNER role
    if (user.role === 'OWNER') {
      throw new ForbiddenException('Cannot modify the tenant owner account');
    }

    // Cannot promote to OWNER or SUPER_ADMIN
    if (dto.role === 'OWNER' || dto.role === 'SUPER_ADMIN') {
      throw new ForbiddenException(`Cannot change user role to ${dto.role}`);
    }

    // Users cannot modify their own role
    if (dto.role && currentUser?.userId === userId) {
      throw new ForbiddenException('Users cannot modify their own role');
    }

    // Only OWNER or ADMIN can change any user's role
    if (dto.role && currentUser?.role !== 'OWNER' && currentUser?.role !== 'ADMIN') {
      throw new ForbiddenException('Only OWNER or ADMIN can change user roles');
    }

    // If target user is currently ADMIN, only OWNER can modify them
    if (user.role === 'ADMIN' && currentUser?.role !== 'OWNER') {
      throw new ForbiddenException('Only the tenant owner can modify admin users');
    }

    // Only OWNER can promote users to ADMIN
    if (dto.role === 'ADMIN' && currentUser?.role !== 'OWNER') {
      throw new ForbiddenException('Only the tenant owner can promote users to ADMIN');
    }

    const updatedUser = await this.prisma.user.update({
      where: { userId },
      data: {
        ...(dto.firstName && { firstName: dto.firstName }),
        ...(dto.lastName && { lastName: dto.lastName }),
        ...(dto.role && { role: dto.role }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: {
        tenant: true,
      },
    });

    // Fire-and-forget: notify team about role change
    if (dto.role && dto.role !== user.role && user.tenant?.id) {
      this.lifecycleHooks
        ?.userRoleChanged(
          user.tenant.id,
          user.id,
          `${updatedUser.firstName} ${updatedUser.lastName}`,
          user.role,
          dto.role,
        )
        .catch(() => {});
    }

    return {
      userId: updatedUser.userId,
      email: updatedUser.email,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      role: updatedUser.role,
      isActive: updatedUser.isActive,
      tenant: updatedUser.tenant,
    };
  }

  async deleteUser(userId: string, tenantIdString?: string, currentUser?: any) {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      include: { tenant: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // ADMIN can only delete users in their tenant
    if (tenantIdString && user.tenant?.tenantId !== tenantIdString) {
      // Another workspace's user answers as a missing one: a 403 would confirm it exists.
      throw new NotFoundException('User not found');
    }

    // Cannot delete OWNER
    if (user.role === 'OWNER') {
      throw new ForbiddenException('Cannot delete the tenant owner account');
    }

    // ADMIN cannot delete other ADMINs (only OWNER can)
    if (user.role === 'ADMIN' && currentUser?.role !== 'OWNER') {
      throw new ForbiddenException('Only the tenant owner can delete admin users');
    }

    // Soft delete by deactivating
    await this.prisma.user.update({
      where: { userId },
      data: { isActive: false },
    });
  }

  async toggleUserStatus(userId: string, isActive: boolean, tenantIdString?: string, currentUser?: any) {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      include: { tenant: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // ADMIN can only toggle users in their tenant
    if (tenantIdString && user.tenant?.tenantId !== tenantIdString) {
      // Another workspace's user answers as a missing one: a 403 would confirm it exists.
      throw new NotFoundException('User not found');
    }

    // Cannot deactivate OWNER
    if (user.role === 'OWNER') {
      throw new ForbiddenException('Cannot deactivate the tenant owner account');
    }

    // ADMIN cannot deactivate other ADMINs (only OWNER can)
    if (user.role === 'ADMIN' && currentUser?.role !== 'OWNER') {
      throw new ForbiddenException('Only the tenant owner can deactivate admin users');
    }

    await this.prisma.user.update({
      where: { userId },
      data: { isActive },
    });

    // An action answers the resource as it is now: the user, with the new status.
    return this.getUser(userId, tenantIdString);
  }
}
