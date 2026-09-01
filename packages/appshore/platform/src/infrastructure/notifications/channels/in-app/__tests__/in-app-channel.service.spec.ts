import { Test } from '@nestjs/testing';
import { NotificationCategory, NotificationType } from '@appshore/db';
import { InAppChannelService } from '../in-app-channel.service';
import { PrismaService } from '../../../../database/prisma.service';
import { AppCacheService } from '../../../../cache/app-cache.service';
import { NotificationPolicyRegistry } from '../../../notification-policy.registry';
import { CHANNEL_RULES, NOTIFICATION_URGENCIES, policy } from '../../../notification-policy';

describe('InAppChannelService', () => {
  let service: InAppChannelService;
  let prisma: any;
  const cache = { del: jest.fn().mockResolvedValue(undefined) };
  // One app-shaped policy so the group label comes from the registry, as it does in production.
  const appPolicies = {
    [NotificationType.TENANT_REGISTRATION_CONFIRMATION]: policy(
      NotificationCategory.SYSTEM,
      NOTIFICATION_URGENCIES.TIMELY,
      {
        sms: CHANNEL_RULES.FALLBACK,
        groupLabel: 'entries approved',
      },
    ),
  };

  beforeEach(async () => {
    cache.del.mockClear();
    prisma = {
      notification: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      $transaction: jest.fn((fn: any, _opts?: any) => fn(prisma)),
    };
    const module = await Test.createTestingModule({
      providers: [
        InAppChannelService,
        { provide: PrismaService, useValue: prisma },
        { provide: AppCacheService, useValue: cache },
        { provide: NotificationPolicyRegistry, useValue: new NotificationPolicyRegistry(appPolicies) },
      ],
    }).compile();
    service = module.get(InAppChannelService);
  });

  describe('create with grouping', () => {
    it('drops a notification whose title or message is a test marker instead of persisting it (E57-5)', async () => {
      const result = await service.create({
        recipientId: 1,
        tenantId: 1,
        type: 'USER_INVITATION',
        category: 'TEAM',
        title: 'SSE live test (delete me)',
        message: 'anything',
      });

      expect(prisma.notification.create).not.toHaveBeenCalled();
      expect(prisma.notification.findFirst).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should create new notification when no group exists', async () => {
      prisma.notification.findFirst.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({
        id: 1,
        notificationId: 'test-123',
      });

      await service.create({
        recipientId: 1,
        tenantId: 1,
        type: 'USER_INVITATION',
        category: 'TEAM',
        title: 'Invitation #1',
        message: 'Sent',
      });

      expect(prisma.notification.create).toHaveBeenCalled();
      const data = prisma.notification.create.mock.calls[0][0].data;
      expect(data.groupKey).toBeDefined();
      expect(data.groupCount).toBe(1);
    });

    it('should append to existing group within 10 min window', async () => {
      prisma.notification.findFirst.mockResolvedValue({
        id: 1,
        groupCount: 2,
        groupKey: 'USER_INVITATION:1:123',
        metadata: { items: [{ title: 'A' }, { title: 'B' }] },
      });
      prisma.notification.update.mockResolvedValue({ id: 1 });

      await service.create({
        recipientId: 1,
        tenantId: 1,
        type: 'USER_INVITATION',
        category: 'TEAM',
        title: 'Invitation #3',
        message: 'Sent',
      });

      expect(prisma.notification.update).toHaveBeenCalled();
      const data = prisma.notification.update.mock.calls[0][0].data;
      expect(data.groupCount).toBe(3);
      expect(data.message).toBe('3 invitations sent');
    });

    it('should create new group when existing group has 20 items', async () => {
      prisma.notification.findFirst.mockResolvedValue({
        id: 1,
        groupCount: 20,
        groupKey: 'USER_INVITATION:1:123',
        metadata: { items: Array(20).fill({ title: 'X' }) },
      });
      prisma.notification.create.mockResolvedValue({ id: 2 });

      await service.create({
        recipientId: 1,
        tenantId: 1,
        type: 'USER_INVITATION',
        category: 'TEAM',
        title: 'Invitation #21',
        message: 'Sent',
      });

      expect(prisma.notification.create).toHaveBeenCalled();
    });

    it('should create notification without metadata', async () => {
      prisma.notification.findFirst.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({ id: 3 });

      await service.create({
        recipientId: 1,
        tenantId: 1,
        type: 'USER_JOINED',
        category: 'TEAM',
        title: 'New user',
        message: 'Welcome',
      });

      expect(prisma.notification.create).toHaveBeenCalled();
      const data = prisma.notification.create.mock.calls[0][0].data;
      expect(data.metadata).toBeDefined();
      expect(data.metadata.items).toHaveLength(1);
    });

    it('should create notification with custom metadata', async () => {
      prisma.notification.findFirst.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({ id: 4 });

      await service.create({
        recipientId: 1,
        tenantId: 1,
        type: 'SETTINGS_UPDATED',
        category: 'SYSTEM',
        title: 'Settings updated',
        message: 'Updated',
        metadata: { settingKey: 'theme' },
      });

      expect(prisma.notification.create).toHaveBeenCalled();
      const data = prisma.notification.create.mock.calls[0][0].data;
      expect(data.metadata.settingKey).toBe('theme');
      expect(data.metadata.items).toBeDefined();
    });
  });

  /**
   * Grouping collapses same-type notifications inside a 10-minute window into one
   * row. The window is the right unit for "you were approved into two categories of
   * the SAME tournament"; it is exactly the wrong unit across tournaments, and the
   * old lookup could not tell the two apart — it matched on type + user + tenant and
   * ignored the groupKey it had just written, so ANY row of the type in the window
   * was a group to join. Two ENTRY_APPROVEDs for two tournaments merged into one row
   * that kept the FIRST tournament's metadata: the second approval was retitled and
   * misattributed to a tournament the player was not approved into.
   */
  describe('grouping is scoped by groupScope — the app passes the tournament (E16-S7)', () => {
    /**
     * A findFirst that behaves like the database: it honours EVERY predicate the
     * service puts in the where clause, whatever shape that predicate takes. A mock
     * that returns a fixed row regardless of the where is what let the old bug live —
     * it can never observe a key failing to match. `{ not: null }` is evaluated as
     * Postgres would, so the OLD lookup (which asked only "is there ANY grouped row
     * of this type") is faithfully reproduced and these tests go red against it.
     */
    function matchesGroupKey(rowKey: string | null, predicate: any): boolean {
      if (predicate === undefined) return true;
      if (predicate !== null && typeof predicate === 'object') {
        return 'not' in predicate && predicate.not === null ? rowKey !== null : rowKey === predicate;
      }
      return rowKey === predicate;
    }

    function withStore(rows: any[]) {
      prisma.notification.findFirst.mockImplementation(
        async ({ where }: any) =>
          rows.find(
            (row) =>
              row.type === where.type &&
              row.userId === where.userId &&
              row.tenantId === where.tenantId &&
              matchesGroupKey(row.groupKey, where.groupKey) &&
              row.dismissedAt === null,
          ) ?? null,
      );
      prisma.notification.create.mockImplementation(async ({ data }: any) => {
        const row = { id: rows.length + 1, dismissedAt: null, ...data };
        rows.push(row);
        return row;
      });
      prisma.notification.update.mockImplementation(async ({ where, data }: any) => {
        const row = rows.find((candidate) => candidate.id === where.id);
        Object.assign(row, data);
        return row;
      });
      return rows;
    }

    const approval = (tournamentId: number, tournamentName: string) => ({
      recipientId: 1,
      tenantId: 7,
      type: 'TENANT_REGISTRATION_CONFIRMATION' as const,
      category: 'TEAM',
      title: 'Entry approved',
      message: `You're in! Your entry for Men's Singles was approved.`,
      metadata: { tournamentId, tournamentName, categoryId: tournamentId * 10 },
      groupScope: String(tournamentId),
    });

    it('does NOT merge two same-type notifications for DIFFERENT tournaments inside the window', async () => {
      const rows = withStore([]);

      await service.create(approval(31, 'Monsoon Smash 2026'));
      await service.create(approval(44, 'Winter Open 2026'));

      // Two subjects, two rows. Merging here is the misattribution bug: the second
      // player-visible approval would have inherited tournament 31's metadata.
      expect(prisma.notification.create).toHaveBeenCalledTimes(2);
      expect(prisma.notification.update).not.toHaveBeenCalled();
      expect(rows).toHaveLength(2);
      expect(rows.map((row) => row.metadata.tournamentId)).toEqual([31, 44]);
      expect(rows.map((row) => row.groupCount)).toEqual([1, 1]);
      // The tournament is what makes the two keys differ — nothing else does.
      expect(rows[0].groupKey).not.toBe(rows[1].groupKey);
    });

    it('still merges two same-type notifications for the SAME tournament — grouping is not broken, only scoped', async () => {
      const rows = withStore([]);

      await service.create(approval(31, 'Monsoon Smash 2026'));
      await service.create({
        ...approval(31, 'Monsoon Smash 2026'),
        title: 'Entry approved',
        message: `You're in! Your entry for Men's Doubles was approved.`,
      });

      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
      expect(prisma.notification.update).toHaveBeenCalledTimes(1);
      expect(rows).toHaveLength(1);
      expect(rows[0].groupCount).toBe(2);
      expect(rows[0].message).toBe('2 entries approved');
    });

    it('persists tournamentId + tournamentName on the row the inbox reads back', async () => {
      // listForUser does a bare findMany and returns metadata verbatim, so what is
      // written here IS what the mobile inbox renders as the tournament overline
      // and filters on.
      const rows = withStore([]);

      await service.create(approval(31, 'Monsoon Smash 2026'));

      const { data } = prisma.notification.create.mock.calls[0][0];
      expect(data.metadata).toEqual(
        expect.objectContaining({ tournamentId: 31, tournamentName: 'Monsoon Smash 2026', categoryId: 310 }),
      );
      expect(data.metadata.items).toHaveLength(1);
      expect(data.groupKey).toContain('31');
      expect(rows[0].metadata.tournamentName).toBe('Monsoon Smash 2026');
    });

    it('a notification with no tournament degrades to the shared slot and groups exactly as before', async () => {
      const rows = withStore([]);
      const joined = {
        recipientId: 1,
        tenantId: 7,
        type: 'USER_JOINED' as const,
        category: 'TEAM',
        title: 'New user',
        message: 'Welcome',
      };

      await service.create(joined);
      await service.create(joined);

      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
      expect(rows).toHaveLength(1);
      expect(rows[0].groupCount).toBe(2);
      expect(rows[0].message).toBe('2 users joined');
    });
  });
});
