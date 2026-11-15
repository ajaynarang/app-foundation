import { ConflictException, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { OutboundAllowKind, Prisma } from '@appshore/db';
import { OUTBOUND_MODE } from '@appshore/kernel/infrastructure/outbound/outbound-mode';
import { encodeCursor } from '@appshore/kernel/shared/utils/cursor-pagination';
import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import { createOutboundPolicy } from '../../../infrastructure/outbound/testing/outbound-policy.testing';
import { OUTBOUND_ALLOW_LIST_CAP, OutboundAdminService } from '../outbound-admin.service';

const createdAt = new Date('2026-11-13T10:00:00.000Z');

function prismaMock() {
  return {
    outboundAllowEntry: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    outboundSuppression: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  };
}

function setup(mode: (typeof OUTBOUND_MODE)[keyof typeof OUTBOUND_MODE] = OUTBOUND_MODE.ALLOWLIST) {
  const prisma = prismaMock();
  const policy = createOutboundPolicy(mode, prisma, { bootstrap: 'first@admin.test' });
  jest.spyOn(policy, 'invalidate');
  const service = new OutboundAdminService(prisma as unknown as PrismaService, policy);
  return { prisma, policy, service };
}

const entryRow = {
  id: '0193a1b2-0000-7000-8000-000000000001',
  kind: OutboundAllowKind.EMAIL,
  value: 'qa@example.com',
  note: null,
  createdAt,
  createdBy: { userId: 'usr_abc', email: 'admin@example.com', firstName: 'Ada', lastName: 'Admin' },
};

describe('OutboundAdminService', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'warn').mockImplementation());
  afterEach(() => jest.restoreAllMocks());

  it('reports the mode, the environment and how many bootstrap entries there are', () => {
    const previous = process.env.ENV_TYPE;
    process.env.ENV_TYPE = 'sandbox';
    try {
      expect(setup().service.getStatus()).toEqual({
        mode: 'allowlist',
        isLive: false,
        environment: 'staging',
        bootstrapEntries: 1,
      });
    } finally {
      if (previous === undefined) delete process.env.ENV_TYPE;
      else process.env.ENV_TYPE = previous;
    }
  });

  describe('listEntries', () => {
    it('reads a capped list and names the author by public id, never the Int key', async () => {
      const { prisma, service } = setup();
      prisma.outboundAllowEntry.findMany.mockResolvedValue([entryRow]);

      const entries = await service.listEntries();

      expect(prisma.outboundAllowEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: OUTBOUND_ALLOW_LIST_CAP }),
      );
      expect(entries).toEqual([
        {
          id: entryRow.id,
          kind: 'EMAIL',
          value: 'qa@example.com',
          note: null,
          createdAt: createdAt.toISOString(),
          createdBy: { userId: 'usr_abc', email: 'admin@example.com', firstName: 'Ada', lastName: 'Admin' },
        },
      ]);
      expect(JSON.stringify(entries)).not.toMatch(/createdById|"dbId"/);
    });
  });

  describe('createEntry', () => {
    it('normalizes the value, stores it with a uuid id and drops the gate cache', async () => {
      const { prisma, policy, service } = setup();
      prisma.outboundAllowEntry.create.mockResolvedValue(entryRow);

      await service.createEntry({ kind: OutboundAllowKind.EMAIL, value: ' QA@Example.com ', note: '  QA inbox ' }, 7);

      expect(prisma.outboundAllowEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ kind: 'EMAIL', value: 'qa@example.com', note: 'QA inbox', createdById: 7 }),
        }),
      );
      expect(prisma.outboundAllowEntry.create.mock.calls[0][0].data.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(policy.invalidate).toHaveBeenCalled();
    });

    it('stores a phone as + and digits', async () => {
      const { prisma, service } = setup();
      prisma.outboundAllowEntry.create.mockResolvedValue({ ...entryRow, kind: 'PHONE', value: '+919812345678' });

      await service.createEntry({ kind: OutboundAllowKind.PHONE, value: '+91 98123 45678' }, 7);

      expect(prisma.outboundAllowEntry.create.mock.calls[0][0].data.value).toBe('+919812345678');
    });

    it.each([
      [OutboundAllowKind.EMAIL, 'not-an-email'],
      [OutboundAllowKind.EMAIL_DOMAIN, 'nodot'],
      [OutboundAllowKind.PHONE, '12'],
      [OutboundAllowKind.HOST, 'https://x.test/path'],
    ])('refuses a %s that does not look like one, naming the field', async (kind, value) => {
      const { prisma, service } = setup();

      const error = await service.createEntry({ kind, value }, 7).catch((e) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.getResponse()).toMatchObject({ fieldErrors: { value: expect.any(String) } });
      expect(prisma.outboundAllowEntry.create).not.toHaveBeenCalled();
    });

    it('refuses a public mail domain', async () => {
      const { service } = setup();
      await expect(
        service.createEntry({ kind: OutboundAllowKind.EMAIL_DOMAIN, value: '@Gmail.com' }, 7),
      ).rejects.toThrow(/public mail domain/);
    });

    it('answers 409 for an entry already on the list', async () => {
      const { prisma, service } = setup();
      prisma.outboundAllowEntry.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
      );

      await expect(service.createEntry({ kind: OutboundAllowKind.EMAIL, value: 'qa@example.com' }, 7)).rejects.toThrow(
        ConflictException,
      );
    });

    it('refuses to add anything in live mode, where the list is not used', async () => {
      const { prisma, service } = setup(OUTBOUND_MODE.LIVE);

      await expect(service.createEntry({ kind: OutboundAllowKind.EMAIL, value: 'qa@example.com' }, 7)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.outboundAllowEntry.create).not.toHaveBeenCalled();
    });
  });

  describe('deleteEntry', () => {
    it('deletes by public id and drops the gate cache', async () => {
      const { prisma, policy, service } = setup();

      await service.deleteEntry(entryRow.id);

      expect(prisma.outboundAllowEntry.deleteMany).toHaveBeenCalledWith({ where: { id: entryRow.id } });
      expect(policy.invalidate).toHaveBeenCalled();
    });

    it('answers 404 for an unknown id', async () => {
      const { prisma, service } = setup();
      prisma.outboundAllowEntry.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.deleteEntry(entryRow.id)).rejects.toThrow(NotFoundException);
    });
  });

  describe('listSuppressions', () => {
    const row = (n: number) => ({
      id: `0193a1b2-0000-7000-8000-00000000000${n}`,
      channel: 'sms',
      recipient: '***1111',
      subject: '•••• is your code',
      source: 'sign-in-code',
      createdAt: new Date(createdAt.getTime() - n * 1000),
      tenant: n === 1 ? { tenantId: 'acme', companyName: 'Acme' } : null,
    });

    it('returns a cursor page, newest first, naming the tenant by its public id', async () => {
      const { prisma, service } = setup();
      prisma.outboundSuppression.findMany.mockResolvedValue([row(1), row(2), row(3)]);
      prisma.outboundSuppression.count.mockResolvedValue(3);

      const page = await service.listSuppressions({ limit: 2 });

      expect(prisma.outboundSuppression.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 3 }),
      );
      expect(page.total).toBe(3);
      expect(page.items).toHaveLength(2);
      expect(page.items[0]).toEqual({
        id: row(1).id,
        channel: 'sms',
        recipient: '***1111',
        subject: '•••• is your code',
        source: 'sign-in-code',
        createdAt: row(1).createdAt.toISOString(),
        tenant: { tenantId: 'acme', companyName: 'Acme' },
      });
      expect(page.nextCursor).toBe(encodeCursor(row(2).createdAt, row(2).id));
    });

    it('reads after the cursor', async () => {
      const { prisma, service } = setup();

      await service.listSuppressions({ cursor: encodeCursor(row(2).createdAt, row(2).id) });

      expect(prisma.outboundSuppression.findMany.mock.calls[0][0].where).toHaveProperty('OR');
    });

    it('refuses a malformed cursor before reading', async () => {
      const { prisma, service } = setup();

      await expect(service.listSuppressions({ cursor: 'garbage' })).rejects.toThrow(BadRequestException);
      expect(prisma.outboundSuppression.findMany).not.toHaveBeenCalled();
    });
  });
});
