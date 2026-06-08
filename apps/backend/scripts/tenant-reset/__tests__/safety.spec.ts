/**
 * Safety gate unit tests.
 */
// Mocked at top so the module's import of `readline/promises` resolves to our stub.
const questionMock = jest.fn();
jest.mock('node:readline/promises', () => ({
  createInterface: () => ({ question: questionMock, close: jest.fn() }),
}));

import { ALLOWED_TENANTS, SafetyError, assertSafeToProceed, promptSlugConfirmation, resolveTenant } from '../safety';
import type { PrismaClient } from '@prisma/client';

function mockPrisma(tenant: { id: number; tenantId: string; companyName: string } | null): PrismaClient {
  return {
    tenant: { findUnique: jest.fn().mockResolvedValue(tenant) },
  } as unknown as PrismaClient;
}

describe('safety gates', () => {
  const origEnv = process.env;
  const origStdin = process.stdin;
  const allowedSlug = ALLOWED_TENANTS[0];

  beforeEach(() => {
    process.env = {
      ...origEnv,
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/sally',
    };
  });

  afterAll(() => {
    process.env = origEnv;
    Object.defineProperty(process, 'stdin', { value: origStdin });
  });

  describe('assertSafeToProceed', () => {
    it('rejects when NODE_ENV=production', async () => {
      process.env.NODE_ENV = 'production';
      const prisma = mockPrisma(null);
      await expect(
        assertSafeToProceed(prisma, {
          tenantSlug: allowedSlug,
          mode: 'soft',
          yes: true,
          hardConfirm: false,
          dryRun: false,
        }),
      ).rejects.toThrow(/NODE_ENV=production/);
    });

    it('rejects when DATABASE_URL host looks like production', async () => {
      process.env.DATABASE_URL = 'postgresql://u:p@prod-db.example.com:5432/sally';
      const prisma = mockPrisma({
        id: 1,
        tenantId: allowedSlug,
        companyName: 'Co',
      });
      await expect(
        assertSafeToProceed(prisma, {
          tenantSlug: allowedSlug,
          mode: 'soft',
          yes: true,
          hardConfirm: false,
          dryRun: false,
        }),
      ).rejects.toThrow(/looks like production/);
    });

    it('rejects when DATABASE_URL is missing', async () => {
      delete process.env.DATABASE_URL;
      const prisma = mockPrisma(null);
      await expect(
        assertSafeToProceed(prisma, {
          tenantSlug: allowedSlug,
          mode: 'soft',
          yes: true,
          hardConfirm: false,
          dryRun: false,
        }),
      ).rejects.toThrow(/DATABASE_URL is not set/);
    });

    it('rejects when DATABASE_URL is not a valid URL', async () => {
      process.env.DATABASE_URL = 'not-a-url';
      const prisma = mockPrisma(null);
      await expect(
        assertSafeToProceed(prisma, {
          tenantSlug: allowedSlug,
          mode: 'soft',
          yes: true,
          hardConfirm: false,
          dryRun: false,
        }),
      ).rejects.toThrow(/not a valid URL/);
    });

    it('rejects when slug is not allowlisted', async () => {
      const prisma = mockPrisma(null);
      await expect(
        assertSafeToProceed(prisma, {
          tenantSlug: 'tenant_not_in_list',
          mode: 'soft',
          yes: true,
          hardConfirm: false,
          dryRun: false,
        }),
      ).rejects.toThrow(/not in the allowlist/);
    });

    it('rejects hard mode without --i-understand flag', async () => {
      const prisma = mockPrisma({
        id: 1,
        tenantId: allowedSlug,
        companyName: 'Co',
      });
      await expect(
        assertSafeToProceed(prisma, {
          tenantSlug: allowedSlug,
          mode: 'hard',
          yes: true,
          hardConfirm: false,
          dryRun: false,
        }),
      ).rejects.toThrow(/--i-understand-this-deletes-the-tenant/);
    });

    it('allows hard mode dry-run without the extra flag', async () => {
      const prisma = mockPrisma({
        id: 1,
        tenantId: allowedSlug,
        companyName: 'Co',
      });
      const result = await assertSafeToProceed(prisma, {
        tenantSlug: allowedSlug,
        mode: 'hard',
        yes: true,
        hardConfirm: false,
        dryRun: true,
      });
      expect(result.tenantIntId).toBe(1);
    });

    it('rejects when tenant does not exist', async () => {
      const prisma = mockPrisma(null);
      await expect(
        assertSafeToProceed(prisma, {
          tenantSlug: allowedSlug,
          mode: 'soft',
          yes: true,
          hardConfirm: false,
          dryRun: false,
        }),
      ).rejects.toThrow(/not found/);
    });

    it('passes for a valid soft-mode invocation with --yes', async () => {
      const prisma = mockPrisma({
        id: 42,
        tenantId: allowedSlug,
        companyName: 'Test Co',
      });
      const result = await assertSafeToProceed(prisma, {
        tenantSlug: allowedSlug,
        mode: 'soft',
        yes: true,
        hardConfirm: false,
        dryRun: false,
      });
      expect(result).toEqual({
        tenantIntId: 42,
        tenantSlug: allowedSlug,
        companyName: 'Test Co',
      });
    });

    it('passes for hard mode with both confirmations', async () => {
      const prisma = mockPrisma({
        id: 42,
        tenantId: allowedSlug,
        companyName: 'Test Co',
      });
      const result = await assertSafeToProceed(prisma, {
        tenantSlug: allowedSlug,
        mode: 'hard',
        yes: true,
        hardConfirm: true,
        dryRun: false,
      });
      expect(result.tenantIntId).toBe(42);
    });
  });

  describe('promptSlugConfirmation', () => {
    it('passes when user types the slug correctly', async () => {
      questionMock.mockResolvedValueOnce(allowedSlug);
      await expect(promptSlugConfirmation(allowedSlug)).resolves.toBeUndefined();
    });

    it('throws when user types a different slug', async () => {
      questionMock.mockResolvedValueOnce('wrong');
      await expect(promptSlugConfirmation(allowedSlug)).rejects.toThrow(/Confirmation text/);
    });

    it('trims whitespace from input before comparing', async () => {
      questionMock.mockResolvedValueOnce(`  ${allowedSlug}  \n`);
      await expect(promptSlugConfirmation(allowedSlug)).resolves.toBeUndefined();
    });

    it('is invoked by assertSafeToProceed when --yes is not set', async () => {
      questionMock.mockResolvedValueOnce(allowedSlug);
      const prisma = mockPrisma({
        id: 9,
        tenantId: allowedSlug,
        companyName: 'Co',
      });
      await expect(
        assertSafeToProceed(prisma, {
          tenantSlug: allowedSlug,
          mode: 'soft',
          yes: false,
          hardConfirm: false,
          dryRun: false,
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('resolveTenant', () => {
    it('returns tenant info when found', async () => {
      const prisma = mockPrisma({ id: 7, tenantId: 'x', companyName: 'XYZ' });
      const result = await resolveTenant(prisma, 'x');
      expect(result).toEqual({ id: 7, slug: 'x', companyName: 'XYZ' });
    });

    it('throws SafetyError when not found', async () => {
      const prisma = mockPrisma(null);
      await expect(resolveTenant(prisma, 'missing')).rejects.toBeInstanceOf(SafetyError);
    });
  });
});
