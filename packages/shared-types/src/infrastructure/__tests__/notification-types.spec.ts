import { NotificationTypeSchema, PLATFORM_NOTIFICATION_TYPES, PlatformNotificationType } from '../notification-types';

describe('notification types: strings with an app registry, not a Prisma enum', () => {
  it('lists the platform types once each, and the value bag mirrors the list', () => {
    expect(new Set(PLATFORM_NOTIFICATION_TYPES).size).toBe(PLATFORM_NOTIFICATION_TYPES.length);
    expect(Object.values(PlatformNotificationType)).toEqual([...PLATFORM_NOTIFICATION_TYPES]);
    expect(PlatformNotificationType.USER_INVITATION).toBe('USER_INVITATION');
  });

  it('accepts any app type that fits the column, platform or not', () => {
    expect(NotificationTypeSchema.parse('USER_INVITATION')).toBe('USER_INVITATION');
    expect(NotificationTypeSchema.parse('INVOICE_OVERDUE')).toBe('INVOICE_OVERDUE');
  });

  it('refuses what the VarChar(60) column or the SCREAMING_SNAKE form would not hold', () => {
    expect(NotificationTypeSchema.safeParse('').success).toBe(false);
    expect(NotificationTypeSchema.safeParse('A'.repeat(61)).success).toBe(false);
    expect(NotificationTypeSchema.safeParse('invoice overdue').success).toBe(false);
  });
});
