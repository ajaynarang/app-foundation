import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { OnboardingStatusResponse, OnboardingItem, MilestoneStatus, LoadPath } from './dto/onboarding-status.dto';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(private prisma: PrismaService) {}

  async getOnboardingStatus(tenantId: number): Promise<OnboardingStatusResponse> {
    this.logger.log(`Fetching onboarding status for tenant ${tenantId}`);

    const [
      eldResult,
      driverResult,
      vehicleResult,
      loadResult,
      teamResult,
      operationsResult,
      sallyAiResult,
      shieldResult,
      fuelResult,
    ] = await Promise.all([
      this.checkEldIntegration(tenantId),
      this.checkActiveDrivers(tenantId),
      this.checkVehicles(tenantId),
      this.checkActiveLoads(tenantId),
      this.checkUsers(tenantId),
      this.checkPreferences(tenantId),
      this.checkSallyAiUsage(tenantId),
      this.checkShieldAudit(tenantId),
      this.checkFuelIntegration(tenantId),
    ]);

    const milestone1Items: OnboardingItem[] = [
      {
        id: 'eld',
        title: 'Connect ELD',
        description: 'Live HOS data for violation-free route planning',
        complete: eldResult.connected,
        statusText: eldResult.connected ? `${eldResult.connectedSystem} connected` : 'Not connected',
        actionLink: '/integrations/connections',
        actionType: 'console',
      },
      {
        id: 'drivers',
        title: 'Add Drivers',
        description: 'Every route needs a driver with HOS tracking',
        complete: driverResult.activeCount >= 1,
        statusText:
          driverResult.activeCount > 0
            ? `${driverResult.activeCount} active driver${driverResult.activeCount !== 1 ? 's' : ''}`
            : 'No active drivers',
        actionLink: '/drivers',
        actionType: 'link',
      },
      {
        id: 'vehicles',
        title: 'Add Vehicles',
        description: 'Fuel and capacity planning need vehicle specs',
        complete: vehicleResult.count >= 1,
        statusText:
          vehicleResult.count > 0
            ? `${vehicleResult.count} vehicle${vehicleResult.count !== 1 ? 's' : ''}`
            : 'No vehicles',
        actionLink: '/settings/fleet',
        actionType: 'link',
      },
    ];

    const milestone2Items: OnboardingItem[] = [
      {
        id: 'loads',
        title: 'Add Loads',
        description: 'Pickup, delivery, and time windows for route optimization',
        complete: loadResult.count >= 1,
        statusText:
          loadResult.count > 0 ? `${loadResult.count} active load${loadResult.count !== 1 ? 's' : ''}` : 'No loads yet',
        actionLink: '/dispatcher/loads',
        actionType: 'link',
      },
    ];

    const loadPaths: LoadPath[] = [
      {
        id: 'manual',
        title: 'Create Manually',
        description: 'Type in pickup, delivery, and load details',
        actionLink: '/dispatcher/loads',
        actionType: 'sheet',
      },
      {
        id: 'ratecon',
        title: 'Upload Rate Confirmation',
        description: 'Import from a PDF — SALLY reads it automatically',
        actionLink: '/dispatcher/loads',
        actionType: 'dialog',
      },
      {
        id: 'tms',
        title: 'Sync from Your TMS',
        description: 'Connect McLeod, TMW, or Project44 for auto-sync',
        actionLink: '/integrations/connections',
        actionType: 'console',
      },
    ];

    const milestone3Items: OnboardingItem[] = [
      {
        id: 'team',
        title: 'Invite Your Team',
        description: 'Dispatchers and admins for your operation',
        complete: teamResult.count > 1,
        statusText: teamResult.count > 1 ? `${teamResult.count} team members` : 'Just you',
        actionLink: '/team/members',
        actionType: 'console',
      },
      {
        id: 'operations',
        title: 'Configure Operations',
        description: 'Your HOS rules, optimization preferences, rest policies',
        complete: operationsResult.modified,
        statusText: operationsResult.modified ? 'Customized' : 'Using defaults',
        actionLink: '/configuration/operations',
        actionType: 'console',
      },
      {
        id: 'sally-ai',
        title: 'Meet Your AI Assistant',
        description: 'Ask SALLY anything about routes, HOS, or fleet status',
        complete: sallyAiResult.hasUsed,
        statusText: sallyAiResult.hasUsed ? "You've met SALLY" : "Haven't tried yet",
        actionLink: '',
        actionType: 'chat',
      },
      {
        id: 'shield',
        title: 'Run Your First Compliance Audit',
        description: 'Shield scans your fleet for HOS violations, driver issues, and compliance risks',
        complete: shieldResult.hasCompletedAudit,
        statusText: shieldResult.hasCompletedAudit
          ? `Score: ${shieldResult.lastScore} — ${shieldResult.lastStatus}`
          : 'Not run yet',
        actionLink: '/dispatcher/shield',
        actionType: 'link',
      },
      {
        id: 'fuel',
        title: 'Connect Fuel Card',
        description: 'Real fuel prices for smarter fuel stops',
        complete: fuelResult.connected,
        statusText: fuelResult.connected ? `${fuelResult.connectedSystem} connected` : 'Using average prices',
        actionLink: '/integrations/connections',
        actionType: 'console',
      },
    ];

    const m1Complete = milestone1Items.every((item) => item.complete);
    const m2Complete = milestone2Items.every((item) => item.complete);
    const m3Complete = milestone3Items.every((item) => item.complete);

    const milestones: MilestoneStatus[] = [
      {
        id: 'connect-fleet',
        title: 'Power Up Your Fleet',
        subtitle: 'Connect your fleet data so SALLY can see your operation in real-time',
        status: m1Complete ? 'complete' : 'in_progress',
        unlockMessage: 'Fleet Visibility is live — SALLY can see your drivers, vehicles, and HOS.',
        items: milestone1Items,
      },
      {
        id: 'bring-loads',
        title: 'Bring Your Loads',
        subtitle: 'Give SALLY something to plan — import or create your first loads',
        status: m2Complete ? 'complete' : m1Complete ? 'in_progress' : 'available',
        unlockMessage: 'Route Planning is ready — create your first optimized route.',
        items: milestone2Items,
        loadPaths,
      },
      {
        id: 'optimize',
        title: 'Optimize Your Operation',
        subtitle: 'Fine-tune SALLY to match how your fleet actually runs',
        status: m3Complete ? 'complete' : 'available',
        unlockMessage: 'Full Power — SALLY is fully tuned to your operation.',
        items: milestone3Items,
      },
    ];

    const allItems = [...milestone1Items, ...milestone2Items, ...milestone3Items];
    const totalItems = allItems.length;
    const completedItems = allItems.filter((i) => i.complete).length;
    const overallProgress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    return {
      overallProgress,
      completedItems,
      totalItems,
      milestones,
    };
  }

  private async checkEldIntegration(tenantId: number) {
    const integration = await this.prisma.integrationConfig.findFirst({
      where: {
        tenantId,
        integrationType: 'ELD',
        status: { in: ['ACTIVE', 'CONFIGURED'] },
      },
    });
    return {
      connected: !!integration,
      connectedSystem: integration?.vendor || null,
    };
  }

  private async checkActiveDrivers(tenantId: number) {
    const activeCount = await this.prisma.driver.count({
      where: { tenantId, status: { in: ['ACTIVE', 'PENDING_ACTIVATION'] } },
    });
    return { activeCount };
  }

  private async checkVehicles(tenantId: number) {
    const count = await this.prisma.vehicle.count({
      where: { tenantId, lifecycleStatus: 'ACTIVE' },
    });
    return { count };
  }

  private async checkActiveLoads(_tenantId: number) {
    // Note: Load model does not have tenantId. Loads are scoped via
    // driver/customer relationships. This counts all active loads system-wide
    // which is acceptable for single-tenant POC. Add tenantId filter when
    // the Load model gets a tenantId column.
    const statuses = ['DRAFT', 'PENDING', 'ASSIGNED', 'IN_TRANSIT'] as const;
    const count = await this.prisma.load.count({
      where: { status: { in: [...statuses] } },
    });
    return { count };
  }

  private async checkUsers(tenantId: number) {
    const count = await this.prisma.user.count({
      where: { tenantId },
    });
    return { count };
  }

  private async checkPreferences(tenantId: number) {
    const prefs = await this.prisma.fleetOperationsSettings.findUnique({
      where: { tenantId },
      select: { createdAt: true, updatedAt: true },
    });
    return {
      modified: prefs ? prefs.updatedAt.getTime() !== prefs.createdAt.getTime() : false,
    };
  }

  private async checkSallyAiUsage(tenantId: number) {
    const message = await this.prisma.conversationMessage.findFirst({
      where: {
        conversation: { tenantId },
        role: 'user',
      },
      select: { id: true },
    });
    return { hasUsed: !!message };
  }

  private async checkShieldAudit(tenantId: number) {
    const latestAudit = await this.prisma.shieldAudit.findFirst({
      where: { tenantId, status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
      select: { overallScore: true, statusLabel: true },
    });
    return {
      hasCompletedAudit: !!latestAudit,
      lastScore: latestAudit?.overallScore ?? null,
      lastStatus: latestAudit?.statusLabel ?? null,
    };
  }

  private async checkFuelIntegration(tenantId: number) {
    const settings = await this.prisma.fleetOperationsSettings.findUnique({
      where: { tenantId },
      select: { fuelCards: true },
    });
    const hasFuelCards = (settings?.fuelCards?.length ?? 0) > 0;
    return {
      connected: hasFuelCards,
      connectedSystem: hasFuelCards ? settings.fuelCards.join(', ') : null,
    };
  }
}
