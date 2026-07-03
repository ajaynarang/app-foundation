import { Test } from '@nestjs/testing';
import { AgentInvocationLoggerService } from '../agent-invocation-logger.service';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { DomainEventService } from '@appshore/kernel/infrastructure/events/domain-event.service';
import { DOMAIN_EVENTS } from '../../../../platform-glue/events/domain-events.constants';
import { createMockPrisma } from '@appshore/platform/test/mocks/prisma.mock';
import { fromUser } from '@appshore/platform/auth/agent-principal';
import { digestArgs } from '../arg-redactor';

describe('AgentInvocationLoggerService', () => {
  const prisma = createMockPrisma();
  const events = { emit: jest.fn() };
  let svc: AgentInvocationLoggerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        AgentInvocationLoggerService,
        { provide: PrismaService, useValue: prisma },
        { provide: DomainEventService, useValue: events },
      ],
    }).compile();
    svc = mod.get(AgentInvocationLoggerService);
  });

  it('writePending inserts a row with redacted args', async () => {
    prisma.agentInvocationLog.create.mockResolvedValue({ id: 'row-1' });
    const id = await svc.writePending({
      principal: fromUser({ userId: 42, tenantId: 7, role: 'MEMBER' }),
      toolName: 'query-loads',
      scopeRequired: 'platform:read',
      hitlTier: 'none',
      args: { _tenantId: 7, status: 'active', email: 'a@b.com' },
    });
    expect(id).toBe('row-1');
    const data = prisma.agentInvocationLog.create.mock.calls[0][0].data;
    expect(data.tenantId).toBe(7);
    expect(data.principalKind).toBe('user');
    expect(data.argsRedacted).toEqual({
      status: 'active',
      email: '[redacted-email]',
    });
    expect(data.hitlTier).toBe('none');
    expect(data.argsDigest).toBe(digestArgs({ status: 'active', email: '[redacted-email]' }));
  });

  it('completeSuccess updates the row and emits invocation-completed', async () => {
    prisma.agentInvocationLog.update.mockResolvedValue({
      id: 'row-1',
      tenantId: 7,
      principalKind: 'user',
      principalId: '42',
      principalLabel: null,
      toolName: 'query-loads',
      scopeRequired: 'documents:read',
      hitlTier: 'none',
      argsDigest: 'd1',
      argsRedacted: {},
      argsRaw: null,
      success: true,
      durationMs: 42,
      error: null,
      outputSummary: 'ok',
      piiReadFlag: false,
      confirmationTokenId: null,
      langfuseTraceId: null,
      requestId: null,
      createdAt: new Date('2026-04-20T12:00:00Z'),
    });
    await svc.completeSuccess({
      rowId: 'row-1',
      tenantId: 7,
      durationMs: 42,
      outputSummary: 'ok',
    });
    const args = prisma.agentInvocationLog.update.mock.calls[0][0];
    expect(args.where).toEqual({ id: 'row-1' });
    expect(args.data.success).toBe(true);
    expect(args.data.durationMs).toBe(42);
    expect(events.emit).toHaveBeenCalledWith(
      expect.stringMatching(/app\.agent\.invocation-completed/),
      '7',
      expect.objectContaining({ success: true }),
    );
  });

  it('emits AGENT_INVOCATION_COMPLETED with enriched, argsRaw-free payload', async () => {
    const rowId = 'row-1';
    prisma.agentInvocationLog.update.mockResolvedValue({
      id: rowId,
      tenantId: 7,
      principalKind: 'api_key',
      principalId: 'ak1',
      principalLabel: 'BI script',
      toolName: 'query-loads',
      scopeRequired: 'documents:read',
      hitlTier: 'none',
      argsDigest: 'd1',
      argsRedacted: { status: 'active' },
      argsRaw: { status: 'active', _tenantId: 7, _userId: 42 },
      success: true,
      durationMs: 17,
      error: null,
      outputSummary: 'count: 3',
      piiReadFlag: false,
      confirmationTokenId: null,
      langfuseTraceId: 'lf-xyz',
      requestId: 'req-1',
      createdAt: new Date('2026-04-20T12:00:00Z'),
    });

    await svc.completeSuccess({
      rowId,
      tenantId: 7,
      durationMs: 17,
      outputSummary: 'count: 3',
    });

    expect(events.emit).toHaveBeenCalledWith(
      DOMAIN_EVENTS.AGENT_INVOCATION_COMPLETED,
      '7',
      expect.objectContaining({
        rowId,
        success: true,
        durationMs: 17,
        principalKind: 'api_key',
        principalId: 'ak1',
        principalLabel: 'BI script',
        toolName: 'query-loads',
        scopeRequired: 'documents:read',
        hitlTier: 'none',
        argsRedacted: { status: 'active' },
        outputSummary: 'count: 3',
        langfuseTraceId: 'lf-xyz',
        requestId: 'req-1',
      }),
    );
    const payload = events.emit.mock.calls[0][2];
    expect(payload).not.toHaveProperty('argsRaw');
    expect(payload).not.toHaveProperty('piiReadFlag');
  });

  it('completeError updates the row with error and emits with success=false', async () => {
    prisma.agentInvocationLog.update.mockResolvedValue({
      id: 'row-1',
      tenantId: 7,
      principalKind: 'user',
      principalId: '42',
      principalLabel: null,
      toolName: 'query-loads',
      scopeRequired: 'documents:read',
      hitlTier: 'none',
      argsDigest: 'd1',
      argsRedacted: {},
      argsRaw: null,
      success: false,
      durationMs: 10,
      error: 'boom',
      outputSummary: null,
      piiReadFlag: false,
      confirmationTokenId: null,
      langfuseTraceId: null,
      requestId: null,
      createdAt: new Date('2026-04-20T12:00:00Z'),
    });
    await svc.completeError({
      rowId: 'row-1',
      tenantId: 7,
      durationMs: 10,
      error: 'boom',
    });
    const args = prisma.agentInvocationLog.update.mock.calls[0][0];
    expect(args.data.success).toBe(false);
    expect(args.data.error).toBe('boom');
    expect(events.emit).toHaveBeenCalledWith(
      expect.any(String),
      '7',
      expect.objectContaining({ success: false, error: 'boom' }),
    );
  });

  it('argsRaw sentinel never leaves the backend — success and error paths', async () => {
    const SENTINEL = '123-45-6789';
    const baseRow = {
      id: 'row-1',
      tenantId: 7,
      principalKind: 'user' as const,
      principalId: '42',
      principalLabel: null,
      toolName: 'driver-create',
      scopeRequired: 'platform:write',
      hitlTier: 'standard',
      argsDigest: 'd1',
      argsRedacted: { name: 'Jane' },
      argsRaw: { ssn: SENTINEL, name: 'Jane' },
      outputSummary: null,
      piiReadFlag: false,
      confirmationTokenId: null,
      langfuseTraceId: null,
      requestId: null,
      createdAt: new Date('2026-04-20T12:00:00Z'),
    };

    // Success path
    prisma.agentInvocationLog.update.mockResolvedValueOnce({
      ...baseRow,
      success: true,
      durationMs: 42,
      error: null,
    });
    await svc.completeSuccess({
      rowId: 'row-1',
      tenantId: 7,
      durationMs: 42,
      outputSummary: null,
    });
    const successPayload = events.emit.mock.calls[0][2];
    expect(JSON.stringify(successPayload)).not.toContain(SENTINEL);
    expect(successPayload).not.toHaveProperty('argsRaw');

    // Error path
    events.emit.mockClear();
    prisma.agentInvocationLog.update.mockResolvedValueOnce({
      ...baseRow,
      success: false,
      durationMs: 10,
      error: 'boom',
    });
    await svc.completeError({
      rowId: 'row-1',
      tenantId: 7,
      durationMs: 10,
      error: 'boom',
    });
    const errorPayload = events.emit.mock.calls[0][2];
    expect(JSON.stringify(errorPayload)).not.toContain(SENTINEL);
    expect(errorPayload).not.toHaveProperty('argsRaw');
  });

  it('complete* are no-ops when rowId is null', async () => {
    await svc.completeSuccess({
      rowId: null,
      tenantId: 1,
      durationMs: 1,
      outputSummary: null,
    });
    await svc.completeError({
      rowId: null,
      tenantId: 1,
      durationMs: 1,
      error: 'x',
    });
    expect(prisma.agentInvocationLog.update).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });
});
