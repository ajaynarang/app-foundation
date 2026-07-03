import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { OnboardingStatusResponse, OnboardingItem, MilestoneStatus } from './dto/onboarding-status.dto';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(private prisma: PrismaService) {}

  async getOnboardingStatus(tenantId: number): Promise<OnboardingStatusResponse> {
    this.logger.log(`Fetching onboarding status for tenant ${tenantId}`);

    const [profileResult, teamResult, integrationResult, aiResult] = await Promise.all([
      this.checkProfile(tenantId),
      this.checkUsers(tenantId),
      this.checkIntegration(tenantId),
      this.checkAiUsage(tenantId),
    ]);

    const setupItems: OnboardingItem[] = [
      {
        id: 'profile',
        title: 'Complete Your Profile',
        description: 'Set up your organization name and contact details',
        complete: profileResult.complete,
        statusText: profileResult.complete ? 'Profile complete' : 'Needs details',
        actionLink: '/settings/organization',
        actionType: 'link',
      },
      {
        id: 'team',
        title: 'Invite Your Team',
        description: 'Add admins and members to your workspace',
        complete: teamResult.count > 1,
        statusText: teamResult.count > 1 ? `${teamResult.count} team members` : 'Just you',
        actionLink: '/settings/users',
        actionType: 'console',
      },
    ];

    const integrationItems: OnboardingItem[] = [
      {
        id: 'integrations',
        title: 'Connect an Integration',
        description: 'Link an external system to sync data automatically',
        complete: integrationResult.connected,
        statusText: integrationResult.connected ? `${integrationResult.connectedSystem} connected` : 'Not connected',
        actionLink: '/settings/integrations',
        actionType: 'console',
      },
    ];

    const finishItems: OnboardingItem[] = [
      {
        id: 'ai',
        title: 'Meet Your AI Assistant',
        description: 'Ask the assistant anything about your workspace',
        complete: aiResult.hasUsed,
        statusText: aiResult.hasUsed ? "You've said hello" : "Haven't tried yet",
        actionLink: '',
        actionType: 'chat',
      },
    ];

    const setupComplete = setupItems.every((item) => item.complete);
    const integrationComplete = integrationItems.every((item) => item.complete);
    const finishComplete = finishItems.every((item) => item.complete);

    const milestones: MilestoneStatus[] = [
      {
        id: 'setup',
        title: 'Set Up Your Workspace',
        subtitle: 'Complete your profile and bring your team aboard',
        status: setupComplete ? 'complete' : 'in_progress',
        unlockMessage: 'Your workspace is ready.',
        items: setupItems,
      },
      {
        id: 'integrations',
        title: 'Connect Your Tools',
        subtitle: 'Link the external systems your team already uses',
        status: integrationComplete ? 'complete' : setupComplete ? 'in_progress' : 'available',
        unlockMessage: 'Integrations are live — your data stays in sync.',
        items: integrationItems,
      },
      {
        id: 'done',
        title: 'You Are All Set',
        subtitle: 'Get the most out of your assistant',
        status: finishComplete ? 'complete' : 'available',
        unlockMessage: 'You are fully set up.',
        items: finishItems,
      },
    ];

    const allItems = [...setupItems, ...integrationItems, ...finishItems];
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

  private async checkProfile(tenantId: number) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { companyName: true, contactEmail: true },
    });
    return {
      complete: !!tenant && !!tenant.companyName && !!tenant.contactEmail,
    };
  }

  private async checkIntegration(tenantId: number) {
    const integration = await this.prisma.integrationConfig.findFirst({
      where: {
        tenantId,
        status: { in: ['ACTIVE', 'CONFIGURED'] },
      },
    });
    return {
      connected: !!integration,
      connectedSystem: integration?.vendor || null,
    };
  }

  private async checkUsers(tenantId: number) {
    const count = await this.prisma.user.count({
      where: { tenantId },
    });
    return { count };
  }

  private async checkAiUsage(tenantId: number) {
    const message = await this.prisma.conversationMessage.findFirst({
      where: {
        conversation: { tenantId },
        role: 'user',
      },
      select: { id: true },
    });
    return { hasUsed: !!message };
  }
}
