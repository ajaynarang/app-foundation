import type { Prisma } from '@prisma/client';

import { createMockPrisma } from '../../../../test/mocks/prisma.mock';

import { TriggerService } from './trigger.service';

jest.mock('../../responsibilities/ar-followup/fan-out', () => ({
  findOverdueInvoicesForTenant: jest.fn(),
}));
jest.mock('../../responsibilities/closeout-review/fan-out', () => ({
  findUninvoicedDeliveredLoadsForTenant: jest.fn(),
}));
jest.mock('../../responsibilities/document-expiry/fan-out', () => ({
  findDriverExpiryFindingsForTenant: jest.fn(),
}));

import { findOverdueInvoicesForTenant } from '../../responsibilities/ar-followup/fan-out';
import { findUninvoicedDeliveredLoadsForTenant } from '../../responsibilities/closeout-review/fan-out';
import { findDriverExpiryFindingsForTenant } from '../../responsibilities/document-expiry/fan-out';

/**
 * Unit coverage for TriggerService — focuses on the
 * `runArFollowupForTenant` flow + the `upsertEpisode` skip paths. The
 * happy path is exercised elsewhere at the workflow + integration layer;
 * these specs pin down the short-circuits so regressions in the fan-out
 * entry point surface here.
 */

function makeInngest() {
  return { send: jest.fn().mockResolvedValue(undefined) } as const;
}

// Minimal ConfigService stub — returns undefined for every key so the
// DESK_AR_FOLLOWUP_MAX_FANOUT lookup falls back to the default (0 = no cap).
// Tests that need a specific cap can override via `makeConfig({DESK_AR_FOLLOWUP_MAX_FANOUT: N})`.
function makeConfig(values: Record<string, unknown> = {}) {
  return {
    get: jest.fn(<T>(key: string, defaultValue?: T) => (values[key] as T | undefined) ?? defaultValue),
  } as const;
}

// Minimal ShieldService stub — only triggerAudit is exercised (document
// expiry stale-audit guard). AR Follow-up tests never reach it.
function makeShield() {
  return { triggerAudit: jest.fn().mockResolvedValue({ queued: true, auditId: 'aud-1' }) } as const;
}

// Minimal DomainEventService stub — the open path emits DESK_EPISODE_CHANGED.
function makeEvents() {
  return { emit: jest.fn().mockResolvedValue(undefined) } as const;
}

function makeResponsibility(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 101,
    agentId: 7,
    enabled: true,
    lifecycle: 'AVAILABLE',
    trustLevel: 'SUPERVISED',
    conditions: {},
    agent: { supervisorUserId: 99 },
    ...overrides,
  };
}

function makeOverdue(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    invoiceNumber: 'NL-INV-1015',
    customerId: 42,
    customerName: 'Granite State Lumber',
    amount: 968,
    daysOverdue: 47,
    ...overrides,
  };
}

