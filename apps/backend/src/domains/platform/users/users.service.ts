import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as crypto from 'crypto';
import { NotificationTriggersService } from '../../operations/notifications/notification-triggers.service';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private readonly notificationTriggers: NotificationTriggersService,
  ) {}

  async getAllUsers(tenantIdString?: string, _currentUser?: any) {
    // Get tenant database ID if tenantIdString provided
    let tenantDbId: number | undefined;
    if (tenantIdString) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { tenantId: tenantIdString },
      });
      if (!tenant) {
        throw new NotFoundException('Tenant not found');
      }
      tenantDbId = tenant.id;
    }

    // SUPER_ADMIN can see all users across all tenants (except other super admins)
    // ADMIN can only see users in their tenant
    const where: any = tenantDbId
      ? {
          tenantId: tenantDbId,
          NOT: {
            role: 'SUPER_ADMIN', // Exclude super admins from tenant user list
          },
        }
      : {
          NOT: {
            role: 'SUPER_ADMIN', // When no tenantId, still exclude super admins
          },
        };

    const users = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        userId: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        emailVerified: true,
        createdAt: true,
        lastLoginAt: true,
        tenant: {
          select: {
            tenantId: true,
            companyName: true,
          },
        },
        driver: {
          select: {
            driverId: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return users.map((user) => ({
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
      driver: user.driver,
    }));
  }

  async getUser(userId: string, tenantIdString?: string) {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      include: {
        tenant: true,
        driver: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // ADMIN can only access users in their tenant
    if (tenantIdString && user.tenant?.tenantId !== tenantIdString) {
      throw new ForbiddenException('Cannot access user from different tenant');
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
      driver: user.driver,
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
      this.notificationTriggers.userJoined(tenantDbId, `${user.firstName} ${user.lastName}`, user.role).catch(() => {});
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
      throw new ForbiddenException('Cannot update user from different tenant');
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
        driver: true,
      },
    });

    // Fire-and-forget: notify team about role change
    if (dto.role && dto.role !== user.role && user.tenant?.id) {
      this.notificationTriggers
        .userRoleChanged(
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
      driver: updatedUser.driver,
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
      throw new ForbiddenException('Cannot delete user from different tenant');
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

    return { message: 'User deactivated successfully' };
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
      throw new ForbiddenException('Cannot modify user from different tenant');
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

    return {
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
    };
  }
}
