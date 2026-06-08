import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { LoadShareLinkService } from '../load-share-link.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../../../infrastructure/events/sally-events.constants';

describe('LoadShareLinkService', () => {
  let service: LoadShareLinkService;
  let prisma: any;
  let events: jest.Mocked<DomainEventService>;

  const tenantId = 1;
  const otherTenantId = 2;
  const userId = 42;
  const baseLoad = {
    id: 100,
    tenantId,
    loadNumber: 'LD-20260430-001',
  };

  beforeEach(async () => {
    prisma = {
      load: {
        findFirst: jest.fn(),
      },
      loadShareLink: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    events = {
      emit: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<DomainEventService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoadShareLinkService,
        { provide: PrismaService, useValue: prisma },
        { provide: DomainEventService, useValue: events },
      ],
    }).compile();

    service = module.get<LoadShareLinkService>(LoadShareLinkService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── issue ──

  describe('issue', () => {
    it('mints a 22-char nanoid token, no LD- prefix and no embedded loadNumber', async () => {
      prisma.load.findFirst.mockResolvedValue(baseLoad);
      prisma.loadShareLink.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 1, ...data, viewCount: 0, createdAt: new Date() }),
      );

      const link = await service.issue(tenantId, baseLoad.id, userId, {});

      expect(link.token).toHaveLength(22);
      expect(link.token).not.toContain('LD-');
      expect(link.token).not.toContain(baseLoad.loadNumber);
    });

    it('emits sally.load.share-link-issued', async () => {
      prisma.load.findFirst.mockResolvedValue(baseLoad);
      prisma.loadShareLink.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 7, ...data, viewCount: 0, createdAt: new Date() }),
      );

      await service.issue(tenantId, baseLoad.id, userId, {});

      expect(events.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.LOAD_SHARE_LINK_ISSUED,
        tenantId,
        expect.objectContaining({
          loadId: baseLoad.id,
          loadNumber: baseLoad.loadNumber,
          shareLinkId: 7,
        }),
      );
    });

    it('refuses to issue for a load belonging to another tenant', async () => {
      prisma.load.findFirst.mockResolvedValue(null);

      await expect(service.issue(otherTenantId, baseLoad.id, userId, {})).rejects.toThrow(NotFoundException);
      expect(prisma.loadShareLink.create).not.toHaveBeenCalled();
    });

    it('persists optional recipient and expiresAt', async () => {
      prisma.load.findFirst.mockResolvedValue(baseLoad);
      prisma.loadShareLink.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 1, ...data, viewCount: 0, createdAt: new Date() }),
      );

      await service.issue(tenantId, baseLoad.id, userId, {
        recipient: 'shipper@acme.com',
        expiresAt: '2030-01-01T00:00:00Z',
      });

      expect(prisma.loadShareLink.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            recipient: 'shipper@acme.com',
            expiresAt: new Date('2030-01-01T00:00:00Z'),
            createdBy: userId,
            tenantId,
            loadId: baseLoad.id,
          }),
        }),
      );
    });
  });

  // ── revoke ──

  describe('revoke', () => {
    it('sets revokedAt, revokedBy, and emits sally.load.share-link-revoked', async () => {
      const link = { id: 9, loadId: baseLoad.id, tenantId, revokedAt: null };
      prisma.loadShareLink.findFirst.mockResolvedValue(link);
      prisma.loadShareLink.update.mockImplementation(({ data }: any) => Promise.resolve({ ...link, ...data }));

      const revoked = await service.revoke(tenantId, link.id, userId);

      expect(revoked.revokedAt).toBeInstanceOf(Date);
      expect(revoked.revokedBy).toBe(userId);
      expect(events.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.LOAD_SHARE_LINK_REVOKED,
        tenantId,
        expect.objectContaining({ loadId: baseLoad.id, shareLinkId: link.id }),
      );
    });

    it('is idempotent — already-revoked link returned without re-emitting', async () => {
      const alreadyRevoked = {
        id: 9,
        loadId: baseLoad.id,
        tenantId,
        revokedAt: new Date('2026-01-01'),
        revokedBy: userId,
      };
      prisma.loadShareLink.findFirst.mockResolvedValue(alreadyRevoked);

      const result = await service.revoke(tenantId, alreadyRevoked.id, userId);

      expect(result).toBe(alreadyRevoked);
      expect(prisma.loadShareLink.update).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for cross-tenant revoke', async () => {
      prisma.loadShareLink.findFirst.mockResolvedValue(null);

      await expect(service.revoke(otherTenantId, 9, userId)).rejects.toThrow(NotFoundException);
    });
  });

  // ── resolveActive ──

  describe('resolveActive', () => {
    it('returns null for an unknown token', async () => {
      prisma.loadShareLink.findUnique.mockResolvedValue(null);

      expect(await service.resolveActive('nope')).toBeNull();
    });

    it('returns null for a revoked token', async () => {
      prisma.loadShareLink.findUnique.mockResolvedValue({
        id: 1,
        token: 't',
        revokedAt: new Date('2026-01-01'),
        expiresAt: null,
      });

      expect(await service.resolveActive('t')).toBeNull();
      expect(prisma.loadShareLink.update).not.toHaveBeenCalled();
    });

    it('returns null for an expired token', async () => {
      prisma.loadShareLink.findUnique.mockResolvedValue({
        id: 1,
        token: 't',
        revokedAt: null,
        expiresAt: new Date('2020-01-01'),
      });

      expect(await service.resolveActive('t')).toBeNull();
      expect(prisma.loadShareLink.update).not.toHaveBeenCalled();
    });

    it('increments viewCount and lastViewedAt and returns the updated link', async () => {
      prisma.loadShareLink.findUnique.mockResolvedValue({
        id: 1,
        token: 't',
        revokedAt: null,
        expiresAt: null,
        viewCount: 0,
      });
      prisma.loadShareLink.update.mockResolvedValue({
        id: 1,
        token: 't',
        viewCount: 1,
        lastViewedAt: new Date(),
      });

      const resolved = await service.resolveActive('t');

      expect(resolved?.viewCount).toBe(1);
      expect(resolved?.lastViewedAt).toBeInstanceOf(Date);
      expect(prisma.loadShareLink.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            viewCount: { increment: 1 },
            lastViewedAt: expect.any(Date),
          }),
        }),
      );
    });
  });
});
