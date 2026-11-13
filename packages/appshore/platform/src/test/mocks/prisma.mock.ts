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
  'announcement',
  'apiKey',
  'billingCustomer',
  'billingInvoice',
  'billingSubscription',
  'conversation',
  'conversationMessage',
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
  'notificationDelivery',
  'notificationDevice',
  'oAuthAccessToken',
  'oAuthAuthorizationCode',
  'oAuthClient',
  'oAuthRefreshToken',
  'outboundAllowEntry',
  'outboundSuppression',
  'paymentMethod',
  'planConfig',
  'planEntitlement',
  'processedBillingEvent',
  'pushSubscription',
  'refreshToken',
  'whatsAppConsent',
  'passwordResetToken',
  'superAdminPreferences',
  'supportTicket',
  'supportTicketMessage',
  'tenant',
  'tenantAddOn',
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
  'outboxEvent',
  'deadline',
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
  'aiCredential',
  'tenantAiSubKey',
] as const;

export function createMockPrisma() {
  const prisma: Record<string, any> = {};

  for (const name of MODEL_NAMES) {
    prisma[name] = mockModel();
  }

  // $transaction runs the callback with the mock prisma itself as `tx`. The array form is refused: it is banned
  // (apps/backend/src/architecture/rls-no-array-transaction.spec.ts), so a unit test must not pass with it.
  prisma.$transaction = jest.fn().mockImplementation(async (fn: unknown) => {
    if (typeof fn !== 'function') {
      throw new TypeError(
        'array-form $transaction is banned: pass an interactive callback, $transaction(async (tx) => …)',
      );
    }
    return fn(prisma);
  });

  prisma.$executeRaw = jest.fn().mockResolvedValue(0);
  prisma.$queryRaw = jest.fn().mockResolvedValue([]);
  prisma.$queryRawUnsafe = jest.fn().mockResolvedValue([]);
  prisma.$connect = jest.fn().mockResolvedValue(undefined);
  prisma.$disconnect = jest.fn().mockResolvedValue(undefined);

  return prisma as any;
}
