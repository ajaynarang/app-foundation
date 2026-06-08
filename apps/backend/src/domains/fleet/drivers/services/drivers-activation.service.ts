import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import { UserInvitationsService } from '../../../platform/user-invitations/user-invitations.service';
import { NotificationTriggersService } from '../../../operations/notifications/notification-triggers.service';

@Injectable()
export class DriversActivationService {
  private readonly logger = new Logger(DriversActivationService.name);

  constructor(
    private prisma: PrismaService,
    private readonly userInvitationsService: UserInvitationsService,
    private readonly notificationTriggers: NotificationTriggersService,
    private readonly events: DomainEventService,
  ) {}

  /**
   * Activate a driver (ADMIN only)
   */
  async activateDriver(driverId: string, currentUser: any) {
    const driver = await this.prisma.driver.findUnique({
      where: { driverId },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    if (driver.tenantId !== currentUser.tenant.id) {
      throw new BadRequestException('Driver does not belong to your organization');
    }

    if (driver.status === 'ACTIVE') {
      throw new BadRequestException('Driver is already active');
    }

    if (driver.status === 'INACTIVE' || driver.status === 'SUSPENDED') {
      throw new BadRequestException(`Cannot activate driver with status ${driver.status}. Use reactivate instead.`);
    }

    const activatedDriver = await this.prisma.driver.update({
      where: { driverId },
      data: {
        status: 'ACTIVE',
        activatedAt: new Date(),
        activatedBy: currentUser.id,
      },
    });

    // Fire-and-forget: notify team about driver activation
    this.notificationTriggers.driverActivated(driver.tenantId, driver.name).catch(() => {});

    return activatedDriver;
  }

  /**
   * Deactivate a driver (ADMIN only)
   */
  async deactivateDriver(driverId: string, currentUser: any, reason: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { driverId },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    if (driver.tenantId !== currentUser.tenant.id) {
      throw new BadRequestException('Driver does not belong to your organization');
    }

    if (driver.status !== 'ACTIVE') {
      throw new BadRequestException('Only active drivers can be deactivated');
    }

    // Check for active loads
    const activeLoads = await this.prisma.load.findMany({
      where: {
        driverId: driver.id,
        status: { in: ['ASSIGNED', 'IN_TRANSIT', 'ON_HOLD'] },
        isActive: true,
      },
      select: { loadNumber: true, status: true },
    });

    if (activeLoads.length > 0) {
      throw new ConflictException({
        message: `Cannot deactivate driver. Driver has ${activeLoads.length} active load(s) that must be completed or reassigned first.`,
        activeLoads: activeLoads.map((l) => ({
          loadNumber: l.loadNumber,
          status: l.status,
        })),
      });
    }

    // Check for active route plans
    const activeRoutePlans = await this.prisma.routePlan.findMany({
      where: {
        driverId: driver.id,
        isActive: true,
        status: 'ACTIVE',
      },
      select: { planId: true },
    });

    if (activeRoutePlans.length > 0) {
      throw new ConflictException({
        message: `Cannot deactivate driver. Driver has ${activeRoutePlans.length} active route plan(s).`,
        activeRoutePlans: activeRoutePlans.map((rp) => rp.planId),
      });
    }

    const deactivatedDriver = await this.prisma.driver.update({
      where: { driverId },
      data: {
        status: 'INACTIVE',
        deactivatedAt: new Date(),
        deactivatedBy: currentUser.id,
        deactivationReason: reason,
      },
    });

    // Fire-and-forget: notify team about driver deactivation
    this.notificationTriggers.driverDeactivated(driver.tenantId, driver.name, reason).catch(() => {});

    await this.events.emit(SALLY_EVENTS.DRIVER_DEACTIVATED, driver.tenantId, {
      entityId: driver.driverId,
      entityType: 'driver',
      driverNumber: driver.driverId,
      reason,
    });

    return deactivatedDriver;
  }

  /**
   * Reactivate an inactive driver (ADMIN only)
   */
  async reactivateDriver(driverId: string, currentUser: any) {
    const driver = await this.prisma.driver.findUnique({
      where: { driverId },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    if (driver.tenantId !== currentUser.tenant.id) {
      throw new BadRequestException('Driver does not belong to your organization');
    }

    if (driver.status !== 'INACTIVE') {
      throw new BadRequestException('Only inactive drivers can be reactivated');
    }

    const reactivated = await this.prisma.driver.update({
      where: { driverId },
      data: {
        status: 'ACTIVE',
        reactivatedAt: new Date(),
        reactivatedBy: currentUser.id,
        // Clear deactivation fields
        deactivatedAt: null,
        deactivatedBy: null,
        deactivationReason: null,
      },
    });

    await this.events.emit(SALLY_EVENTS.DRIVER_REACTIVATED, driver.tenantId, {
      entityId: driver.driverId,
      entityType: 'driver',
      driverNumber: driver.driverId,
    });

    return reactivated;
  }

  /**
   * Get all pending drivers (ADMIN only)
   */
  async getPendingDrivers(tenantId: number) {
    return this.prisma.driver.findMany({
      where: {
        tenantId,
        status: 'PENDING_ACTIVATION',
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get all inactive drivers (ADMIN only)
   */
  async getInactiveDrivers(tenantId: number) {
    return this.prisma.driver.findMany({
      where: {
        tenantId,
        status: 'INACTIVE',
      },
      include: {
        deactivatedByUser: {
          select: {
            userId: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { deactivatedAt: 'desc' },
    });
  }

  /**
   * Activate a driver AND send SALLY invitation in one step.
   * - If driver is PENDING_ACTIVATION, activates them first
   * - If driver is already ACTIVE, just sends invitation
   * - Creates UserInvitation linked to driver (role=DRIVER)
   */
  async activateAndInvite(driverId: string, email: string | undefined, currentUser: any, phone?: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { driverId },
      include: { user: true },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    if (driver.tenantId !== currentUser.tenant.id) {
      throw new BadRequestException('Driver does not belong to your organization');
    }

    // Check if driver already has a user account
    if (driver.user) {
      throw new BadRequestException('Driver already has a SALLY account');
    }

    // Resolve contact info — use stored values first, fall back to provided
    const driverEmail = email || driver.email || undefined;
    const driverPhone = phone || driver.phone || undefined;

    if (!driverEmail && !driverPhone) {
      throw new BadRequestException('Driver has no email or phone. Please provide at least one to send an invitation.');
    }

    // Update driver record if new contact info was provided
    let updatedDriver: any = driver;
    const contactUpdates: any = {};
    if (email && email !== driver.email) contactUpdates.email = email;
    if (phone && phone !== driver.phone) contactUpdates.phone = phone;
    if (Object.keys(contactUpdates).length > 0) {
      updatedDriver = await this.prisma.driver.update({
        where: { driverId },
        data: contactUpdates,
      });
    }

    // Activate if pending
    if (driver.status === 'PENDING_ACTIVATION') {
      updatedDriver = await this.prisma.driver.update({
        where: { driverId },
        data: {
          status: 'ACTIVE',
          activatedAt: new Date(),
          activatedBy: currentUser.id,
        },
      });
    }

    // Parse name into first/last (driver has single "name" field)
    const nameParts = driver.name.trim().split(/\s+/);
    const firstName = nameParts[0] || driver.name;
    const lastName = nameParts.slice(1).join(' ') || driver.name;

    // Create invitation via UserInvitationsService
    const invitation = await this.userInvitationsService.inviteUser(
      {
        email: driverEmail,
        phone: driverPhone,
        firstName,
        lastName,
        role: 'DRIVER' as any,
        driverId: driver.driverId,
      },
      currentUser,
    );

    return { driver: updatedDriver, invitation };
  }
}
