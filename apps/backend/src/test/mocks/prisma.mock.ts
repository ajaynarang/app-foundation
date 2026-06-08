/**
 * Mock Prisma client for unit tests.
 * Provides jest.fn() stubs for all model operations and utility methods.
 */

function mockModel() {
  return {
    findFirst: jest.fn(),
    findFirstOrThrow: jest.fn(),
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    // Default to an empty list — the correct Prisma semantic for a list query.
    // Services that fan out over many models (e.g. global search) otherwise
    // crash on `.map` of an unstubbed model. Tests override as needed.
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
    groupBy: jest.fn(),
  };
}

const MODEL_NAMES = [
  'addOn',
  'addOnRequest',
  'announcement',
  'apiKey',
  'billingCustomer',
  'billingInvoice',
  'billingSubscription',
  'conversation',
  'conversationMessage',
  'document',
  'featureFlag',
  'feedback',
  'hitlChallenge',
  'integrationConfig',
  'integrationEntityMapping',
  'integrationExternalEntity',
  'job',
  'jobSchedule',
  'knowledgeDocument',
  'loginEvent',
  'notification',
  'oAuthAccessToken',
  'oAuthAuthorizationCode',
  'oAuthClient',
  'oAuthRefreshToken',
  'paymentMethod',
  'planConfig',
  'planEntitlement',
  'processedBillingEvent',
  'pushSubscription',
  'refreshToken',
  'superAdminPreferences',
  'supportTicket',
  'supportTicketMessage',
  'tenant',
  'tenantAddOn',
  'tenantAddOnEvent',
  'tenantCounter',
  'tenantPlanEvent',
  'user',
  'userInvitation',
  'userPreferences',
  'vendorConfig',
  'wallet',
  'walletTransaction',
  'webhookDeliveryLog',
  'webhookSubscription',
  'domainEventLog',
  'deadLetterLog',
  'agentInvocationLog',
  'deskAgent',
  'deskResponsibility',
  'deskEpisode',
  'deskEpisodeStep',
  'deskApproval',
  'deskMemory',
  'deskEntitySuppression',
  'tenantJobRun',
  'aiInvocation',
  'modelPricing',
  'tenantAiBudget',
] as const;

export function createMockPrisma() {
  const prisma: Record<string, any> = {};

  for (const name of MODEL_NAMES) {
    prisma[name] = mockModel();
  }

  // $transaction executes callback with the mock prisma itself
  prisma.$transaction = jest.fn().mockImplementation(async (cbOrArray: any) => {
    if (typeof cbOrArray === 'function') {
      return cbOrArray(prisma);
    }
    // Array of promises
    return Promise.all(cbOrArray);
  });

  prisma.$executeRaw = jest.fn().mockResolvedValue(0);
  prisma.$queryRaw = jest.fn().mockResolvedValue([]);
  prisma.$queryRawUnsafe = jest.fn().mockResolvedValue([]);
  prisma.$connect = jest.fn().mockResolvedValue(undefined);
  prisma.$disconnect = jest.fn().mockResolvedValue(undefined);

  return prisma as any;
}
