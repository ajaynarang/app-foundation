import { BadRequestException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../../../infrastructure/events/domain-event.service';
import { DOMAIN_EVENTS } from '../../../../../infrastructure/events/sally-events.constants';
import { createMockPrisma } from '../../../../../test/mocks/prisma.mock';

import { ApprovalEnrichmentService } from '../../approval/approval-enrichment.service';
import { DeskEpisodeService, pickMostRecentDecidedApproval } from '../desk-episode.service';

function makeEvents() {
  return { emit: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<DomainEventService>;
}

/**
 * Fixtures — minimal Prisma rows shaped to what the service includes.
 *
 * Notes:
 *   • `entitySuppressions` relation does not exist in Prisma yet (T27f
 *     adds it). Task 6's mapper returns `activeSuppression: null` as a
 *     placeholder; helpers stub the array here as an empty array so the
 *     spec exercises the mapper's fallback path.
 *   • Coverage targets: listForTenant (default + scope), getForTenant
 *     (found + not-found), listHandled (rows, scope=mine empty, edited
 *     approval, suppression placeholder, autonomousPct summary, cursor).
 */

const baseEpisode = {
  id: 'ep-1',
  tenantId: 10,
  responsibility: { key: 'ar_followup', title: 'AR Follow-up' },
  ownerAgent: { key: 'autumn', displayName: 'Autumn', name: 'Autumn' },
  trustLevelSnapshot: 'SUPERVISED' as const,
  triggerKind: 'SCHEDULED' as const,
  triggerLabel: 'Nightly sweep',
  triggerFiredAt: new Date('2026-04-24T09:00:00Z'),
  entityType: 'invoice',
  entityId: 'inv-1',
  entityLabel: 'Invoice NL-INV-1015',
  status: 'RESOLVED',
  priority: 'NORMAL',
  dedupeKey: 'dedupe-1',
  outcome: 'followup_sent',
  outcomeNote: null,
  temporalWorkflowId: 'wf-1',
  temporalRunId: 'run-1',
  openedAt: new Date('2026-04-24T09:00:00Z'),
  updatedAt: new Date('2026-04-24T09:05:00Z'),
  closedAt: new Date('2026-04-24T09:06:00Z'),
  expiresAt: null,
  triggerSource: 'cron',
  triggerPayload: null,
  conditionsSnapshot: {},
};

function makePrismaForHandled(closedAtIso: string) {
  const prisma = createMockPrisma();
  prisma.deskEpisode.findMany.mockResolvedValue([
    {
      ...baseEpisode,
      id: 'ep-1',
      closedAt: new Date(closedAtIso),
      approvals: [],
      entitySuppressions: [],
    },
    {
      ...baseEpisode,
      id: 'ep-2',
      closedAt: new Date(closedAtIso),
      outcome: 'promise_recorded',
      approvals: [],
      entitySuppressions: [],
    },
  ]);
  return prisma;
}

function makePrismaWithEditedApproval(closedAtIso: string) {
  const prisma = createMockPrisma();
  prisma.deskEpisode.findMany.mockResolvedValue([
    {
      ...baseEpisode,
      id: 'ep-edited',
      closedAt: new Date(closedAtIso),
      approvals: [
        {
          decision: 'EDITED',
          decidedByUserId: 42,
          decidedBy: { firstName: 'Ada', lastName: 'Lovelace' },
        },
      ],
      entitySuppressions: [],
    },
  ]);
  return prisma;
}

function makePrismaWithActiveSuppression(closedAtIso: string) {
  const prisma = createMockPrisma();
  prisma.deskEpisode.findMany.mockResolvedValue([
    {
      ...baseEpisode,
      id: 'ep-sup',
      closedAt: new Date(closedAtIso),
      approvals: [],
      entitySuppressions: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          suppressUntil: new Date('2099-05-24T00:00:00Z'),
        },
      ],
    },
  ]);
  return prisma;
}

function makePrismaWithForeverSuppression(closedAtIso: string) {
  const prisma = createMockPrisma();
  prisma.deskEpisode.findMany.mockResolvedValue([
    {
      ...baseEpisode,
      id: 'ep-sup-forever',
      closedAt: new Date(closedAtIso),
      approvals: [],
      entitySuppressions: [
        {
          id: '22222222-2222-2222-2222-222222222222',
          suppressUntil: null,
        },
      ],
    },
  ]);
  return prisma;
}

function makePrismaForAutonomousPct(closedAtIso: string) {
  const prisma = createMockPrisma();
  prisma.deskEpisode.findMany.mockResolvedValue([
    {
      ...baseEpisode,
      id: 'ep-a1',
      closedAt: new Date(closedAtIso),
      approvals: [],
      entitySuppressions: [],
    },
    {
      ...baseEpisode,
      id: 'ep-a2',
      closedAt: new Date(closedAtIso),
      approvals: [],
      entitySuppressions: [],
    },
    {
      ...baseEpisode,
      id: 'ep-a3',
      closedAt: new Date(closedAtIso),
      approvals: [{ decision: 'APPROVED', decidedByUserId: 7, decidedBy: { firstName: 'Bob', lastName: 'Smith' } }],
      entitySuppressions: [],
    },
  ]);
  return prisma;
}

