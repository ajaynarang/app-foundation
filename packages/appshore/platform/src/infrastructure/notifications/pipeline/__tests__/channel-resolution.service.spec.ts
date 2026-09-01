import { Test } from '@nestjs/testing';
import { DeliveryChannel, NotificationType } from '@appshore/db';
import { ChannelResolutionService } from '../channel-resolution.service';
import { WhatsAppConsentService } from '../../channels/whatsapp/whatsapp-consent.service';
import { PrismaService } from '../../../database/prisma.service';
import { NotificationPolicyRegistry } from '../../notification-policy.registry';
import { CHANNEL_RULES, NOTIFICATION_URGENCIES, policy } from '../../notification-policy';
import {
  WhatsAppTemplateRegistry,
  allParams,
  requiredParam,
  type WhatsAppTemplateMap,
} from '../../channels/whatsapp/whatsapp-template.registry';
import { NotificationCategory } from '@appshore/db';
import { DEFAULT_PLATFORM_TIMEZONE } from '../../../../config/platform-timezone';

const { ALWAYS, DEFAULT, OPT_IN, FALLBACK } = CHANNEL_RULES;
const { CRITICAL, TIMELY, INFORMATIONAL } = NOTIFICATION_URGENCIES;

/** App-shaped policies with the rules the tests read against (see the table above). */
const APP_POLICIES = {
  [NotificationType.TENANT_APPROVED]: policy(NotificationCategory.BILLING, TIMELY, { email: DEFAULT, sms: FALLBACK }),
  [NotificationType.USER_INVITATION]: policy(NotificationCategory.TEAM, TIMELY, {
    email: OPT_IN,
    sms: FALLBACK,
    whatsapp: DEFAULT,
  }),
  [NotificationType.ROLE_CHANGED]: policy(NotificationCategory.TEAM, CRITICAL, { inApp: ALWAYS, sms: FALLBACK }),
  [NotificationType.TENANT_REJECTED]: policy(NotificationCategory.SYSTEM, INFORMATIONAL, {
    email: OPT_IN,
    whatsapp: DEFAULT,
  }),
};
const APP_TEMPLATES: WhatsAppTemplateMap = {
  [NotificationType.USER_INVITATION]: {
    name: 'match_v1',
    languageCode: 'en',
    category: 'UTILITY',
    body: 'Match: {{1}} — {{2}}.',
    bodyValues: (ctx) => allParams(requiredParam(ctx.message), requiredParam(ctx.clubName)),
  },
  [NotificationType.TENANT_REJECTED]: {
    name: 'announce_v1',
    languageCode: 'en',
    category: 'MARKETING',
    body: '{{1}}. Reply STOP to opt out.',
    bodyValues: (ctx) => allParams(requiredParam(ctx.message)),
  },
};

const { IN_APP, EMAIL, PUSH, SMS, WHATSAPP } = DeliveryChannel;

/**
 * Fixture policies, bound over the platform map by type name (the names are borrowed; the
 * rules are what the tests read against):
 *  TENANT_APPROVED   BILLING · timely   · email default · sms fallback · whatsapp never
 *  USER_INVITATION   TEAM    · timely   · email optIn   · sms fallback · whatsapp default
 *  ROLE_CHANGED      TEAM    · CRITICAL · in-app always · sms fallback
 *  USER_JOINED       TEAM    · info     · email optIn   · sms never       (the platform's own)
 *  TENANT_REJECTED   SYSTEM  · info     · marketing WhatsApp
 */
