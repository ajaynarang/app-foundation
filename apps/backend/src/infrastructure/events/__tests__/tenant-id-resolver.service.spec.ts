import { Test } from '@nestjs/testing';
import { TenantIdResolver } from '../tenant-id-resolver.service';
import { PrismaService } from '../../database/prisma.service';

describe('TenantIdResolver', () => {
  let resolver: TenantIdResolver;
  let prisma: { tenant: { findUnique: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      tenant: { findUnique: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [TenantIdResolver, { provide: PrismaService, useValue: prisma }],
    }).compile();

    resolver = module.get(TenantIdResolver);
  });

  describe('resolveToSlug', () => {
    it('returns the input unchanged when it is already a slug', async () => {
      const slug = await resolver.resolveToSlug('demo-northstar-2026');
      expect(slug).toBe('demo-northstar-2026');
      expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
    });

    it('looks up the slug for a numeric DB id', async () => {
      prisma.tenant.findUnique.mockResolvedValue({ tenantId: 'demo-northstar-2026' });

      const slug = await resolver.resolveToSlug('7');

      expect(slug).toBe('demo-northstar-2026');
      expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
        where: { id: 7 },
        select: { tenantId: true },
      });
    });

    it('returns null when tenant not found', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);

      const slug = await resolver.resolveToSlug('999');

      expect(slug).toBeNull();
    });

    it('caches the lookup so repeat calls do not re-query', async () => {
      prisma.tenant.findUnique.mockResolvedValue({ tenantId: 'demo-northstar-2026' });

      await resolver.resolveToSlug('7');
      await resolver.resolveToSlug('7');

      expect(prisma.tenant.findUnique).toHaveBeenCalledTimes(1);
    });
  });

  describe('resolveToDbId', () => {
    it('returns the parsed number when input is a numeric string', async () => {
      const id = await resolver.resolveToDbId('7');
      expect(id).toBe(7);
      expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
    });

    it('looks up the DB id for a slug', async () => {
      prisma.tenant.findUnique.mockResolvedValue({ id: 42 });

      const id = await resolver.resolveToDbId('demo-northstar-2026');

      expect(id).toBe(42);
      expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
        where: { tenantId: 'demo-northstar-2026' },
        select: { id: true },
      });
    });

    it('returns null when slug does not exist', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);

      const id = await resolver.resolveToDbId('unknown-slug');

      expect(id).toBeNull();
    });

    it('caches the lookup so repeat calls do not re-query', async () => {
      prisma.tenant.findUnique.mockResolvedValue({ id: 42 });

      await resolver.resolveToDbId('demo-northstar-2026');
      await resolver.resolveToDbId('demo-northstar-2026');

      expect(prisma.tenant.findUnique).toHaveBeenCalledTimes(1);
    });

    it('shares cache state with resolveToSlug', async () => {
      prisma.tenant.findUnique.mockResolvedValue({ tenantId: 'demo-northstar-2026' });

      // First call populates both directions of the cache.
      await resolver.resolveToSlug('7');

      // Reverse lookup should hit cache, not re-query.
      const id = await resolver.resolveToDbId('demo-northstar-2026');

      expect(id).toBe(7);
      expect(prisma.tenant.findUnique).toHaveBeenCalledTimes(1);
    });
  });
});
