import { z } from 'zod';
import { NotificationCategorySchema } from '../generated/prisma-enums';

/** How a channel behaves for a category when the user has not chosen; `always` cannot be switched off. */
export const NotificationChannelRuleSchema = z.enum(['always', 'default', 'optIn', 'fallback']);
export type NotificationChannelRule = z.infer<typeof NotificationChannelRuleSchema>;

export const NotificationPreferenceChannelSchema = z.enum(['inApp', 'push', 'email', 'sms', 'whatsapp']);
export type NotificationPreferenceChannel = z.infer<typeof NotificationPreferenceChannelSchema>;

export const NotificationPreferenceCategoryOptionsSchema = z.object({
  /** Lowercase category — the key under UserPreferences.notificationPreferences. */
  key: z.string(),
  category: NotificationCategorySchema,
  channels: z.record(NotificationPreferenceChannelSchema, NotificationChannelRuleSchema),
  /** What each offered channel does for THIS caller with no stored preference — their role default under the rule. */
  defaults: z.record(NotificationPreferenceChannelSchema, z.boolean()),
});
export type NotificationPreferenceCategoryOptions = z.infer<typeof NotificationPreferenceCategoryOptionsSchema>;

/** What the settings page may offer: only categories a policy uses, only channels a policy allows. */
export const NotificationPreferenceOptionsSchema = z.object({
  categories: z.array(NotificationPreferenceCategoryOptionsSchema),
});
export type NotificationPreferenceOptions = z.infer<typeof NotificationPreferenceOptionsSchema>;
