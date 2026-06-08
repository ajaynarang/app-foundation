import { findDriverExpiryFindingsForTenant } from '../fan-out';

/**
 * Unit coverage for the Document Expiry fan-out — the credential-expiry
 * discriminator over Shield DRIVERS findings + the stale-audit guard.
 */

function makePrisma(opts: { latestAuditCompletedAt?: Date | null; findings?: Array<Record<string, unknown>> }) {
  const latest = opts.latestAuditCompletedAt === undefined ? new Date() : opts.latestAuditCompletedAt;
  return {
    shieldAudit: {
      findFirst: jest.fn().mockResolvedValue(latest === null ? null : { completedAt: latest }),
    },
    shieldFinding: {
      findMany: jest.fn().mockResolvedValue(opts.findings ?? []),
    },
  } as never;
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'f1',
    entityId: 'DRV-1',
    entityName: 'Maria Lopez',
    severity: 'WARNING',
    regulation: '49 CFR 391.41', // medical card
    dueDate: new Date('2026-06-02T00:00:00Z'),
    recommendation: 'Schedule DOT physical.',
    ...overrides,
  };
}

describe('findDriverExpiryFindingsForTenant', () => {
  describe('stale-audit guard', () => {
    it('returns stale_audit when no completed audit exists', async () => {
      const prisma = makePrisma({ latestAuditCompletedAt: null });
      const result = await findDriverExpiryFindingsForTenant(prisma, 10);
      expect(result).toEqual({ status: 'stale_audit', lastCompletedAt: null });
    });

    it('returns stale_audit when the latest audit is older than the window', async () => {
      const old = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48h ago
      const prisma = makePrisma({ latestAuditCompletedAt: old });
      const result = await findDriverExpiryFindingsForTenant(prisma, 10, { staleAuditHours: 36 });
      expect(result).toMatchObject({ status: 'stale_audit' });
      expect((prisma as { shieldFinding: { findMany: jest.Mock } }).shieldFinding.findMany).not.toHaveBeenCalled();
    });

    it('proceeds when the latest audit is fresh', async () => {
      const fresh = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2h ago
      const prisma = makePrisma({ latestAuditCompletedAt: fresh, findings: [row()] });
      const result = await findDriverExpiryFindingsForTenant(prisma, 10, { staleAuditHours: 36 });
      expect(result.status).toBe('ok');
    });
  });

  describe('credential-expiry discriminator', () => {
    it('maps a medical-card expiry finding (391.41 → medical_card)', async () => {
      const prisma = makePrisma({ findings: [row()] });
      const result = await findDriverExpiryFindingsForTenant(prisma, 10);
      if (result.status !== 'ok') throw new Error('expected ok');
      expect(result.findings).toEqual([
        {
          findingId: 'f1',
          driverId: 'DRV-1',
          driverName: 'Maria Lopez',
          severity: 'WARNING',
          credentialType: 'medical_card',
          credentialLabel: 'Medical card',
          dueDate: '2026-06-02',
          recommendation: 'Schedule DOT physical.',
        },
      ]);
    });

    it('maps a CDL expiry finding (391.11 → cdl)', async () => {
      const prisma = makePrisma({
        findings: [row({ regulation: '49 CFR 391.11', severity: 'CRITICAL' })],
      });
      const result = await findDriverExpiryFindingsForTenant(prisma, 10);
      if (result.status !== 'ok') throw new Error('expected ok');
      expect(result.findings[0]).toMatchObject({ credentialType: 'cdl', credentialLabel: 'CDL', severity: 'CRITICAL' });
    });

    it('passes the open + dueDate + regulation filter to Prisma (not Driver.*Expiry)', async () => {
      const prisma = makePrisma({ findings: [] });
      await findDriverExpiryFindingsForTenant(prisma, 10);
      const where = (prisma as { shieldFinding: { findMany: jest.Mock } }).shieldFinding.findMany.mock.calls[0][0]
        .where;
      expect(where).toMatchObject({
        tenantId: 10,
        category: 'DRIVERS',
        isResolved: false,
        entityType: 'driver',
        dueDate: { not: null },
        regulation: { in: expect.arrayContaining(['49 CFR 391.11', '49 CFR 391.41']) },
      });
    });

    it('skips INFO/PASSED severities even if returned', async () => {
      const prisma = makePrisma({ findings: [row({ severity: 'INFO' }), row({ id: 'f2', severity: 'PASSED' })] });
      const result = await findDriverExpiryFindingsForTenant(prisma, 10);
      if (result.status !== 'ok') throw new Error('expected ok');
      expect(result.findings).toHaveLength(0);
    });

    it('falls back to entityId for driverName when entityName is null', async () => {
      const prisma = makePrisma({ findings: [row({ entityName: null })] });
      const result = await findDriverExpiryFindingsForTenant(prisma, 10);
      if (result.status !== 'ok') throw new Error('expected ok');
      expect(result.findings[0].driverName).toBe('DRV-1');
    });
  });
});
