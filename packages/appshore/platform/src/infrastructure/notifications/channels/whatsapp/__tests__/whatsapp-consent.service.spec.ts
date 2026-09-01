import { Test } from '@nestjs/testing';
import { WhatsAppConsentSource } from '@appshore/db';
import { PrismaService } from '../../../../database/prisma.service';
import { WhatsAppConsentService } from '../whatsapp-consent.service';

describe('WhatsAppConsentService', () => {
  let service: WhatsAppConsentService;
  const prisma = {
    whatsAppConsent: { findUnique: jest.fn(), upsert: jest.fn(), findMany: jest.fn() },
    user: { findFirst: jest.fn() },
  };
  const t = (iso: string) => new Date(iso);
  const row = (
    o: Partial<Record<'optedInAt' | 'optedOutAt' | 'marketingOptedInAt' | 'marketingOptedOutAt', Date | null>>,
  ) => ({
    optedInAt: null,
    optedOutAt: null,
    marketingOptedInAt: null,
    marketingOptedOutAt: null,
    ...o,
  });

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [WhatsAppConsentService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(WhatsAppConsentService);
    jest.clearAllMocks();
    prisma.whatsAppConsent.upsert.mockImplementation(async ({ create }: any) => row(create));
  });

  describe('get — absence means no', () => {
    it('no row → both false', async () => {
      prisma.whatsAppConsent.findUnique.mockResolvedValue(null);
      await expect(service.get(7)).resolves.toEqual({ optedIn: false, marketingOptedIn: false });
    });

    it('a yes that was later withdrawn is a no; a yes after a no is a yes', async () => {
      prisma.whatsAppConsent.findUnique.mockResolvedValueOnce(
        row({ optedInAt: t('2026-08-01T00:00:00Z'), optedOutAt: t('2026-08-02T00:00:00Z') }),
      );
      expect((await service.get(7)).optedIn).toBe(false);

      prisma.whatsAppConsent.findUnique.mockResolvedValueOnce(
        row({ optedInAt: t('2026-08-03T00:00:00Z'), optedOutAt: t('2026-08-02T00:00:00Z') }),
      );
      expect((await service.get(7)).optedIn).toBe(true);
    });

    it('a yes and a no in the same millisecond is a no — never send when it is ambiguous', async () => {
      const same = t('2026-08-01T00:00:00Z');
      prisma.whatsAppConsent.findUnique.mockResolvedValue(row({ optedInAt: same, optedOutAt: same }));
      expect((await service.get(7)).optedIn).toBe(false);
    });

    it('utility and marketing are separate yeses', async () => {
      prisma.whatsAppConsent.findUnique.mockResolvedValue(row({ optedInAt: t('2026-08-01T00:00:00Z') }));
      await expect(service.get(7)).resolves.toEqual({ optedIn: true, marketingOptedIn: false });
    });
  });

  describe('update — only the fields present move', () => {
    it('optedIn: true stamps optedInAt and leaves optedOutAt alone', async () => {
      await service.update(7, { optedIn: true }, WhatsAppConsentSource.SIGNUP);
      const { create, update, where } = prisma.whatsAppConsent.upsert.mock.calls[0][0];
      expect(where).toEqual({ userId: 7 });
      expect(create).toEqual({ userId: 7, source: 'SIGNUP', optedInAt: expect.any(Date) });
      expect(update).toEqual({ source: 'SIGNUP', optedInAt: expect.any(Date) });
      expect(update).not.toHaveProperty('optedOutAt');
    });

    it('optedIn: false stamps optedOutAt', async () => {
      await service.update(7, { optedIn: false }, WhatsAppConsentSource.SETTINGS);
      expect(prisma.whatsAppConsent.upsert.mock.calls[0][0].update).toEqual({
        source: 'SETTINGS',
        optedOutAt: expect.any(Date),
      });
    });

    it('marketing touches only the marketing fields', async () => {
      await service.update(7, { marketingOptedIn: true }, WhatsAppConsentSource.SETTINGS);
      const { update } = prisma.whatsAppConsent.upsert.mock.calls[0][0];
      expect(Object.keys(update).sort()).toEqual(['marketingOptedInAt', 'source']);
    });

    it('returns the resulting view', async () => {
      prisma.whatsAppConsent.upsert.mockResolvedValue(row({ optedInAt: t('2026-08-01T00:00:00Z') }));
      await expect(service.update(7, { optedIn: true }, WhatsAppConsentSource.SIGNUP)).resolves.toEqual({
        optedIn: true,
        marketingOptedIn: false,
      });
    });
  });

  describe('optOutByPhone — STOP', () => {
    it('finds the user by number and records an INBOUND_STOP no', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 9 });
      await expect(service.optOutByPhone('+919876543210')).resolves.toBe(true);
      expect(prisma.user.findFirst).toHaveBeenCalledWith({ where: { phone: '+919876543210' }, select: { id: true } });
      expect(prisma.whatsAppConsent.upsert.mock.calls[0][0].update).toEqual({
        source: 'INBOUND_STOP',
        optedOutAt: expect.any(Date),
      });
    });

    it('an unknown number is false and writes nothing', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.optOutByPhone('+910000000000')).resolves.toBe(false);
      expect(prisma.whatsAppConsent.upsert).not.toHaveBeenCalled();
    });
  });

  describe('consentedUserIds — one query for an audience', () => {
    it('applies the same yes-not-followed-by-no rule to every row', async () => {
      prisma.whatsAppConsent.findMany.mockResolvedValue([
        { userId: 1, optedInAt: t('2026-08-01T00:00:00Z'), optedOutAt: null },
        { userId: 2, optedInAt: t('2026-08-01T00:00:00Z'), optedOutAt: t('2026-08-05T00:00:00Z') },
        { userId: 3, optedInAt: null, optedOutAt: null },
      ]);
      await expect(service.consentedUserIds([1, 2, 3, 4])).resolves.toEqual(new Set([1]));
      expect(prisma.whatsAppConsent.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.whatsAppConsent.findMany.mock.calls[0][0].where).toEqual({ userId: { in: [1, 2, 3, 4] } });
    });

    it('asked for the MARKETING yes, reads the marketing fields and nothing else', async () => {
      prisma.whatsAppConsent.findMany.mockResolvedValue([
        {
          userId: 1,
          optedInAt: t('2026-08-01T00:00:00Z'),
          optedOutAt: null,
          marketingOptedInAt: null,
          marketingOptedOutAt: null,
        },
        {
          userId: 2,
          optedInAt: null,
          optedOutAt: null,
          marketingOptedInAt: t('2026-08-01T00:00:00Z'),
          marketingOptedOutAt: null,
        },
      ]);
      await expect(service.consentedUserIds([1, 2], 'marketing')).resolves.toEqual(new Set([2]));
      await expect(service.consentedUserIds([1, 2], 'utility')).resolves.toEqual(new Set([1]));
    });

    it('an empty audience is an empty set with no query', async () => {
      await expect(service.consentedUserIds([])).resolves.toEqual(new Set());
      expect(prisma.whatsAppConsent.findMany).not.toHaveBeenCalled();
    });
  });
});
