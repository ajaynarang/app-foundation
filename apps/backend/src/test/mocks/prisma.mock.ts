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
  'accountingAccountMapping',
  'addOn',
  'addOnRequest',
  'alert',
  'alertConfiguration',
  'alertNote',
  'announcement',
  'apiKey',
  'billingCustomer',
  'billingInvoice',
  'billingOverride',
  'billingSubscription',
  'brandFuelCardAcceptance',
  'conversation',
  'conversationMessage',
  'trip',
  'customer',
  'customerContact',
  'document',
  'driver',
  'driverPayStructure',
  'driverPerformanceMetrics',
  'driverPreferences',
  'ediAutoAcceptRule',
  'ediMessage',
  'ediTradingPartner',
  'emailIngestAttachment',
  'emailIngestMessage',
  'emailIngestSettings',
  'emailIngestThread',
  'event',
  'factoringCompany',
  'factoringContact',
  'factoringTransaction',
  'featureFlag',
  'feedback',
  'fleetOperationsSettings',
  'fuelCardType',
  'hitlChallenge',
  'iftaFiling',
  'iftaFuelPurchase',
  'iftaQuarter',
  'iftaStateMileage',
  'iftaTaxRate',
  'integrationConfig',
  'integrationEntityMapping',
  'integrationExternalEntity',
  'invoice',
  'invoiceLineItem',
  'invoiceSettings',
  'invoiceShareLink',
  'job',
  'jobSchedule',
  'knowledgeDocument',
  'laneRateHistory',
  'lead',
  'load',
  'loadBoardSavedSearch',
  'loadLeg',
  'loadCharge',
  'loadEvent',
  'loadNote',
  'loadStop',
  'loginEvent',
  'noaRecord',
  'notification',
  'oAuthAccessToken',
  'oAuthAuthorizationCode',
  'oAuthClient',
  'oAuthRefreshToken',
  'payment',
  'paymentMethod',
  'planConfig',
  'planEntitlement',
  'processedBillingEvent',
  'pushSubscription',
  'recurringLane',
  'recurringLaneStop',
  'referenceData',
  'refreshToken',
  'routeEvent',
  'routePlan',
  'routePlanFeedback',
  'routePlanLoad',
  'routeSegment',
  'settlement',
  'settlementDeduction',
  'settlementLineItem',
  'shieldAudit',
  'shieldCustomRule',
  'shieldFinding',
  'shiftNote',
  'stop',
  'superAdminPreferences',
  'supportTicket',
  'supportTicketMessage',
  'tenant',
  'tenantAddOn',
  'tenantAddOnEvent',
  'tenantCounter',
  'tenantPlanEvent',
  'trailer',
  'trailerDVIR',
  'user',
  'userInvitation',
  'userPreferences',
  'vehicle',
  'vehicleDVIR',
  'vehicleTelematics',
  'vendorConfig',
  'wallet',
  'walletTransaction',
  'webhookDeliveryLog',
  'webhookSubscription',
  'domainEventLog',
  'deadLetterLog',
  'agentDefinition',
  'agentCapability',
  'agentEpisode',
  'agentInvocationLog',
  'agentMemory',
  'driverFleetPreferences',
  'deskAgent',
  'deskResponsibility',
  'deskEpisode',
  'deskEpisodeStep',
  'deskApproval',
  'deskMemory',
  'deskEntitySuppression',
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