describe('DeskEpisodeService', () => {
  let service: DeskEpisodeService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let events: jest.Mocked<DomainEventService>;

  beforeEach(() => {
    prisma = createMockPrisma();
    events = makeEvents();
    const enrichment = new ApprovalEnrichmentService();
    service = new DeskEpisodeService(prisma as unknown as PrismaService, enrichment, events);
  });

  describe('listForTenant', () => {
    it('default — unrestricted tenant-wide query with cursor pagination', async () => {
      prisma.deskEpisode.findMany.mockResolvedValue([
        { ...baseEpisode, id: 'ep-a' },
        { ...baseEpisode, id: 'ep-b' },
      ]);
      const result = await service.listForTenant(10, { limit: 25 } as any);
      expect(result.rows).toHaveLength(2);
      expect(result.nextCursor).toBeNull();
      const call = prisma.deskEpisode.findMany.mock.calls[0][0];
      expect(call.where.tenantId).toBe(10);
    });

    it('scope=mine with no currentUserId forces no-match', async () => {
      prisma.deskEpisode.findMany.mockResolvedValue([]);
      await service.listForTenant(10, { limit: 25, scope: 'mine' } as any);
      const call = prisma.deskEpisode.findMany.mock.calls[0][0];
      expect(call.where.id).toBe('__no_match__');
    });

    it('scope=mine with currentUserId filters by supervisor', async () => {
      prisma.deskEpisode.findMany.mockResolvedValue([]);
      await service.listForTenant(10, { limit: 25, scope: 'mine' } as any, { currentUserId: 99 });
      const call = prisma.deskEpisode.findMany.mock.calls[0][0];
      expect(call.where.ownerAgent).toEqual({ supervisorUserId: 99 });
    });

    it('status filter passes through', async () => {
      prisma.deskEpisode.findMany.mockResolvedValue([]);
      await service.listForTenant(10, { limit: 25, status: 'RUNNING' } as any);
      const call = prisma.deskEpisode.findMany.mock.calls[0][0];
      expect(call.where.status).toBe('RUNNING');
    });

    it('no status filter → defaults to the Needs-you set (handled episodes never leak in)', async () => {
      prisma.deskEpisode.findMany.mockResolvedValue([]);
      await service.listForTenant(10, { limit: 25 } as any);
      const call = prisma.deskEpisode.findMany.mock.calls[0][0];
      // ESCALATED + WAITING_APPROVAL in; RESOLVED out.
      expect(call.where.status.in).toEqual(expect.arrayContaining(['RUNNING', 'WAITING_APPROVAL', 'ESCALATED']));
      expect(call.where.status.in).not.toContain('RESOLVED');
    });

    it('explicit status=ESCALATED still works (the Escalated chip)', async () => {
      prisma.deskEpisode.findMany.mockResolvedValue([]);
      await service.listForTenant(10, { limit: 25, status: 'ESCALATED' } as any);
      const call = prisma.deskEpisode.findMany.mock.calls[0][0];
      expect(call.where.status).toBe('ESCALATED');
    });

    it('hasMore=true returns a cursor', async () => {
      const rows = Array.from({ length: 3 }, (_, i) => ({ ...baseEpisode, id: `ep-${i}` }));
      prisma.deskEpisode.findMany.mockResolvedValue(rows);
      const result = await service.listForTenant(10, { limit: 2 } as any);
      expect(result.rows).toHaveLength(2);
      expect(result.nextCursor).toContain('|ep-1');
    });

    it('cursor parses and forwards into where', async () => {
      prisma.deskEpisode.findMany.mockResolvedValue([]);
      const cur = `${new Date('2026-04-24T09:00:00Z').toISOString()}|ep-last`;
      await service.listForTenant(10, { limit: 25, cursor: cur } as any);
      const call = prisma.deskEpisode.findMany.mock.calls[0][0];
      expect(call.where.OR).toBeDefined();
    });

    it('malformed cursor is ignored', async () => {
      prisma.deskEpisode.findMany.mockResolvedValue([]);
      await service.listForTenant(10, { limit: 25, cursor: 'garbage' } as any);
      const call = prisma.deskEpisode.findMany.mock.calls[0][0];
      expect(call.where.OR).toBeUndefined();
    });
  });

  describe('getForTenant', () => {
    it('returns the detail payload when found', async () => {
      prisma.deskEpisode.findFirst.mockResolvedValue({
        ...baseEpisode,
        steps: [],
        approvals: [],
        conditionsSnapshot: {},
        entitySuppressions: [],
      });
      const result = await service.getForTenant(10, 'ep-1');
      expect(result.id).toBe('ep-1');
      expect(result.steps).toEqual([]);
      expect(result.approvals).toEqual([]);
      // Task 7: new fields on the detail payload.
      expect(result.mostRecentDecidedApproval).toBeNull();
      expect(result.activeSuppression).toBeNull();
    });

    it('detail payload includes activeSuppression when the join returns an unexpired row', async () => {
      prisma.deskEpisode.findFirst.mockResolvedValue({
        ...baseEpisode,
        steps: [],
        approvals: [],
        conditionsSnapshot: {},
        entitySuppressions: [
          { id: '33333333-3333-3333-3333-333333333333', suppressUntil: new Date('2099-06-01T00:00:00Z') },
        ],
      });
      const result = await service.getForTenant(10, 'ep-1');
      expect(result.activeSuppression).toEqual({
        id: '33333333-3333-3333-3333-333333333333',
        suppressUntil: '2099-06-01T00:00:00.000Z',
      });
    });

    it('detail payload surfaces a null suppressUntil for "forever" snoozes', async () => {
      prisma.deskEpisode.findFirst.mockResolvedValue({
        ...baseEpisode,
        steps: [],
        approvals: [],
        conditionsSnapshot: {},
        entitySuppressions: [{ id: '44444444-4444-4444-4444-444444444444', suppressUntil: null }],
      });
      const result = await service.getForTenant(10, 'ep-1');
      expect(result.activeSuppression).toEqual({
        id: '44444444-4444-4444-4444-444444444444',
        suppressUntil: null,
      });
    });

    it('picks the most-recently-decided approval for Handled-mode diff', async () => {
      prisma.deskEpisode.findFirst.mockResolvedValue({
        ...baseEpisode,
        responsibility: { key: 'generic_responsibility', title: 'Generic' },
        conditionsSnapshot: {},
        steps: [],
        approvals: [
          {
            id: 'app-old',
            episodeId: 'ep-1',
            stepId: 'step-1',
            requestedAt: new Date('2026-04-24T09:00:00Z'),
            expiresAt: new Date('2026-05-01T09:00:00Z'),
            proposedAction: { kind: 'send_email', body: 'v1' },
            claimedByUserId: null,
            claimedAt: null,
            decision: 'APPROVED',
            decidedByUserId: 1,
            decidedAt: new Date('2026-04-24T09:05:00Z'),
            editedAction: null,
            rejectionReason: null,
            terminateEpisode: false,
          },
          {
            id: 'app-new',
            episodeId: 'ep-1',
            stepId: 'step-2',
            requestedAt: new Date('2026-04-24T10:00:00Z'),
            expiresAt: new Date('2026-05-01T10:00:00Z'),
            proposedAction: { kind: 'send_email', body: 'proposed v2' },
            claimedByUserId: null,
            claimedAt: null,
            decision: 'EDITED',
            decidedByUserId: 2,
            decidedAt: new Date('2026-04-24T10:05:00Z'),
            editedAction: { kind: 'send_email', body: 'final v2' },
            rejectionReason: null,
            terminateEpisode: false,
          },
          {
            id: 'app-pending',
            episodeId: 'ep-1',
            stepId: 'step-3',
            requestedAt: new Date('2026-04-24T11:00:00Z'),
            expiresAt: new Date('2026-05-01T11:00:00Z'),
            proposedAction: { kind: 'send_email', body: 'pending' },
            claimedByUserId: null,
            claimedAt: null,
            decision: null,
            decidedByUserId: null,
            decidedAt: null,
            editedAction: null,
            rejectionReason: null,
            terminateEpisode: false,
          },
        ],
      });
      const result = await service.getForTenant(10, 'ep-1');
      expect(result.mostRecentDecidedApproval).not.toBeNull();
      expect(result.mostRecentDecidedApproval?.id).toBe('app-new');
      expect(result.mostRecentDecidedApproval?.decision).toBe('EDITED');
    });

    it('maps steps and approvals with enrichment when present', async () => {
      prisma.deskEpisode.findFirst.mockResolvedValue({
        ...baseEpisode,
        // Use an unknown responsibility — ApprovalEnrichmentService returns the
        // empty payload without branching into ar-followup's adapter.
        responsibility: { key: 'generic_responsibility', title: 'Generic' },
        conditionsSnapshot: { foo: 'bar' },
        expiresAt: new Date('2026-05-01T09:00:00Z'),
        steps: [
          {
            id: 'step-1',
            episodeId: 'ep-1',
            agentId: 1,
            sequence: 1,
            kind: 'HYDRATE',
            status: 'SUCCEEDED',
            model: 'gpt-4',
            promptKey: 'hydrate.v1',
            aiInvocation: { promptTokens: 100, completionTokens: 50, costUsd: { toString: () => '0.0010' } },
            toolName: 'getInvoice',
            toolScope: 'fleet:read',
            toolTier: 'L0',
            toolArgs: { id: 'inv-1' },
            toolResult: { ok: true },
            gateDecision: null,
            output: { value: 1 },
            confidence: 0.9,
            errorMessage: null,
            durationMs: 42,
            startedAt: new Date('2026-04-24T09:00:00Z'),
            finishedAt: new Date('2026-04-24T09:00:01Z'),
          },
          {
            id: 'step-2',
            episodeId: 'ep-1',
            agentId: null,
            sequence: 2,
            kind: 'EXECUTE',
            status: 'RUNNING',
            model: null,
            promptKey: null,
            aiInvocation: null,
            toolName: null,
            toolScope: null,
            toolTier: null,
            toolArgs: null,
            toolResult: null,
            gateDecision: null,
            output: null,
            confidence: null,
            errorMessage: null,
            durationMs: null,
            startedAt: new Date('2026-04-24T09:00:02Z'),
            finishedAt: null,
          },
        ],
        approvals: [
          {
            id: 'app-1',
            episodeId: 'ep-1',
            stepId: 'step-1',
            requestedAt: new Date('2026-04-24T09:00:05Z'),
            expiresAt: new Date('2026-05-01T09:00:00Z'),
            proposedAction: { kind: 'send_email' },
            claimedByUserId: 42,
            claimedAt: new Date('2026-04-24T09:00:10Z'),
            decision: 'APPROVED',
            decidedByUserId: 42,
            decidedAt: new Date('2026-04-24T09:01:00Z'),
            editedAction: null,
            rejectionReason: null,
            terminateEpisode: false,
          },
        ],
      });
      const result = await service.getForTenant(10, 'ep-1');
      expect(result.steps).toHaveLength(2);
      expect(result.steps[0].costUsd).toBe('0.0010');
      expect(result.steps[1].costUsd).toBeNull();
      expect(result.approvals).toHaveLength(1);
      expect(result.approvals[0].decision).toBe('APPROVED');
      expect(result.conditionsSnapshot).toEqual({ foo: 'bar' });
      expect(result.expiresAt).toBe(new Date('2026-05-01T09:00:00Z').toISOString());
    });

    it('throws NotFoundException when not found', async () => {
      prisma.deskEpisode.findFirst.mockResolvedValue(null);
      await expect(service.getForTenant(10, 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listHandled', () => {
    const closedToday = new Date().toISOString();

    it('returns rows closed today in tenant timezone with handled fields', async () => {
      const localPrisma = makePrismaForHandled(closedToday);
      const enrichment = { enrich: jest.fn() } as any;
      const svc = new DeskEpisodeService(localPrisma as unknown as PrismaService, enrichment, makeEvents());
      const result = await svc.listHandled(
        10,
        { scope: 'all', window: 'today', limit: 50 },
        { currentUserId: 1, tenantTimezone: 'America/Chicago' },
      );
      expect(result.rows).toHaveLength(2);
      for (const row of result.rows) {
        expect(row).toHaveProperty('closedAt');
        expect(row).toHaveProperty('outcome');
        expect(row).toHaveProperty('humanDecision');
        expect(row).toHaveProperty('durationMs');
        expect(row).toHaveProperty('activeSuppression');
      }
    });

    it('Handled query excludes ESCALATED — escalations live on Needs-you, not Handled', async () => {
      const localPrisma = makePrismaForHandled(closedToday);
      const svc = new DeskEpisodeService(
        localPrisma as unknown as PrismaService,
        { enrich: jest.fn() } as any,
        makeEvents(),
      );
      await svc.listHandled(
        10,
        { scope: 'all', window: 'today', limit: 50 },
        { currentUserId: 1, tenantTimezone: 'UTC' },
      );
      const call = localPrisma.deskEpisode.findMany.mock.calls[0][0];
      expect(call.where.status.in).not.toContain('ESCALATED');
      expect(call.where.status.in).toEqual(
        expect.arrayContaining(['RESOLVED', 'REJECTED_BY_OPERATOR', 'CANCELLED', 'EXPIRED', 'FAILED']),
      );
    });

    it('summary counts derive only from handled rows (escalations are not counted as resolved)', async () => {
      // 3 RESOLVED rows come back from the (ESCALATED-excluding) query; the
      // summary must report total=3, never inflated by escalations.
      const localPrisma = createMockPrisma();
      localPrisma.deskEpisode.findMany.mockResolvedValue([
        {
          ...baseEpisode,
          id: 'ep-r1',
          status: 'RESOLVED',
          closedAt: new Date(closedToday),
          approvals: [],
          entitySuppressions: [],
        },
        {
          ...baseEpisode,
          id: 'ep-r2',
          status: 'RESOLVED',
          closedAt: new Date(closedToday),
          approvals: [],
          entitySuppressions: [],
        },
        {
          ...baseEpisode,
          id: 'ep-r3',
          status: 'RESOLVED',
          closedAt: new Date(closedToday),
          approvals: [],
          entitySuppressions: [],
        },
      ]);
      const svc = new DeskEpisodeService(
        localPrisma as unknown as PrismaService,
        { enrich: jest.fn() } as any,
        makeEvents(),
      );
      const result = await svc.listHandled(
        10,
        { scope: 'all', window: 'today', limit: 50 },
        { currentUserId: 1, tenantTimezone: 'UTC' },
      );
      expect(result.summary.total).toBe(3);
      expect(result.rows.every((r) => r.status !== 'ESCALATED')).toBe(true);
    });

    it('mine scope empty when currentUserId missing', async () => {
      const localPrisma = createMockPrisma();
      localPrisma.deskEpisode.findMany.mockResolvedValue([]);
      const svc = new DeskEpisodeService(
        localPrisma as unknown as PrismaService,
        { enrich: jest.fn() } as any,
        makeEvents(),
      );
      const result = await svc.listHandled(
        10,
        { scope: 'mine', window: 'today', limit: 50 },
        { currentUserId: undefined, tenantTimezone: 'UTC' },
      );
      expect(result.rows).toEqual([]);
      expect(localPrisma.deskEpisode.findMany).not.toHaveBeenCalled();
    });

    it('mine scope filters by supervisor when currentUserId provided', async () => {
      const localPrisma = makePrismaForHandled(closedToday);
      const svc = new DeskEpisodeService(
        localPrisma as unknown as PrismaService,
        { enrich: jest.fn() } as any,
        makeEvents(),
      );
      await svc.listHandled(
        10,
        { scope: 'mine', window: 'today', limit: 50 },
        { currentUserId: 99, tenantTimezone: 'UTC' },
      );
      const call = localPrisma.deskEpisode.findMany.mock.calls[0][0];
      expect(call.where.ownerAgent).toEqual({ supervisorUserId: 99 });
    });

    it('humanDecision=EDITED when approval decision is EDITED', async () => {
      const localPrisma = makePrismaWithEditedApproval(closedToday);
      const svc = new DeskEpisodeService(
        localPrisma as unknown as PrismaService,
        { enrich: jest.fn() } as any,
        makeEvents(),
      );
      const result = await svc.listHandled(
        10,
        { scope: 'all', window: '7d', limit: 50 },
        { currentUserId: 1, tenantTimezone: 'UTC' },
      );
      expect(result.rows[0].humanDecision).toBe('EDITED');
      expect(result.rows[0].decidedByUserId).toBe(42);
      expect(result.rows[0].decidedByName).toBe('Ada Lovelace');
    });

    it('activeSuppression is populated when an unexpired, unsuppressed row is joined', async () => {
      const localPrisma = makePrismaWithActiveSuppression(closedToday);
      const svc = new DeskEpisodeService(
        localPrisma as unknown as PrismaService,
        { enrich: jest.fn() } as any,
        makeEvents(),
      );
      const result = await svc.listHandled(
        10,
        { scope: 'all', window: '30d', limit: 50 },
        { currentUserId: 1, tenantTimezone: 'UTC' },
      );
      expect(result.rows[0].activeSuppression).toMatchObject({
        id: '11111111-1111-1111-1111-111111111111',
        suppressUntil: '2099-05-24T00:00:00.000Z',
      });
    });

    it('activeSuppression.suppressUntil is null for a "forever" snooze', async () => {
      const localPrisma = makePrismaWithForeverSuppression(closedToday);
      const svc = new DeskEpisodeService(
        localPrisma as unknown as PrismaService,
        { enrich: jest.fn() } as any,
        makeEvents(),
      );
      const result = await svc.listHandled(
        10,
        { scope: 'all', window: '30d', limit: 50 },
        { currentUserId: 1, tenantTimezone: 'UTC' },
      );
      expect(result.rows[0].activeSuppression).toEqual({
        id: '22222222-2222-2222-2222-222222222222',
        suppressUntil: null,
      });
    });

    it('activeSuppression is null when entitySuppressions is empty (expired or cleared row is excluded by the where clause)', async () => {
      const localPrisma = createMockPrisma();
      localPrisma.deskEpisode.findMany.mockResolvedValue([
        {
          ...baseEpisode,
          id: 'ep-nosup',
          closedAt: new Date(closedToday),
          approvals: [],
          // Expired or already-unsuppressed rows are filtered OUT by Prisma's
          // `where` clause — so the relation array is empty at the mapper.
          entitySuppressions: [],
        },
      ]);
      const svc = new DeskEpisodeService(
        localPrisma as unknown as PrismaService,
        { enrich: jest.fn() } as any,
        makeEvents(),
      );
      const result = await svc.listHandled(
        10,
        { scope: 'all', window: '30d', limit: 50 },
        { currentUserId: 1, tenantTimezone: 'UTC' },
      );
      expect(result.rows[0].activeSuppression).toBeNull();

      // Confirm the Prisma join wires the unexpired + unsuppressed filters.
      const call = localPrisma.deskEpisode.findMany.mock.calls[0][0];
      const supInclude = call.include.entitySuppressions;
      expect(supInclude.where.unsuppressedAt).toBeNull();
      expect(supInclude.where.OR).toEqual([{ suppressUntil: null }, { suppressUntil: { gt: expect.any(Date) } }]);
    });

    it('summary.autonomousPct computed from rows (2 autonomous + 1 approved = 2/3)', async () => {
      const localPrisma = makePrismaForAutonomousPct(closedToday);
      const svc = new DeskEpisodeService(
        localPrisma as unknown as PrismaService,
        { enrich: jest.fn() } as any,
        makeEvents(),
      );
      const result = await svc.listHandled(
        10,
        { scope: 'all', window: '7d', limit: 50 },
        { currentUserId: 1, tenantTimezone: 'UTC' },
      );
      expect(result.summary.autonomousPct).toBeCloseTo(2 / 3, 2);
      expect(result.summary.total).toBe(3);
      expect(result.summary.byOutcome.followup_sent).toBe(3);
    });

    it('empty result returns autonomousPct=0 (no divide-by-zero)', async () => {
      const localPrisma = createMockPrisma();
      localPrisma.deskEpisode.findMany.mockResolvedValue([]);
      const svc = new DeskEpisodeService(
        localPrisma as unknown as PrismaService,
        { enrich: jest.fn() } as any,
        makeEvents(),
      );
      const result = await svc.listHandled(
        10,
        { scope: 'all', window: 'today', limit: 50 },
        { currentUserId: 1, tenantTimezone: 'UTC' },
      );
      expect(result.summary.total).toBe(0);
      expect(result.summary.autonomousPct).toBe(0);
    });

    it('window=today resolves from ≈ tenant midnight to now', async () => {
      const localPrisma = makePrismaForHandled(closedToday);
      const svc = new DeskEpisodeService(
        localPrisma as unknown as PrismaService,
        { enrich: jest.fn() } as any,
        makeEvents(),
      );
      await svc.listHandled(
        10,
        { scope: 'all', window: 'today', limit: 50 },
        { currentUserId: 1, tenantTimezone: 'America/Chicago' },
      );
      const call = localPrisma.deskEpisode.findMany.mock.calls[0][0];
      const fromMs = (call.where.closedAt.gte as Date).getTime();
      expect(fromMs).toBeLessThanOrEqual(Date.now());
      expect(Date.now() - fromMs).toBeLessThan(25 * 3_600_000);
    });

    it('window=7d spans now-7d → now', async () => {
      const localPrisma = makePrismaForHandled(closedToday);
      const svc = new DeskEpisodeService(
        localPrisma as unknown as PrismaService,
        { enrich: jest.fn() } as any,
        makeEvents(),
      );
      await svc.listHandled(10, { scope: 'all', window: '7d', limit: 50 }, { currentUserId: 1, tenantTimezone: 'UTC' });
      const call = localPrisma.deskEpisode.findMany.mock.calls[0][0];
      const fromMs = (call.where.closedAt.gte as Date).getTime();
      const msAgo = Date.now() - fromMs;
      expect(msAgo).toBeGreaterThan(6.5 * 24 * 3_600_000);
      expect(msAgo).toBeLessThan(8 * 24 * 3_600_000);
    });

    it('window=30d spans now-30d → now', async () => {
      const localPrisma = makePrismaForHandled(closedToday);
      const svc = new DeskEpisodeService(
        localPrisma as unknown as PrismaService,
        { enrich: jest.fn() } as any,
        makeEvents(),
      );
      await svc.listHandled(
        10,
        { scope: 'all', window: '30d', limit: 50 },
        { currentUserId: 1, tenantTimezone: 'UTC' },
      );
      const call = localPrisma.deskEpisode.findMany.mock.calls[0][0];
      const msAgo = Date.now() - (call.where.closedAt.gte as Date).getTime();
      expect(msAgo).toBeGreaterThan(29 * 24 * 3_600_000);
      expect(msAgo).toBeLessThan(31 * 24 * 3_600_000);
    });

    it('window=this_month starts at tenant-local start of month', async () => {
      const localPrisma = makePrismaForHandled(closedToday);
      const svc = new DeskEpisodeService(
        localPrisma as unknown as PrismaService,
        { enrich: jest.fn() } as any,
        makeEvents(),
      );
      await svc.listHandled(
        10,
        { scope: 'all', window: 'this_month', limit: 50 },
        { currentUserId: 1, tenantTimezone: 'UTC' },
      );
      const call = localPrisma.deskEpisode.findMany.mock.calls[0][0];
      const from = call.where.closedAt.gte as Date;
      // First day of this month at midnight UTC
      const now = new Date();
      expect(from.getUTCDate()).toBe(1);
      expect(from.getUTCMonth()).toBe(now.getUTCMonth());
    });

    it('window=custom honors from/to', async () => {
      const localPrisma = makePrismaForHandled(closedToday);
      const svc = new DeskEpisodeService(
        localPrisma as unknown as PrismaService,
        { enrich: jest.fn() } as any,
        makeEvents(),
      );
      const from = '2026-04-01T00:00:00.000Z';
      const to = '2026-04-15T23:59:59.999Z';
      await svc.listHandled(
        10,
        { scope: 'all', window: 'custom', from, to, limit: 50 },
        { currentUserId: 1, tenantTimezone: 'UTC' },
      );
      const call = localPrisma.deskEpisode.findMany.mock.calls[0][0];
      expect((call.where.closedAt.gte as Date).toISOString()).toBe(from);
      expect((call.where.closedAt.lte as Date).toISOString()).toBe(to);
    });

    it('agent filter narrows by agent key while preserving scope', async () => {
      const localPrisma = makePrismaForHandled(closedToday);
      const svc = new DeskEpisodeService(
        localPrisma as unknown as PrismaService,
        { enrich: jest.fn() } as any,
        makeEvents(),
      );
      await svc.listHandled(
        10,
        { scope: 'mine', window: '7d', agent: 'autumn', limit: 50 },
        { currentUserId: 99, tenantTimezone: 'UTC' },
      );
      const call = localPrisma.deskEpisode.findMany.mock.calls[0][0];
      expect(call.where.ownerAgent).toMatchObject({ supervisorUserId: 99, key: 'autumn' });
    });

    it('outcome filter narrows by outcome string', async () => {
      const localPrisma = makePrismaForHandled(closedToday);
      const svc = new DeskEpisodeService(
        localPrisma as unknown as PrismaService,
        { enrich: jest.fn() } as any,
        makeEvents(),
      );
      await svc.listHandled(
        10,
        { scope: 'all', window: '7d', outcome: 'promise_recorded', limit: 50 },
        { currentUserId: 1, tenantTimezone: 'UTC' },
      );
      const call = localPrisma.deskEpisode.findMany.mock.calls[0][0];
      expect(call.where.outcome).toBe('promise_recorded');
    });

    it('q parameter searches entityLabel and responsibility.key', async () => {
      const localPrisma = makePrismaForHandled(closedToday);
      const svc = new DeskEpisodeService(
        localPrisma as unknown as PrismaService,
        { enrich: jest.fn() } as any,
        makeEvents(),
      );
      await svc.listHandled(
        10,
        { scope: 'all', window: '7d', q: 'granite', limit: 50 },
        { currentUserId: 1, tenantTimezone: 'UTC' },
      );
      const call = localPrisma.deskEpisode.findMany.mock.calls[0][0];
      expect(call.where.OR).toEqual(
        expect.arrayContaining([
          { entityLabel: { contains: 'granite', mode: 'insensitive' } },
          { responsibility: { key: { contains: 'granite', mode: 'insensitive' } } },
        ]),
      );
    });

    it('hasMore=true emits a cursor on the last row', async () => {
      const localPrisma = createMockPrisma();
      const rows = Array.from({ length: 3 }, (_, i) => ({
        ...baseEpisode,
        id: `ep-${i}`,
        closedAt: new Date(closedToday),
        approvals: [],
        entitySuppressions: [],
      }));
      localPrisma.deskEpisode.findMany.mockResolvedValue(rows);
      const svc = new DeskEpisodeService(
        localPrisma as unknown as PrismaService,
        { enrich: jest.fn() } as any,
        makeEvents(),
      );
      const result = await svc.listHandled(
        10,
        { scope: 'all', window: '7d', limit: 2 },
        { currentUserId: 1, tenantTimezone: 'UTC' },
      );
      expect(result.rows).toHaveLength(2);
      expect(result.nextCursor).toContain('|ep-1');
    });

    it('cursor parses and feeds OR clause', async () => {
      const localPrisma = makePrismaForHandled(closedToday);
      const svc = new DeskEpisodeService(
        localPrisma as unknown as PrismaService,
        { enrich: jest.fn() } as any,
        makeEvents(),
      );
      const cur = `${new Date('2026-04-20T00:00:00Z').toISOString()}|ep-prev`;
      await svc.listHandled(
        10,
        { scope: 'all', window: '7d', cursor: cur, limit: 50 },
        { currentUserId: 1, tenantTimezone: 'UTC' },
      );
      const call = localPrisma.deskEpisode.findMany.mock.calls[0][0];
      // cursor OR is merged into where — either as `OR` top-level or spread
      expect(call.where.OR).toBeDefined();
    });

    it('escalation row: escalationReason populated from outcomeNote', async () => {
      const localPrisma = createMockPrisma();
      localPrisma.deskEpisode.findMany.mockResolvedValue([
        {
          ...baseEpisode,
          id: 'ep-esc',
          status: 'ESCALATED',
          outcomeNote: 'No customer response after 3 attempts',
          closedAt: new Date(closedToday),
          approvals: [],
          entitySuppressions: [],
        },
      ]);
      const svc = new DeskEpisodeService(
        localPrisma as unknown as PrismaService,
        { enrich: jest.fn() } as any,
        makeEvents(),
      );
      const result = await svc.listHandled(
        10,
        { scope: 'all', window: '7d', limit: 50 },
        { currentUserId: 1, tenantTimezone: 'UTC' },
      );
      expect(result.rows[0].escalationReason).toBe('No customer response after 3 attempts');
    });

    it('fallback: null outcome becomes "unknown"; null entityLabel uses responsibility title', async () => {
      const localPrisma = createMockPrisma();
      localPrisma.deskEpisode.findMany.mockResolvedValue([
        {
          ...baseEpisode,
          id: 'ep-fallback',
          outcome: null,
          entityLabel: null,
          closedAt: null, // forces updatedAt fallback
          approvals: [],
          entitySuppressions: [],
        },
      ]);
      const svc = new DeskEpisodeService(
        localPrisma as unknown as PrismaService,
        { enrich: jest.fn() } as any,
        makeEvents(),
      );
      const result = await svc.listHandled(
        10,
        { scope: 'all', window: '7d', limit: 50 },
        { currentUserId: 1, tenantTimezone: 'UTC' },
      );
      expect(result.rows[0].outcome).toBe('unknown');
      expect(result.rows[0].decisionTitle).toBe(baseEpisode.responsibility.title);
      // closedAt maps from updatedAt when episode.closedAt is null
      expect(result.rows[0].closedAt).toBe(baseEpisode.updatedAt.toISOString());
    });

    it('approval with decidedBy but no names yields null decidedByName', async () => {
      const localPrisma = createMockPrisma();
      localPrisma.deskEpisode.findMany.mockResolvedValue([
        {
          ...baseEpisode,
          id: 'ep-noname',
          closedAt: new Date(closedToday),
          approvals: [{ decision: 'APPROVED', decidedByUserId: 7, decidedBy: { firstName: null, lastName: null } }],
          entitySuppressions: [],
        },
      ]);
      const svc = new DeskEpisodeService(
        localPrisma as unknown as PrismaService,
        { enrich: jest.fn() } as any,
        makeEvents(),
      );
      const result = await svc.listHandled(
        10,
        { scope: 'all', window: '7d', limit: 50 },
        { currentUserId: 1, tenantTimezone: 'UTC' },
      );
      expect(result.rows[0].decidedByName).toBeNull();
    });

    it('approval with decidedBy=null falls through to null name + null userId', async () => {
      const localPrisma = createMockPrisma();
      localPrisma.deskEpisode.findMany.mockResolvedValue([
        {
          ...baseEpisode,
          id: 'ep-nodb',
          closedAt: new Date(closedToday),
          approvals: [{ decision: 'REJECTED', decidedByUserId: null, decidedBy: null }],
          entitySuppressions: [],
        },
      ]);
      const svc = new DeskEpisodeService(
        localPrisma as unknown as PrismaService,
        { enrich: jest.fn() } as any,
        makeEvents(),
      );
      const result = await svc.listHandled(
        10,
        { scope: 'all', window: '7d', limit: 50 },
        { currentUserId: 1, tenantTimezone: 'UTC' },
      );
      expect(result.rows[0].decidedByName).toBeNull();
      expect(result.rows[0].decidedByUserId).toBeNull();
      expect(result.rows[0].humanDecision).toBe('REJECTED');
    });

    it('only last name present still builds a trimmed decidedByName', async () => {
      const localPrisma = createMockPrisma();
      localPrisma.deskEpisode.findMany.mockResolvedValue([
        {
          ...baseEpisode,
          id: 'ep-last',
          closedAt: new Date(closedToday),
          approvals: [{ decision: 'APPROVED', decidedByUserId: 7, decidedBy: { firstName: null, lastName: 'Turing' } }],
          entitySuppressions: [],
        },
      ]);
      const svc = new DeskEpisodeService(
        localPrisma as unknown as PrismaService,
        { enrich: jest.fn() } as any,
        makeEvents(),
      );
      const result = await svc.listHandled(
        10,
        { scope: 'all', window: '7d', limit: 50 },
        { currentUserId: 1, tenantTimezone: 'UTC' },
      );
      expect(result.rows[0].decidedByName).toBe('Turing');
    });

    it('window=custom without from/to falls back to start-of-day → now', async () => {
      const localPrisma = makePrismaForHandled(closedToday);
      const svc = new DeskEpisodeService(
        localPrisma as unknown as PrismaService,
        { enrich: jest.fn() } as any,
        makeEvents(),
      );
      await svc.listHandled(
        10,
        { scope: 'all', window: 'custom', limit: 50 },
        { currentUserId: 1, tenantTimezone: 'UTC' },
      );
      const call = localPrisma.deskEpisode.findMany.mock.calls[0][0];
      const fromMs = (call.where.closedAt.gte as Date).getTime();
      expect(Date.now() - fromMs).toBeLessThan(25 * 3_600_000);
    });

    it('no window query defaults to today', async () => {
      const localPrisma = makePrismaForHandled(closedToday);
      const svc = new DeskEpisodeService(
        localPrisma as unknown as PrismaService,
        { enrich: jest.fn() } as any,
        makeEvents(),
      );
      await svc.listHandled(10, { scope: 'all', limit: 50 }, { currentUserId: 1, tenantTimezone: 'UTC' });
      const call = localPrisma.deskEpisode.findMany.mock.calls[0][0];
      expect(call.where.closedAt.gte).toBeDefined();
    });

    it('proposedAction and editedAction null fallbacks in getForTenant approval mapper', async () => {
      prisma.deskEpisode.findFirst.mockResolvedValue({
        ...baseEpisode,
        responsibility: { key: 'generic', title: 'Generic' },
        steps: [],
        approvals: [
          {
            id: 'app-1',
            episodeId: 'ep-1',
            stepId: 'step-1',
            requestedAt: new Date('2026-04-24T09:00:00Z'),
            expiresAt: new Date('2026-05-01T09:00:00Z'),
            proposedAction: null,
            claimedByUserId: null,
            claimedAt: null,
            decision: null,
            decidedByUserId: null,
            decidedAt: null,
            editedAction: null,
            rejectionReason: null,
            terminateEpisode: false,
          },
        ],
      });
      const result = await service.getForTenant(10, 'ep-1');
      expect(result.approvals).toHaveLength(1);
      expect(result.approvals[0].proposedAction).toEqual({});
      expect(result.approvals[0].editedAction).toBeNull();
    });
  });

  describe('resolveEpisode', () => {
    const escalated = {
      id: 'ep-esc',
      tenantId: 10,
      status: 'ESCALATED' as const,
      outcomeNote: 'No driver response',
      closedAt: new Date('2026-05-25T09:00:00Z'),
    };

    it('ESCALATED → RESOLVED: updates status, appends note, keeps closedAt, emits the change event', async () => {
      prisma.deskEpisode.findFirst.mockResolvedValue(escalated);
      prisma.deskEpisode.update.mockResolvedValue({ ...escalated, status: 'RESOLVED' });

      const result = await service.resolveEpisode(10, 'ep-esc', 7, 'Handled by phone');

      expect(result.status).toBe('RESOLVED');
      // Tenant-scoped read.
      const findArgs = prisma.deskEpisode.findFirst.mock.calls[0][0];
      expect(findArgs.where).toEqual({ id: 'ep-esc', tenantId: 10 });
      // Update transitions to RESOLVED and appends the note to outcomeNote.
      const updateArgs = prisma.deskEpisode.update.mock.calls[0][0];
      expect(updateArgs.data.status).toBe('RESOLVED');
      expect(updateArgs.data.outcomeNote).toContain('Handled by phone');
      expect(updateArgs.data.outcomeNote).toContain('No driver response');
      // closedAt is not overwritten on resolve (escalation already closed it).
      expect(updateArgs.data.closedAt).toBeUndefined();
      // Emits the change event with the tenant + episode + new status.
      expect(events.emit).toHaveBeenCalledWith(
        DOMAIN_EVENTS.DESK_EPISODE_CHANGED,
        10,
        expect.objectContaining({ episodeId: 'ep-esc', status: 'RESOLVED' }),
        expect.anything(),
      );
    });

    it('resolves without a note (note optional) — outcomeNote unchanged', async () => {
      prisma.deskEpisode.findFirst.mockResolvedValue(escalated);
      prisma.deskEpisode.update.mockResolvedValue({ ...escalated, status: 'RESOLVED' });

      await service.resolveEpisode(10, 'ep-esc', 7);

      const updateArgs = prisma.deskEpisode.update.mock.calls[0][0];
      expect(updateArgs.data.status).toBe('RESOLVED');
      expect(updateArgs.data.outcomeNote).toBe('No driver response');
    });

    it('throws NotFoundException when the episode is missing or cross-tenant', async () => {
      prisma.deskEpisode.findFirst.mockResolvedValue(null);
      await expect(service.resolveEpisode(10, 'missing', 7)).rejects.toThrow(NotFoundException);
      expect(prisma.deskEpisode.update).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('rejects (BadRequest) resolving an episode that is not ESCALATED — only ESCALATED → RESOLVED allowed', async () => {
      prisma.deskEpisode.findFirst.mockResolvedValue({ ...escalated, status: 'RESOLVED' });
      await expect(service.resolveEpisode(10, 'ep-esc', 7)).rejects.toThrow(BadRequestException);
      expect(prisma.deskEpisode.update).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('rejects (BadRequest) resolving a RUNNING episode', async () => {
      prisma.deskEpisode.findFirst.mockResolvedValue({ ...escalated, status: 'RUNNING' });
      await expect(service.resolveEpisode(10, 'ep-esc', 7)).rejects.toThrow(BadRequestException);
    });
  });

  describe('pickMostRecentDecidedApproval', () => {
    it('returns null for empty approvals array', () => {
      expect(pickMostRecentDecidedApproval([])).toBeNull();
    });

    it('skips pending approvals without a decision', () => {
      const pending = {
        id: 'app-1',
        episodeId: 'ep-1',
        stepId: 'step-1',
        requestedAt: '2026-04-24T09:00:00Z',
        expiresAt: '2026-05-01T09:00:00Z',
        proposedAction: {},
        claimedByUserId: null,
        claimedAt: null,
        decision: null,
        decidedByUserId: null,
        decidedAt: null,
        editedAction: null,
        rejectionReason: null,
        terminateEpisode: false,
      } as any;
      expect(pickMostRecentDecidedApproval([pending])).toBeNull();
    });

    it('picks the latest by decidedAt when several approvals are decided', () => {
      const older = {
        id: 'app-1',
        decision: 'APPROVED',
        decidedAt: '2026-04-24T09:05:00Z',
      } as any;
      const newer = {
        id: 'app-2',
        decision: 'EDITED',
        decidedAt: '2026-04-24T10:05:00Z',
      } as any;
      expect(pickMostRecentDecidedApproval([older, newer])?.id).toBe('app-2');
      // Order-insensitive.
      expect(pickMostRecentDecidedApproval([newer, older])?.id).toBe('app-2');
    });
  });
});
