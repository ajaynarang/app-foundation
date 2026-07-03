import { Test } from '@nestjs/testing';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { getQueueToken } from '@nestjs/bullmq';
import { AgentInvocationLoggerService } from '../../../domains/ai/agent-contract/agent-invocation-logger.service';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { FeatureFlagsService } from '@appshore/platform/domains/feature-flags/feature-flags.service';
import { DomainEventService } from '@appshore/kernel/infrastructure/events/domain-event.service';
import { WebhookDispatcher } from '../dispatcher.service';
import { QUEUE_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import { DomainEvent } from '@appshore/kernel/infrastructure/events/domain-event';
import { DOMAIN_EVENTS } from '../../events/domain-events.constants';

/**
 * Integration smoke: AgentInvocationLoggerService → DomainEventService
 * → WebhookDispatcher → WebhookDeliveryLog.
 *
 * The key invariant under test: a sentinel string planted in the Prisma row's
 * `argsRaw` column MUST NOT appear anywhere in the payload that reaches
 * `webhookDeliveryLog.create()`. This guards against a regression where a
 * future edit to AgentInvocationLoggerService#toWebhookPayload accidentally
 * spreads the whole row into the event data.
 */
describe('app.agent.invocation-completed webhook integration', () => {
  const SENTINEL = '123-45-6789';
  const logRowTemplate = {
    id: 'row-1',
    tenantId: 7,
    principalKind: 'api_key',
    principalId: 'ak1',
    principalLabel: 'BI script',
    toolName: 'driver-create',
    scopeRequired: 'fleet:write',
    hitlTier: 'standard',
    argsDigest: 'd1',
    argsRedacted: { name: 'Jane' },
    argsRaw: { ssn: SENTINEL, name: 'Jane' }, // NEVER leaves the backend
    success: true,
    durationMs: 42,
    error: null,
    outputSummary: null,
    piiReadFlag: false,
    confirmationTokenId: null,
    langfuseTraceId: 'lf-x',
    requestId: 'req-1',
    createdAt: new Date('2026-04-20T12:00:00Z'),
  };

  const mockPrisma = {
    agentInvocationLog: {
      update: jest.fn(),
    },
    tenant: {
      findUnique: jest.fn(),
    },
    webhookSubscription: {
      findMany: jest.fn(),
    },
    webhookDeliveryLog: {
      create: jest.fn(),
    },
  };
  const mockWebhookQueue = { add: jest.fn().mockResolvedValue(undefined) };
  const mockDomainEventQueue = { add: jest.fn().mockResolvedValue(undefined) };
  const mockFlags = { isEnabled: jest.fn().mockResolvedValue(true) };

  let logger: AgentInvocationLoggerService;
  let eventService: DomainEventService;
  let dispatcher: WebhookDispatcher;
  let emitter: EventEmitter2;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.agentInvocationLog.update.mockResolvedValue({
      ...logRowTemplate,
    });
    mockPrisma.tenant.findUnique.mockResolvedValue({ id: 7 });
    mockPrisma.webhookSubscription.findMany.mockResolvedValue([
      {
        id: 'sub-1',
        tenantId: 7,
        url: 'https://example.test/hook',
        events: ['app.agent.*', DOMAIN_EVENTS.AGENT_INVOCATION_COMPLETED],
        active: true,
      },
    ]);
    mockPrisma.webhookDeliveryLog.create.mockResolvedValue({ id: 'log-1' });

    const module = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot({ wildcard: true })],
      providers: [
        AgentInvocationLoggerService,
        DomainEventService,
        WebhookDispatcher,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: FeatureFlagsService, useValue: mockFlags },
        {
          provide: getQueueToken(QUEUE_NAMES.EVENTS),
          useValue: mockDomainEventQueue,
        },
        {
          provide: getQueueToken(QUEUE_NAMES.WEBHOOKS),
          useValue: mockWebhookQueue,
        },
      ],
    }).compile();

    logger = module.get(AgentInvocationLoggerService);
    eventService = module.get(DomainEventService);
    dispatcher = module.get(WebhookDispatcher);
    emitter = module.get(EventEmitter2);

    // Wire the dispatcher to listen for the event (mirrors real runtime wiring).
    emitter.on(DOMAIN_EVENTS.AGENT_INVOCATION_COMPLETED, async (event: DomainEvent) => {
      await dispatcher.dispatchEvent(event);
    });
  });

  it('dispatches enriched payload to matching subscriptions', async () => {
    await logger.completeSuccess({
      rowId: 'row-1',
      tenantId: 7,
      durationMs: 42,
      outputSummary: null,
    });

    // Give the hot-path listener a tick to run.
    await new Promise((r) => setImmediate(r));

    expect(mockPrisma.webhookDeliveryLog.create).toHaveBeenCalledTimes(1);
    const createCall = mockPrisma.webhookDeliveryLog.create.mock.calls[0][0];
    expect(createCall.data.subscriptionId).toBe('sub-1');
    expect(createCall.data.event).toBe(DOMAIN_EVENTS.AGENT_INVOCATION_COMPLETED);
    // Enriched fields present
    expect(createCall.data.payload.data).toEqual(
      expect.objectContaining({
        principalKind: 'api_key',
        principalId: 'ak1',
        toolName: 'driver-create',
        scopeRequired: 'fleet:write',
        hitlTier: 'standard',
        argsRedacted: { name: 'Jane' },
        success: true,
      }),
    );
  });

  it('argsRaw sentinel never appears anywhere in the dispatched payload', async () => {
    await logger.completeSuccess({
      rowId: 'row-1',
      tenantId: 7,
      durationMs: 42,
      outputSummary: null,
    });
    await new Promise((r) => setImmediate(r));

    expect(mockPrisma.webhookDeliveryLog.create).toHaveBeenCalled();
    const createCall = mockPrisma.webhookDeliveryLog.create.mock.calls[0][0];
    const serialized = JSON.stringify(createCall);
    expect(serialized).not.toContain(SENTINEL);
    expect(createCall.data.payload.data).not.toHaveProperty('argsRaw');
    expect(createCall.data.payload.data).not.toHaveProperty('piiReadFlag');
  });

  it('error path also projects payload without argsRaw', async () => {
    mockPrisma.agentInvocationLog.update.mockResolvedValue({
      ...logRowTemplate,
      success: false,
      error: 'boom',
    });

    await logger.completeError({
      rowId: 'row-1',
      tenantId: 7,
      durationMs: 10,
      error: 'boom',
    });
    await new Promise((r) => setImmediate(r));

    expect(mockPrisma.webhookDeliveryLog.create).toHaveBeenCalled();
    const createCall = mockPrisma.webhookDeliveryLog.create.mock.calls[0][0];
    expect(JSON.stringify(createCall)).not.toContain(SENTINEL);
    expect(createCall.data.payload.data.success).toBe(false);
    expect(createCall.data.payload.data.error).toBe('boom');
  });

  it('no subscriptions → dispatcher no-ops (no delivery-log write)', async () => {
    mockPrisma.webhookSubscription.findMany.mockResolvedValue([]);
    await logger.completeSuccess({
      rowId: 'row-1',
      tenantId: 7,
      durationMs: 42,
      outputSummary: null,
    });
    await new Promise((r) => setImmediate(r));

    expect(mockPrisma.webhookDeliveryLog.create).not.toHaveBeenCalled();
    expect(mockWebhookQueue.add).not.toHaveBeenCalled();
  });

  it('works with wildcard app.agent.* subscription', async () => {
    mockPrisma.webhookSubscription.findMany.mockResolvedValue([
      {
        id: 'sub-wild',
        tenantId: 7,
        url: 'https://example.test/wildcard',
        events: ['*'],
        active: true,
      },
    ]);
    await logger.completeSuccess({
      rowId: 'row-1',
      tenantId: 7,
      durationMs: 42,
      outputSummary: null,
    });
    await new Promise((r) => setImmediate(r));

    expect(mockPrisma.webhookDeliveryLog.create).toHaveBeenCalled();
    const createCall = mockPrisma.webhookDeliveryLog.create.mock.calls[0][0];
    expect(JSON.stringify(createCall)).not.toContain(SENTINEL);

    // Silence unused-var lint for eventService — it's imported for the wiring
    // side-effect and used implicitly via the listener bound in beforeEach.
    expect(eventService).toBeDefined();
  });
});