describe('ChannelResolutionService', () => {
  let service: ChannelResolutionService;
  const consent = { consentedUserIds: jest.fn() };
  let prisma: {
    userPreferences: { findUnique: jest.Mock; findMany: jest.Mock };
    workspaceMember: { findUnique: jest.Mock; findMany: jest.Mock };
  };

  const asStaff = () => prisma.workspaceMember.findUnique.mockResolvedValue({ role: 'ADMIN' });
  const asPlayer = () => prisma.workspaceMember.findUnique.mockResolvedValue({ role: 'MEMBER' });
  const storedPrefs = (notificationPreferences: Record<string, Record<string, boolean>> | null) =>
    prisma.userPreferences.findUnique.mockResolvedValue({ notificationPreferences });
  const resolve = (
    type: NotificationType,
    tenantId = 1,
  ): ReturnType<ChannelResolutionService['resolveForNotification']> =>
    service.resolveForNotification({ userId: 1, tenantId, type });

  beforeEach(async () => {
    consent.consentedUserIds.mockReset().mockResolvedValue(new Set<number>());
    prisma = {
      userPreferences: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      workspaceMember: {
        findUnique: jest.fn().mockResolvedValue({ role: 'ADMIN' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const module = await Test.createTestingModule({
      providers: [
        ChannelResolutionService,
        { provide: PrismaService, useValue: prisma },
        { provide: WhatsAppConsentService, useValue: consent },
        {
          provide: NotificationPolicyRegistry,
          useValue: new NotificationPolicyRegistry(APP_POLICIES),
        },
        { provide: WhatsAppTemplateRegistry, useValue: new WhatsAppTemplateRegistry(APP_TEMPLATES) },
      ],
    }).compile();
    service = module.get(ChannelResolutionService);
  });

  describe('policy rules', () => {
    it('staff with no preferences get the policy defaults: in-app, push, email now; SMS as fallback', async () => {
      const result = await resolve(NotificationType.TENANT_APPROVED);

      expect(result.primary).toEqual([IN_APP, EMAIL, PUSH]);
      expect(result.fallback).toEqual([SMS]);
      expect(result.suppressed).toEqual({ [WHATSAPP]: 'POLICY_NEVER' });
      expect(result.suppressedByQuietHours).toBe(false);
    });

    it('never beats a stored yes', async () => {
      storedPrefs({ team: { sms: true } });

      const result = await resolve(NotificationType.USER_JOINED);

      expect(result.primary).not.toContain(SMS);
      expect(result.fallback).toEqual([]);
      expect(result.suppressed[SMS]).toBe('POLICY_NEVER');
    });

    it('always beats a stored no — the critical in-app record is written regardless', async () => {
      storedPrefs({ team: { inApp: false, push: false } });

      const result = await resolve(NotificationType.ROLE_CHANGED);

      expect(result.primary).toContain(IN_APP);
      expect(result.suppressed[PUSH]).toBe('USER_OPT_OUT');
    });

    it('optIn needs an explicit stored true', async () => {
      const silent = await resolve(NotificationType.USER_INVITATION);
      expect(silent.suppressed[EMAIL]).toBe('USER_OPT_OUT');

      storedPrefs({ team: { email: true } });
      const optedIn = await resolve(NotificationType.USER_INVITATION);
      expect(optedIn.primary).toContain(EMAIL);
    });

    it('fallback lands in fallback, not primary, and a stored no removes it', async () => {
      const on = await resolve(NotificationType.USER_INVITATION);
      expect(on.fallback).toEqual([SMS]);
      expect(on.primary).not.toContain(SMS);

      storedPrefs({ team: { sms: false } });
      const off = await resolve(NotificationType.USER_INVITATION);
      expect(off.fallback).toEqual([]);
      expect(off.suppressed[SMS]).toBe('USER_OPT_OUT');
    });

    it('reads the preference under the policy category, whatever the caller thinks the category is', async () => {
      storedPrefs({ team: { push: false }, team: { push: false } });

      const result = await resolve(NotificationType.USER_INVITATION);

      expect(result.suppressed[PUSH]).toBe('USER_OPT_OUT');
    });

    it('push does not ride the email flag', async () => {
      storedPrefs({ billing: { inApp: true, email: false, sms: true } });

      const result = await resolve(NotificationType.TENANT_APPROVED);

      expect(result.suppressed[EMAIL]).toBe('USER_OPT_OUT');
      expect(result.primary).toContain(PUSH);
      expect(result.primary).toContain(IN_APP);
    });

    it('a category missing from stored preferences takes the defaults', async () => {
      storedPrefs({ billing: { inApp: true, email: true, sms: false } });

      const result = await resolve(NotificationType.USER_INVITATION);

      expect(result.primary).toEqual([IN_APP, PUSH]);
    });
  });

  describe('WhatsApp consent', () => {
    it('no consent row → NO_CONSENT, whatever the preference says', async () => {
      storedPrefs({ team: { whatsapp: true } });

      const result = await resolve(NotificationType.USER_INVITATION);

      expect(result.suppressed[WHATSAPP]).toBe('NO_CONSENT');
      expect(consent.consentedUserIds).toHaveBeenCalledWith([1], 'utility');
    });

    it('consent with no stored preference turns the channel on', async () => {
      consent.consentedUserIds.mockResolvedValue(new Set([1]));

      const result = await resolve(NotificationType.USER_INVITATION);

      expect(result.primary).toContain(WHATSAPP);
    });

    it('consent plus a stored whatsapp:false for the category opts out', async () => {
      consent.consentedUserIds.mockResolvedValue(new Set([1]));
      storedPrefs({ team: { whatsapp: false } });

      const result = await resolve(NotificationType.USER_INVITATION);

      expect(result.suppressed[WHATSAPP]).toBe('USER_OPT_OUT');
    });

    it('a marketing template asks for the marketing yes', async () => {
      await resolve(NotificationType.TENANT_REJECTED);

      expect(consent.consentedUserIds).toHaveBeenCalledWith([1], 'marketing');
    });
  });

  describe('quiet hours', () => {
    const quietNow = (timezone: string | null = 'UTC') => {
      const nowInZone = new Intl.DateTimeFormat('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        timeZone: timezone ?? DEFAULT_PLATFORM_TIMEZONE,
      }).format(new Date());
      const hour = parseInt(nowInZone.split(':')[0], 10);
      prisma.userPreferences.findUnique.mockResolvedValue({
        quietHoursEnabled: true,
        quietHoursStart: `${String(hour).padStart(2, '0')}:00`,
        quietHoursEnd: `${String((hour + 2) % 24).padStart(2, '0')}:00`,
        timezone,
      });
    };

    it('holds back push, SMS and WhatsApp for a timely type; in-app and email still deliver', async () => {
      quietNow();
      consent.consentedUserIds.mockResolvedValue(new Set([1]));

      const result = await resolve(NotificationType.TENANT_APPROVED);

      expect(result.suppressedByQuietHours).toBe(true);
      expect(result.primary).toEqual([IN_APP, EMAIL]);
      expect(result.fallback).toEqual([]);
      expect(result.suppressed[PUSH]).toBe('QUIET_HOURS');
      expect(result.suppressed[SMS]).toBe('QUIET_HOURS');
    });

    it('a critical type pierces the window with nothing passed by the caller', async () => {
      quietNow();

      const result = await resolve(NotificationType.ROLE_CHANGED);

      expect(result.suppressedByQuietHours).toBe(true);
      expect(result.primary).toContain(PUSH);
      expect(result.fallback).toEqual([SMS]);
    });

    it('falls back to the platform zone when no timezone is stored', async () => {
      quietNow(null);

      expect((await resolve(NotificationType.TENANT_APPROVED)).suppressedByQuietHours).toBe(true);
    });

    it('does nothing when quiet hours are disabled', async () => {
      prisma.userPreferences.findUnique.mockResolvedValue({
        quietHoursEnabled: false,
        quietHoursStart: '22:00',
        quietHoursEnd: '06:00',
      });

      expect((await resolve(NotificationType.TENANT_APPROVED)).suppressedByQuietHours).toBe(false);
    });

    describe('the midnight hour', () => {
      // Intl with `hour12: false` renders 00:00–00:59 as "24:00"–"24:59"; compared as
      // STRINGS a 00:00–07:00 window never fired at 00:30. hourCycle h23 is the fix.
      afterEach(() => jest.useRealTimers());
      const atUtc = (iso: string) => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date(iso));
      };
      const window = (quietHoursStart: string, quietHoursEnd: string) =>
        prisma.userPreferences.findUnique.mockResolvedValue({
          quietHoursEnabled: true,
          quietHoursStart,
          quietHoursEnd,
          timezone: 'UTC',
        });

      it('suppresses at 00:30 inside a 00:00–07:00 window', async () => {
        atUtc('2026-03-04T00:30:00Z');
        window('00:00', '07:00');
        expect((await resolve(NotificationType.USER_JOINED)).suppressedByQuietHours).toBe(true);
      });

      it('suppresses at 00:30 inside an overnight 22:00–06:00 window', async () => {
        atUtc('2026-03-04T00:30:00Z');
        window('22:00', '06:00');
        expect((await resolve(NotificationType.USER_JOINED)).suppressedByQuietHours).toBe(true);
      });

      it('does NOT suppress at 08:00, outside a 00:00–07:00 window', async () => {
        atUtc('2026-03-04T08:00:00Z');
        window('00:00', '07:00');
        expect((await resolve(NotificationType.USER_JOINED)).suppressedByQuietHours).toBe(false);
      });
    });

    it('ignores malformed bounds instead of suppressing around the clock', async () => {
      // "9:00" > "22:00" lexicographically; acting on it would mute push 24/7, silently.
      prisma.userPreferences.findUnique.mockResolvedValue({
        quietHoursEnabled: true,
        quietHoursStart: '9:00',
        quietHoursEnd: '22:00',
        timezone: 'UTC',
      });

      expect((await resolve(NotificationType.USER_JOINED)).suppressedByQuietHours).toBe(false);
    });
  });

  // Players live in the mobile app and cannot reach the web settings page, so the
  // default is the only channel choice they will ever have. It sits UNDER the policy.
  describe('role-aware defaults', () => {
    it('a MEMBER gets in-app + push; email off and no SMS fallback', async () => {
      asPlayer();

      const result = await resolve(NotificationType.TENANT_APPROVED);

      expect(result.primary).toEqual([IN_APP, PUSH]);
      expect(result.fallback).toEqual([]);
      expect(result.suppressed[EMAIL]).toBe('USER_OPT_OUT');
      expect(result.suppressed[SMS]).toBe('USER_OPT_OUT');
    });

    it('staff keep email on and SMS as the fallback', async () => {
      asStaff();

      const result = await resolve(NotificationType.TENANT_APPROVED);

      expect(result.primary).toContain(EMAIL);
      expect(result.fallback).toEqual([SMS]);
    });

    it('honours a MEMBER opting INTO email over the lean default', async () => {
      asPlayer();
      storedPrefs({ billing: { email: true } });

      const result = await resolve(NotificationType.TENANT_APPROVED);

      expect(result.primary).toContain(EMAIL);
      expect(result.suppressed[SMS]).toBe('USER_OPT_OUT');
    });

    it('resolves the role per workspace, not per user', async () => {
      // Staff in their own club, a player in someone else's: no SMS for a tournament they entered elsewhere.
      prisma.workspaceMember.findUnique.mockImplementation(({ where }: any) =>
        Promise.resolve({ role: where.userId_tenantId.tenantId === 1 ? 'OWNER' : 'MEMBER' }),
      );

      expect((await resolve(NotificationType.TENANT_APPROVED, 1)).fallback).toEqual([SMS]);
      expect((await resolve(NotificationType.TENANT_APPROVED, 2)).fallback).toEqual([]);
    });

    it('falls open to staff defaults when the membership lookup fails', async () => {
      prisma.workspaceMember.findUnique.mockRejectedValue(new Error('db down'));

      const result = await resolve(NotificationType.TENANT_APPROVED);

      expect(result.primary).toContain(EMAIL);
      expect(result.fallback).toEqual([SMS]);
    });

    it('falls open to staff defaults when no membership row exists', async () => {
      prisma.workspaceMember.findUnique.mockResolvedValue(null);

      expect((await resolve(NotificationType.TENANT_APPROVED)).fallback).toEqual([SMS]);
    });
  });

  describe('resolveForAudience', () => {
    const audience = (userIds: number[], type: NotificationType = NotificationType.USER_INVITATION) =>
      service.resolveForAudience({ userIds, tenantId: 1, type });

    it('asks consent for the whole audience once, with the kind the type needs', async () => {
      consent.consentedUserIds.mockResolvedValue(new Set([2]));

      const resolved = await audience([1, 2, 3]);

      expect(consent.consentedUserIds).toHaveBeenCalledTimes(1);
      expect(consent.consentedUserIds).toHaveBeenCalledWith([1, 2, 3], 'utility');
      expect(resolved.get(1).suppressed[WHATSAPP]).toBe('NO_CONSENT');
      expect(resolved.get(2).primary).toContain(WHATSAPP);
    });

    it('asks the marketing kind for a marketing type', async () => {
      await audience([1], NotificationType.TENANT_REJECTED);
      expect(consent.consentedUserIds).toHaveBeenCalledWith([1], 'marketing');
    });

    it('reads the whole audience in two queries, however many recipients', async () => {
      await audience(Array.from({ length: 200 }, (_, i) => i + 1));

      expect(prisma.userPreferences.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.workspaceMember.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.userPreferences.findUnique).not.toHaveBeenCalled();
    });

    it('gives each recipient the defaults for their own role', async () => {
      prisma.workspaceMember.findMany.mockResolvedValue([
        { userId: 1, role: 'MEMBER' },
        { userId: 2, role: 'ADMIN' },
      ]);

      const resolved = await audience([1, 2]);

      expect(resolved.get(1).fallback).toEqual([]);
      expect(resolved.get(2).fallback).toEqual([SMS]);
    });

    it('falls open to staff defaults for a recipient with no membership row', async () => {
      const resolved = await audience([9], NotificationType.TENANT_APPROVED);
      expect(resolved.get(9).primary).toContain(EMAIL);
    });

    it('honours a stored per-channel preference over the role default', async () => {
      prisma.userPreferences.findMany.mockResolvedValue([
        { userId: 1, notificationPreferences: { team: { sms: true } } },
      ]);
      prisma.workspaceMember.findMany.mockResolvedValue([{ userId: 1, role: 'MEMBER' }]);

      const resolved = await audience([1]);

      expect(resolved.get(1).fallback).toEqual([SMS]);
    });

    it('falls open to staff defaults for everyone when the role lookup fails', async () => {
      prisma.workspaceMember.findMany.mockRejectedValue(new Error('db down'));

      const resolved = await audience([1, 2], NotificationType.TENANT_APPROVED);

      expect(resolved.get(1).fallback).toEqual([SMS]);
      expect(resolved.get(2).primary).toContain(EMAIL);
    });

    it('never beats a stored yes on the bulk path too', async () => {
      prisma.userPreferences.findMany.mockResolvedValue([
        { userId: 1, notificationPreferences: { billing: { whatsapp: true } } },
      ]);
      consent.consentedUserIds.mockResolvedValue(new Set([1]));

      const resolved = await audience([1], NotificationType.TENANT_APPROVED);

      expect(resolved.get(1).suppressed[WHATSAPP]).toBe('POLICY_NEVER');
    });

    it('yields the same shape as the single-user path', async () => {
      const single = await resolve(NotificationType.USER_INVITATION);
      const bulk = (await audience([1])).get(1);

      expect(bulk).toEqual(single);
    });

    it('queries nothing for an empty audience', async () => {
      const resolved = await audience([]);

      expect(resolved.size).toBe(0);
      expect(prisma.userPreferences.findMany).not.toHaveBeenCalled();
    });
  });
});