describe('TriggerService', () => {
  const mockFindOverdue = findOverdueInvoicesForTenant as jest.MockedFunction<typeof findOverdueInvoicesForTenant>;

  beforeEach(() => {
    mockFindOverdue.mockReset();
  });

  describe('runArFollowupForTenant — short-circuits', () => {
    it('returns responsibility_not_seeded when the row is missing', async () => {
      const prisma = createMockPrisma();
      prisma.deskResponsibility.findUnique.mockResolvedValue(null);
      const svc = new TriggerService(
        prisma,
        makeInngest() as never,
        makeConfig() as never,
        makeShield() as never,
        makeEvents() as never,
      );

      const result = await svc.runArFollowupForTenant(10);

      expect(result).toEqual({ episodesOpened: 0, skipped: 'responsibility_not_seeded' });
      expect(mockFindOverdue).not.toHaveBeenCalled();
    });

    it('returns disabled when responsibility.enabled is false', async () => {
      const prisma = createMockPrisma();
      prisma.deskResponsibility.findUnique.mockResolvedValue(makeResponsibility({ enabled: false }));
      const svc = new TriggerService(
        prisma,
        makeInngest() as never,
        makeConfig() as never,
        makeShield() as never,
        makeEvents() as never,
      );

      const result = await svc.runArFollowupForTenant(10);

      expect(result).toEqual({ episodesOpened: 0, skipped: 'disabled' });
    });

    it('returns not_available when lifecycle is COMING_SOON', async () => {
      const prisma = createMockPrisma();
      prisma.deskResponsibility.findUnique.mockResolvedValue(makeResponsibility({ lifecycle: 'COMING_SOON' }));
      const svc = new TriggerService(
        prisma,
        makeInngest() as never,
        makeConfig() as never,
        makeShield() as never,
        makeEvents() as never,
      );

      const result = await svc.runArFollowupForTenant(10);

      expect(result).toEqual({ episodesOpened: 0, skipped: 'not_available' });
    });

    it('returns no_supervisor when the agent has no supervisor assigned', async () => {
      const prisma = createMockPrisma();
      prisma.deskResponsibility.findUnique.mockResolvedValue(makeResponsibility({ agent: { supervisorUserId: null } }));
      const svc = new TriggerService(
        prisma,
        makeInngest() as never,
        makeConfig() as never,
        makeShield() as never,
        makeEvents() as never,
      );

      const result = await svc.runArFollowupForTenant(10);

      expect(result).toEqual({ episodesOpened: 0, skipped: 'no_supervisor' });
      expect(mockFindOverdue).not.toHaveBeenCalled();
    });

    it('returns 0 opened when no overdue invoices are found', async () => {
      const prisma = createMockPrisma();
      prisma.deskResponsibility.findUnique.mockResolvedValue(makeResponsibility());
      mockFindOverdue.mockResolvedValue([]);
      const svc = new TriggerService(
        prisma,
        makeInngest() as never,
        makeConfig() as never,
        makeShield() as never,
        makeEvents() as never,
      );

      const result = await svc.runArFollowupForTenant(10);

      expect(result).toEqual({ episodesOpened: 0 });
      expect(prisma.deskEpisode.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('runArFollowupForTenant — happy path', () => {
    it('opens a new episode, publishes the Inngest event, and reports opened=1', async () => {
      const prisma = createMockPrisma();
      prisma.deskResponsibility.findUnique.mockResolvedValue(makeResponsibility());
      prisma.deskEntitySuppression.findFirst.mockResolvedValue(null);
      prisma.deskEpisode.findFirst.mockResolvedValue(null);
      prisma.deskEpisode.create.mockResolvedValue({ id: 'ep-new' });
      mockFindOverdue.mockResolvedValue([makeOverdue()]);
      const inngest = makeInngest();
      const svc = new TriggerService(
        prisma,
        inngest as never,
        makeConfig() as never,
        makeShield() as never,
        makeEvents() as never,
      );

      const result = await svc.runArFollowupForTenant(10);

      expect(result).toEqual({ episodesOpened: 1, episodesReused: 0 });
      expect(prisma.deskEpisode.create).toHaveBeenCalledTimes(1);
      expect(inngest.send).toHaveBeenCalledWith(
        'sally/desk.ar_followup.run',
        expect.objectContaining({
          episodeId: 'ep-new',
          tenantId: 10,
          invoiceNumber: 'NL-INV-1015',
        }),
        expect.objectContaining({ id: expect.stringMatching(/^ar_followup:invoice:NL-INV-1015:/) }),
      );
    });

    it('reuses an already-open episode and reports reused=1', async () => {
      const prisma = createMockPrisma();
      prisma.deskResponsibility.findUnique.mockResolvedValue(makeResponsibility());
      prisma.deskEntitySuppression.findFirst.mockResolvedValue(null);
      prisma.deskEpisode.findFirst.mockResolvedValue({ id: 'ep-existing' });
      mockFindOverdue.mockResolvedValue([makeOverdue()]);
      const inngest = makeInngest();
      const svc = new TriggerService(
        prisma,
        inngest as never,
        makeConfig() as never,
        makeShield() as never,
        makeEvents() as never,
      );

      const result = await svc.runArFollowupForTenant(10);

      expect(result).toEqual({ episodesOpened: 0, episodesReused: 1 });
      expect(prisma.deskEpisode.create).not.toHaveBeenCalled();
      expect(inngest.send).toHaveBeenCalledTimes(1);
    });

    it('runs manually even when autonomy would be off — the manual path never consults autonomyEnabled', async () => {
      const prisma = createMockPrisma();
      // A row with autonomyEnabled=false (and no tenant master check at all):
      // manual "Run now" must still open the episode. The trigger only gates on
      // enabled + lifecycle + supervisor — never on the autonomy switch.
      prisma.deskResponsibility.findUnique.mockResolvedValue(makeResponsibility({ autonomyEnabled: false }));
      prisma.deskEntitySuppression.findFirst.mockResolvedValue(null);
      prisma.deskEpisode.findFirst.mockResolvedValue(null);
      prisma.deskEpisode.create.mockResolvedValue({ id: 'ep-manual' });
      mockFindOverdue.mockResolvedValue([makeOverdue()]);
      const inngest = makeInngest();
      const svc = new TriggerService(
        prisma,
        inngest as never,
        makeConfig() as never,
        makeShield() as never,
        makeEvents() as never,
      );

      const result = await svc.runArFollowupForTenant(10);

      expect(result).toEqual({ episodesOpened: 1, episodesReused: 0 });
      expect(inngest.send).toHaveBeenCalledTimes(1);
      // Structural guarantee: the manual run path never reads tenant.deskScheduleEnabled.
      expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
      // ...and never selects the autonomy column for a gate decision.
      const selectArg = prisma.deskResponsibility.findUnique.mock.calls[0][0].select;
      expect(selectArg).not.toHaveProperty('autonomyEnabled');
    });

    it('caps fan-out at DESK_AR_FOLLOWUP_MAX_FANOUT when set', async () => {
      const prisma = createMockPrisma();
      prisma.deskResponsibility.findUnique.mockResolvedValue(makeResponsibility());
      prisma.deskEntitySuppression.findFirst.mockResolvedValue(null);
      prisma.deskEpisode.findFirst.mockResolvedValue(null);
      prisma.deskEpisode.create.mockResolvedValue({ id: 'ep-cap' });
      mockFindOverdue.mockResolvedValue([
        makeOverdue({ invoiceNumber: 'A' }),
        makeOverdue({ invoiceNumber: 'B' }),
        makeOverdue({ invoiceNumber: 'C' }),
      ]);
      const inngest = makeInngest();
      const svc = new TriggerService(
        prisma,
        inngest as never,
        makeConfig({ DESK_AR_FOLLOWUP_MAX_FANOUT: 1 }) as never,
        makeShield() as never,
        makeEvents() as never,
      );

      const result = await svc.runArFollowupForTenant(10);

      expect(result.episodesOpened).toBe(1);
      expect(prisma.deskEpisode.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('suppression skip', () => {
    it('skips entities with an active open-ended suppression (suppressUntil = null)', async () => {
      const prisma = createMockPrisma();
      prisma.deskResponsibility.findUnique.mockResolvedValue(makeResponsibility());
      prisma.deskEntitySuppression.findFirst.mockResolvedValue({
        id: 'sup-forever',
        suppressUntil: null,
      });
      mockFindOverdue.mockResolvedValue([makeOverdue()]);
      const inngest = makeInngest();
      const svc = new TriggerService(
        prisma,
        inngest as never,
        makeConfig() as never,
        makeShield() as never,
        makeEvents() as never,
      );

      const result = await svc.runArFollowupForTenant(10);

      expect(result).toEqual({ episodesOpened: 0, episodesReused: 0 });
      expect(prisma.deskEpisode.findFirst).not.toHaveBeenCalled();
      expect(prisma.deskEpisode.create).not.toHaveBeenCalled();
      expect(inngest.send).not.toHaveBeenCalled();

      // where clause passes the current window + unsuppressedAt filter
      expect(prisma.deskEntitySuppression.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 10,
            responsibilityKey: 'ar_followup',
            entityType: 'invoice',
            entityId: 'NL-INV-1015',
            unsuppressedAt: null,
            OR: [{ suppressUntil: null }, { suppressUntil: { gt: expect.any(Date) } }],
          }),
          select: { id: true, suppressUntil: true },
        }),
      );
    });

    it('skips entities with an active time-bounded suppression (suppressUntil in the future)', async () => {
      const future = new Date(Date.now() + 3_600_000);
      const prisma = createMockPrisma();
      prisma.deskResponsibility.findUnique.mockResolvedValue(makeResponsibility());
      prisma.deskEntitySuppression.findFirst.mockResolvedValue({
        id: 'sup-timed',
        suppressUntil: future,
      });
      mockFindOverdue.mockResolvedValue([makeOverdue()]);
      const inngest = makeInngest();
      const svc = new TriggerService(
        prisma,
        inngest as never,
        makeConfig() as never,
        makeShield() as never,
        makeEvents() as never,
      );

      const result = await svc.runArFollowupForTenant(10);

      expect(result).toEqual({ episodesOpened: 0, episodesReused: 0 });
      expect(prisma.deskEpisode.create).not.toHaveBeenCalled();
      expect(inngest.send).not.toHaveBeenCalled();
    });

    it('still opens episodes for other entities when only one is suppressed', async () => {
      const prisma = createMockPrisma();
      prisma.deskResponsibility.findUnique.mockResolvedValue(makeResponsibility());
      prisma.deskEntitySuppression.findFirst.mockImplementation(async ({ where }: any) => {
        if (where.entityId === 'SUPPRESSED') {
          return { id: 'sup-1', suppressUntil: null };
        }
        return null;
      });
      prisma.deskEpisode.findFirst.mockResolvedValue(null);
      prisma.deskEpisode.create.mockResolvedValue({ id: 'ep-open' });
      mockFindOverdue.mockResolvedValue([
        makeOverdue({ invoiceNumber: 'SUPPRESSED' }),
        makeOverdue({ invoiceNumber: 'NOT-SUPPRESSED' }),
      ]);
      const inngest = makeInngest();
      const svc = new TriggerService(
        prisma,
        inngest as never,
        makeConfig() as never,
        makeShield() as never,
        makeEvents() as never,
      );

      const result = await svc.runArFollowupForTenant(10);

      expect(result).toEqual({ episodesOpened: 1, episodesReused: 0 });
      expect(prisma.deskEpisode.create).toHaveBeenCalledTimes(1);
      expect(prisma.deskEpisode.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ entityId: 'NOT-SUPPRESSED' }),
        }),
      );
      expect(inngest.send).toHaveBeenCalledTimes(1);
    });

    it('does NOT skip when suppression findFirst returns null (no active row)', async () => {
      const prisma = createMockPrisma();
      prisma.deskResponsibility.findUnique.mockResolvedValue(makeResponsibility());
      prisma.deskEntitySuppression.findFirst.mockResolvedValue(null);
      prisma.deskEpisode.findFirst.mockResolvedValue(null);
      prisma.deskEpisode.create.mockResolvedValue({ id: 'ep-open' });
      mockFindOverdue.mockResolvedValue([makeOverdue()]);
      const inngest = makeInngest();
      const svc = new TriggerService(
        prisma,
        inngest as never,
        makeConfig() as never,
        makeShield() as never,
        makeEvents() as never,
      );

      const result = await svc.runArFollowupForTenant(10);

      expect(result).toEqual({ episodesOpened: 1, episodesReused: 0 });
      expect(prisma.deskEpisode.create).toHaveBeenCalled();
      expect(inngest.send).toHaveBeenCalled();
    });
  });

  describe('runCloseoutReviewForTenant', () => {
    const mockFindLoads = findUninvoicedDeliveredLoadsForTenant as jest.MockedFunction<
      typeof findUninvoicedDeliveredLoadsForTenant
    >;

    function makeLoad(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        loadNumber: 'LD-20260518-001',
        customerId: 42,
        customerName: 'Acme Logistics',
        deliveredAt: '2026-05-18T00:00:00.000Z',
        hoursSinceDelivery: 72,
        ...overrides,
      };
    }

    beforeEach(() => {
      mockFindLoads.mockReset();
    });

    it('returns responsibility_not_seeded when the row is missing', async () => {
      const prisma = createMockPrisma();
      prisma.deskResponsibility.findUnique.mockResolvedValue(null);
      const svc = new TriggerService(
        prisma,
        makeInngest() as never,
        makeConfig() as never,
        makeShield() as never,
        makeEvents() as never,
      );

      const result = await svc.runCloseoutReviewForTenant(10);

      expect(result).toEqual({ episodesOpened: 0, skipped: 'responsibility_not_seeded' });
      expect(mockFindLoads).not.toHaveBeenCalled();
    });

    it('returns no_supervisor when the agent has no supervisor assigned', async () => {
      const prisma = createMockPrisma();
      prisma.deskResponsibility.findUnique.mockResolvedValue(makeResponsibility({ agent: { supervisorUserId: null } }));
      const svc = new TriggerService(
        prisma,
        makeInngest() as never,
        makeConfig() as never,
        makeShield() as never,
        makeEvents() as never,
      );

      const result = await svc.runCloseoutReviewForTenant(10);

      expect(result).toEqual({ episodesOpened: 0, skipped: 'no_supervisor' });
      expect(mockFindLoads).not.toHaveBeenCalled();
    });

    it('returns 0 opened when no delivered-uninvoiced loads are found', async () => {
      const prisma = createMockPrisma();
      prisma.deskResponsibility.findUnique.mockResolvedValue(
        makeResponsibility({ conditions: { minHoursSinceDelivery: 48 } }),
      );
      mockFindLoads.mockResolvedValue([]);
      const svc = new TriggerService(
        prisma,
        makeInngest() as never,
        makeConfig() as never,
        makeShield() as never,
        makeEvents() as never,
      );

      const result = await svc.runCloseoutReviewForTenant(10);

      expect(result).toEqual({ episodesOpened: 0 });
      expect(prisma.deskEpisode.findFirst).not.toHaveBeenCalled();
      // fan-out receives the snapshotted window
      expect(mockFindLoads).toHaveBeenCalledWith(prisma, 10, { minHoursSinceDelivery: 48 });
    });

    it('opens a new load episode and publishes the closeout Inngest event', async () => {
      const prisma = createMockPrisma();
      prisma.deskResponsibility.findUnique.mockResolvedValue(makeResponsibility());
      prisma.deskEntitySuppression.findFirst.mockResolvedValue(null);
      prisma.deskEpisode.findFirst.mockResolvedValue(null);
      prisma.deskEpisode.create.mockResolvedValue({ id: 'ep-new' });
      mockFindLoads.mockResolvedValue([makeLoad()]);
      const inngest = makeInngest();
      const svc = new TriggerService(
        prisma,
        inngest as never,
        makeConfig() as never,
        makeShield() as never,
        makeEvents() as never,
      );

      const result = await svc.runCloseoutReviewForTenant(10);

      expect(result).toEqual({ episodesOpened: 1, episodesReused: 0 });
      // entity is a load, not an invoice
      expect(prisma.deskEpisode.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ entityType: 'load', entityId: 'LD-20260518-001' }) }),
      );
      expect(inngest.send).toHaveBeenCalledWith(
        'sally/desk.closeout_review.run',
        expect.objectContaining({ episodeId: 'ep-new', tenantId: 10, loadNumber: 'LD-20260518-001' }),
        expect.objectContaining({ id: expect.stringMatching(/^closeout_review:load:LD-20260518-001:/) }),
      );
    });

    it('skips a suppressed load — no episode, no event', async () => {
      const prisma = createMockPrisma();
      prisma.deskResponsibility.findUnique.mockResolvedValue(makeResponsibility());
      prisma.deskEntitySuppression.findFirst.mockResolvedValue({ id: 'sup-1', suppressUntil: null });
      mockFindLoads.mockResolvedValue([makeLoad()]);
      const inngest = makeInngest();
      const svc = new TriggerService(
        prisma,
        inngest as never,
        makeConfig() as never,
        makeShield() as never,
        makeEvents() as never,
      );

      const result = await svc.runCloseoutReviewForTenant(10);

      expect(result).toEqual({ episodesOpened: 0, episodesReused: 0 });
      expect(prisma.deskEpisode.create).not.toHaveBeenCalled();
      expect(inngest.send).not.toHaveBeenCalled();
      expect(prisma.deskEntitySuppression.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            responsibilityKey: 'closeout_review',
            entityType: 'load',
            entityId: 'LD-20260518-001',
          }),
        }),
      );
    });

    it('caps fan-out at DESK_CLOSEOUT_MAX_FANOUT when set', async () => {
      const prisma = createMockPrisma();
      prisma.deskResponsibility.findUnique.mockResolvedValue(makeResponsibility());
      prisma.deskEntitySuppression.findFirst.mockResolvedValue(null);
      prisma.deskEpisode.findFirst.mockResolvedValue(null);
      prisma.deskEpisode.create.mockResolvedValue({ id: 'ep-cap' });
      mockFindLoads.mockResolvedValue([
        makeLoad({ loadNumber: 'A' }),
        makeLoad({ loadNumber: 'B' }),
        makeLoad({ loadNumber: 'C' }),
      ]);
      const inngest = makeInngest();
      const svc = new TriggerService(
        prisma,
        inngest as never,
        makeConfig({ DESK_CLOSEOUT_MAX_FANOUT: 1 }) as never,
        makeShield() as never,
        makeEvents() as never,
      );

      const result = await svc.runCloseoutReviewForTenant(10);

      expect(result.episodesOpened).toBe(1);
      expect(prisma.deskEpisode.create).toHaveBeenCalledTimes(1);
    });
  });

  // Keep a Prisma type import referenced so the file doesn't lose its
  // dependency if someone trims imports during a refactor (trigger.service
  // signature narrows on `Prisma.InputJsonValue`).
  it('module imports Prisma types', () => {
    const _typeRef: Prisma.InputJsonValue = {};
    expect(_typeRef).toBeDefined();
  });

  describe('runDocumentExpiryForTenant', () => {
    const mockFanOut = findDriverExpiryFindingsForTenant as jest.MockedFunction<
      typeof findDriverExpiryFindingsForTenant
    >;

    function makeFinding(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        findingId: 'f1',
        driverId: 'DRV-1',
        driverName: 'Maria Lopez',
        severity: 'WARNING' as const,
        credentialType: 'medical_card' as const,
        credentialLabel: 'Medical card',
        dueDate: '2026-06-02',
        recommendation: 'Schedule DOT physical.',
        ...overrides,
      };
    }

    beforeEach(() => mockFanOut.mockReset());

    it('returns responsibility_not_seeded when the row is missing', async () => {
      const prisma = createMockPrisma();
      prisma.deskResponsibility.findUnique.mockResolvedValue(null);
      const svc = new TriggerService(
        prisma,
        makeInngest() as never,
        makeConfig() as never,
        makeShield() as never,
        makeEvents() as never,
      );

      const result = await svc.runDocumentExpiryForTenant(10);

      expect(result).toEqual({ episodesOpened: 0, skipped: 'responsibility_not_seeded' });
      expect(mockFanOut).not.toHaveBeenCalled();
    });

    it('returns no_supervisor when the agent has no supervisor', async () => {
      const prisma = createMockPrisma();
      prisma.deskResponsibility.findUnique.mockResolvedValue(makeResponsibility({ agent: { supervisorUserId: null } }));
      const svc = new TriggerService(
        prisma,
        makeInngest() as never,
        makeConfig() as never,
        makeShield() as never,
        makeEvents() as never,
      );

      const result = await svc.runDocumentExpiryForTenant(10);

      expect(result).toEqual({ episodesOpened: 0, skipped: 'no_supervisor' });
      expect(mockFanOut).not.toHaveBeenCalled();
    });

    it('stale-audit guard: triggers a DRIVERS audit and skips when findings are stale', async () => {
      const prisma = createMockPrisma();
      prisma.deskResponsibility.findUnique.mockResolvedValue(makeResponsibility());
      mockFanOut.mockResolvedValue({ status: 'stale_audit', lastCompletedAt: null });
      const shield = makeShield();
      const inngest = makeInngest();
      const svc = new TriggerService(
        prisma,
        inngest as never,
        makeConfig() as never,
        shield as never,
        makeEvents() as never,
      );

      const result = await svc.runDocumentExpiryForTenant(10);

      expect(result).toEqual({ episodesOpened: 0, skipped: 'stale_audit' });
      expect(shield.triggerAudit).toHaveBeenCalledWith({ tenantId: 10, scope: 'DRIVERS', triggeredBy: 'SCHEDULED' });
      expect(prisma.deskEpisode.create).not.toHaveBeenCalled();
      expect(inngest.send).not.toHaveBeenCalled();
    });

    it('returns 0 opened when there are no findings', async () => {
      const prisma = createMockPrisma();
      prisma.deskResponsibility.findUnique.mockResolvedValue(makeResponsibility());
      mockFanOut.mockResolvedValue({ status: 'ok', findings: [] });
      const svc = new TriggerService(
        prisma,
        makeInngest() as never,
        makeConfig() as never,
        makeShield() as never,
        makeEvents() as never,
      );

      const result = await svc.runDocumentExpiryForTenant(10);

      expect(result).toEqual({ episodesOpened: 0 });
      expect(prisma.deskEpisode.findFirst).not.toHaveBeenCalled();
    });

    it('opens an episode, dedupes on (driver, credential), and publishes the document_expiry event', async () => {
      const prisma = createMockPrisma();
      prisma.deskResponsibility.findUnique.mockResolvedValue(makeResponsibility());
      prisma.deskEntitySuppression.findFirst.mockResolvedValue(null);
      prisma.deskEpisode.findFirst.mockResolvedValue(null);
      prisma.deskEpisode.create.mockResolvedValue({ id: 'ep-new' });
      mockFanOut.mockResolvedValue({ status: 'ok', findings: [makeFinding()] });
      const inngest = makeInngest();
      const svc = new TriggerService(
        prisma,
        inngest as never,
        makeConfig() as never,
        makeShield() as never,
        makeEvents() as never,
      );

      const result = await svc.runDocumentExpiryForTenant(10);

      expect(result).toEqual({ episodesOpened: 1, episodesReused: 0 });
      expect(prisma.deskEpisode.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ entityType: 'driver', entityId: 'DRV-1' }),
        }),
      );
      expect(inngest.send).toHaveBeenCalledWith(
        'sally/desk.document_expiry.run',
        expect.objectContaining({
          episodeId: 'ep-new',
          tenantId: 10,
          driverId: 'DRV-1',
          credentialType: 'medical_card',
        }),
        expect.objectContaining({ id: expect.stringMatching(/^document_expiry:driver:DRV-1:medical_card:/) }),
      );
    });

    it('stashes the credentialType on the conditions snapshot for hydrate', async () => {
      const prisma = createMockPrisma();
      prisma.deskResponsibility.findUnique.mockResolvedValue(makeResponsibility());
      prisma.deskEntitySuppression.findFirst.mockResolvedValue(null);
      prisma.deskEpisode.findFirst.mockResolvedValue(null);
      prisma.deskEpisode.create.mockResolvedValue({ id: 'ep-new' });
      mockFanOut.mockResolvedValue({ status: 'ok', findings: [makeFinding({ credentialType: 'cdl' })] });
      const svc = new TriggerService(
        prisma,
        makeInngest() as never,
        makeConfig() as never,
        makeShield() as never,
        makeEvents() as never,
      );

      await svc.runDocumentExpiryForTenant(10);

      const createArg = prisma.deskEpisode.create.mock.calls[0][0];
      expect(createArg.data.conditionsSnapshot).toMatchObject({ __credentialType: 'cdl' });
    });
  });

  describe('runByKey — generic dispatch', () => {
    it('routes ar_followup to runArFollowupForTenant', async () => {
      const prisma = createMockPrisma();
      prisma.deskResponsibility.findUnique.mockResolvedValue(null);
      const svc = new TriggerService(
        prisma,
        makeInngest() as never,
        makeConfig() as never,
        makeShield() as never,
        makeEvents() as never,
      );

      const spy = jest.spyOn(svc, 'runArFollowupForTenant');
      await svc.runByKey('ar_followup', 10);

      expect(spy).toHaveBeenCalledWith(10);
    });

    it('routes closeout_review to runCloseoutReviewForTenant', async () => {
      const prisma = createMockPrisma();
      prisma.deskResponsibility.findUnique.mockResolvedValue(null);
      const svc = new TriggerService(
        prisma,
        makeInngest() as never,
        makeConfig() as never,
        makeShield() as never,
        makeEvents() as never,
      );

      const spy = jest.spyOn(svc, 'runCloseoutReviewForTenant');
      await svc.runByKey('closeout_review', 10);

      expect(spy).toHaveBeenCalledWith(10);
    });

    it('routes document_expiry to runDocumentExpiryForTenant', async () => {
      const prisma = createMockPrisma();
      prisma.deskResponsibility.findUnique.mockResolvedValue(null);
      const svc = new TriggerService(
        prisma,
        makeInngest() as never,
        makeConfig() as never,
        makeShield() as never,
        makeEvents() as never,
      );

      const spy = jest.spyOn(svc, 'runDocumentExpiryForTenant');
      await svc.runByKey('document_expiry', 10);

      expect(spy).toHaveBeenCalledWith(10);
    });

    it('routes settlement_review to runSettlementReviewForTenant', async () => {
      const prisma = createMockPrisma();
      prisma.deskResponsibility.findUnique.mockResolvedValue(null);
      const svc = new TriggerService(
        prisma,
        makeInngest() as never,
        makeConfig() as never,
        makeShield() as never,
        makeEvents() as never,
      );

      const spy = jest.spyOn(svc, 'runSettlementReviewForTenant');
      await svc.runByKey('settlement_review', 10);

      expect(spy).toHaveBeenCalledWith(10);
    });

    it('returns the wrapped run result verbatim', async () => {
      const prisma = createMockPrisma();
      prisma.deskResponsibility.findUnique.mockResolvedValue(null);
      const svc = new TriggerService(
        prisma,
        makeInngest() as never,
        makeConfig() as never,
        makeShield() as never,
        makeEvents() as never,
      );

      const result = await svc.runByKey('ar_followup', 10);

      expect(result).toEqual({ episodesOpened: 0, skipped: 'responsibility_not_seeded' });
    });

    it('throws for an unknown key without calling any run method', async () => {
      const prisma = createMockPrisma();
      const svc = new TriggerService(
        prisma,
        makeInngest() as never,
        makeConfig() as never,
        makeShield() as never,
        makeEvents() as never,
      );

      await expect(svc.runByKey('not_a_responsibility', 10)).rejects.toThrow(/No run method wired/);
      expect(prisma.deskResponsibility.findUnique).not.toHaveBeenCalled();
    });
  });
});
