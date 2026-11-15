import { z } from 'zod';
import { defineResponseSchema } from '@appshore/platform/shared/openapi/api-result';
import { defineCursorListSchema } from '@appshore/platform/shared/openapi/common-responses';

/** Outbound webhook subscriptions' response bodies, named once. A read never carries a secret. */

const WebhookSubscriptionBaseSchema = z.object({
  id: z.string(),
  tenantId: z.number().int().describe('Tenant numeric id (listed in id-boundary.allowlist.json)'),
  url: z.string(),
  events: z.array(z.string()).describe('Event names or patterns the subscription selects'),
  active: z.boolean(),
  description: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** A subscription read: with the rotation overlap and how many delivery attempts it has logged. */
const WebhookSubscriptionReadSchema = WebhookSubscriptionBaseSchema.extend({
  previousSecretExpiresAt: z
    .string()
    .nullable()
    .describe('Until when the secret a rotation replaced keeps signing; null outside an overlap'),
  _count: z.object({ deliveryLogs: z.number().int() }),
});

export const WebhookSubscriptionResponse = defineResponseSchema('WebhookSubscription', WebhookSubscriptionBaseSchema);
export const WebhookSubscriptionDetailResponse = defineResponseSchema(
  'WebhookSubscriptionDetail',
  WebhookSubscriptionReadSchema,
);
export const WebhookSubscriptionListResponse = defineCursorListSchema(
  'WebhookSubscriptionList',
  WebhookSubscriptionReadSchema,
);

const signingSecret = z.string().describe('whsec_…: shown once; store it securely');

/** `POST /webhooks`: the new subscription plus its signing secret, shown this once. */
export const WebhookSubscriptionCreatedResponse = defineResponseSchema(
  'WebhookSubscriptionCreated',
  WebhookSubscriptionBaseSchema.extend({ signingSecret }),
);

/** `POST /webhooks/:id/rotate-secret`: the subscription plus its new signing secret, shown this once. */
export const WebhookSubscriptionWithSecretResponse = defineResponseSchema(
  'WebhookSubscriptionWithSecret',
  WebhookSubscriptionReadSchema.omit({ _count: true }).extend({ signingSecret }),
);

/** A `WebhookDeliveryLog` row: one delivery attempt record. */
const WebhookDeliveryLogSchema = z.object({
  id: z.string().uuid(),
  subscriptionId: z.string(),
  event: z.string(),
  payload: z.unknown().describe('The signed body sent to the receiver'),
  responseStatus: z.number().int().nullable(),
  responseBody: z.string().nullable(),
  attempts: z.number().int(),
  deliveredAt: z.string().nullable(),
  failedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const WebhookDeliveryLogResponse = defineResponseSchema('WebhookDeliveryLog', WebhookDeliveryLogSchema);
export const WebhookDeliveryLogListResponse = defineCursorListSchema(
  'WebhookDeliveryLogList',
  WebhookDeliveryLogSchema,
);

/** `GET /webhooks/events`: the external events a subscription may select, grouped by category. */
export const WebhookEventCatalogResponse = defineResponseSchema(
  'WebhookEventCatalog',
  z.object({
    categories: z.array(
      z.object({
        label: z.string(),
        events: z.array(z.object({ name: z.string(), label: z.string(), description: z.string() })),
      }),
    ),
  }),
);

/** `POST /webhooks/:id/replay` (202): how many deliveries were queued, from when. */
export const WebhookReplayResponse = defineResponseSchema(
  'WebhookReplay',
  z.object({ queued: z.number().int(), since: z.string() }),
);
