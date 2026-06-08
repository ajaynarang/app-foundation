import { UserRole } from '@prisma/client';

import { DeskEpisodeController } from '../desk-episode.controller';

class FakeEpisodeService {
  listForTenant = jest.fn().mockResolvedValue({ rows: [], nextCursor: null });
  getForTenant = jest.fn().mockResolvedValue({ id: 'ep-1' });
  listHandled = jest
    .fn()
    .mockResolvedValue({ rows: [], nextCursor: null, summary: { total: 0, byOutcome: {}, autonomousPct: 0 } });
  resolveEpisode = jest.fn().mockResolvedValue({ id: 'ep-1', status: 'RESOLVED' });
}

class FakePrisma {
  tenant = { findUnique: jest.fn().mockResolvedValue({ timezone: 'America/Chicago' }) };
}

function makeController() {
  const service = new FakeEpisodeService();
  const prisma = new FakePrisma();
  const controller = new DeskEpisodeController(prisma as any, service as any);
  (controller as any).getTenantDbId = jest.fn().mockResolvedValue(10);
  return { controller, service, prisma };
}

describe('DeskEpisodeController', () => {
  describe('list (legacy episodes)', () => {
    it('resolves scope via role → DISPATCHER defaults to mine', async () => {
      const { controller, service } = makeController();
      await controller.list({ role: UserRole.DISPATCHER, dbId: 42 });
      expect(service.listForTenant).toHaveBeenCalledWith(10, expect.objectContaining({ scope: 'mine' }), {
        currentUserId: 42,
      });
    });

    it('forwards status + cursor + limit params', async () => {
      const { controller, service } = makeController();
      await controller.list({ role: UserRole.ADMIN, dbId: 1 }, 'RUNNING', '25', 'cursor-xyz');
      expect(service.listForTenant).toHaveBeenCalledWith(
        10,
        expect.objectContaining({ status: 'RUNNING', limit: 25, cursor: 'cursor-xyz', scope: 'all' }),
        expect.any(Object),
      );
    });
  });

  describe('get', () => {
    it('returns the detail payload', async () => {
      const { controller, service } = makeController();
      const result = await controller.get({ role: UserRole.ADMIN, dbId: 1 }, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(service.getForTenant).toHaveBeenCalledWith(10, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(result).toEqual({ id: 'ep-1' });
    });
  });

  describe('resolve', () => {
    it('forwards tenant + episode + user + note to the service', async () => {
      const { controller, service } = makeController();
      const result = await controller.resolve(
        { role: UserRole.DISPATCHER, dbId: 42 },
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        { note: 'Handled by phone' },
      );
      expect(service.resolveEpisode).toHaveBeenCalledWith(
        10,
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        42,
        'Handled by phone',
      );
      expect(result).toEqual({ id: 'ep-1', status: 'RESOLVED' });
    });

    it('resolves with no note (optional body field)', async () => {
      const { controller, service } = makeController();
      await controller.resolve({ role: UserRole.ADMIN, dbId: 1 }, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', {});
      expect(service.resolveEpisode).toHaveBeenCalledWith(10, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 1, undefined);
    });
  });

  describe('listHandled', () => {
    it('parses query params and forwards them to the service', async () => {
      const { controller, service } = makeController();
      await controller.listHandled(
        { role: UserRole.DISPATCHER, dbId: 42 },
        'all',
        '7d',
        undefined,
        undefined,
        'autumn',
        'followup_sent',
        'granite',
        '50',
        undefined,
      );
      expect(service.listHandled).toHaveBeenCalledWith(
        10,
        expect.objectContaining({
          scope: 'all',
          window: '7d',
          agent: 'autumn',
          outcome: 'followup_sent',
          q: 'granite',
          limit: 50,
        }),
        expect.objectContaining({ currentUserId: 42, tenantTimezone: 'America/Chicago' }),
      );
    });

    it('defaults scope by role when missing — DISPATCHER → mine', async () => {
      const { controller, service } = makeController();
      await controller.listHandled({ role: UserRole.DISPATCHER, dbId: 42 });
      expect(service.listHandled).toHaveBeenCalledWith(
        10,
        expect.objectContaining({ scope: 'mine' }),
        expect.any(Object),
      );
    });

    it('defaults scope by role when missing — ADMIN → all', async () => {
      const { controller, service } = makeController();
      await controller.listHandled({ role: UserRole.ADMIN, dbId: 1 });
      expect(service.listHandled).toHaveBeenCalledWith(
        10,
        expect.objectContaining({ scope: 'all' }),
        expect.any(Object),
      );
    });

    it('falls back to UTC when tenant has no timezone', async () => {
      const { controller, service, prisma } = makeController();
      prisma.tenant.findUnique.mockResolvedValue(null);
      await controller.listHandled({ role: UserRole.ADMIN, dbId: 1 });
      expect(service.listHandled).toHaveBeenCalledWith(
        10,
        expect.any(Object),
        expect.objectContaining({ tenantTimezone: 'UTC' }),
      );
    });

    it('forwards window=custom with from/to ISO timestamps', async () => {
      const { controller, service } = makeController();
      await controller.listHandled(
        { role: UserRole.ADMIN, dbId: 1 },
        'all',
        'custom',
        '2026-04-01T00:00:00.000Z',
        '2026-04-15T23:59:59.999Z',
      );
      expect(service.listHandled).toHaveBeenCalledWith(
        10,
        expect.objectContaining({
          window: 'custom',
          from: '2026-04-01T00:00:00.000Z',
          to: '2026-04-15T23:59:59.999Z',
        }),
        expect.any(Object),
      );
    });
  });
});
