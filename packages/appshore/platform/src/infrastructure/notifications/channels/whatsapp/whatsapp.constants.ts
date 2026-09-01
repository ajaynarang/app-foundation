import { QUEUE_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';

/** Platform kill switch. Seeded off; the sell-switch is the E95-3 entitlement. */
export const WHATSAPP_FEATURE_FLAG = 'whatsapp_channel';

/**
 * Its own queue, apart from `notifications` (precedent: VIDEO_LIVE_QUEUE_NAME).
 * Every job here is one vendor HTTP round trip; 200 of them behind reminders
 * and chat fan-out on a concurrency-1 queue would hold the rest up for a minute.
 */
export const WHATSAPP_QUEUE_NAME = QUEUE_NAMES.WHATSAPP;
export const WHATSAPP_QUEUE_CONCURRENCY = 3;
/** Interakt documents 300 req/min; stay under it rather than learn about 429s in a burst. */
export const WHATSAPP_QUEUE_LIMITER = { max: 240, duration: 60_000 } as const;

/** Env WHATSAPP_DAILY_SEND_CEILING overrides. Cheap insurance against a runaway loop billing the platform overnight. */
export const WHATSAPP_DAILY_SEND_CEILING_DEFAULT = 5000;
export const WHATSAPP_DAILY_COUNTER_TTL_SECONDS = 2 * 86_400;

/** Rows the deploy window strands (see WhatsAppStaleSweepHandler). Every 15 min. */
export const WHATSAPP_STALE_SWEEP_JOB_NAME = 'whatsapp-stale-sweep';
export const WHATSAPP_STALE_SWEEP_INTERVAL_MS = 15 * 60_000;
/** Never claimed: the job never ran. Five attempts of exponential backoff end well inside this. */
export const WHATSAPP_STALE_UNCLAIMED_AFTER_MS = 15 * 60_000;
/** Claimed but never acknowledged: the provider's webhook is not coming. */
export const WHATSAPP_STALE_CLAIMED_AFTER_MS = 24 * 60 * 60_000;

export const WHATSAPP_SEND_JOB_NAME = 'whatsapp-send';
export const WHATSAPP_JOB_CATEGORY = 'whatsapp';
export const WHATSAPP_SEND_ATTEMPTS = 5;
export const WHATSAPP_SEND_BACKOFF_MS = 30_000;

/** Env WHATSAPP_PROVIDER picks the adapter; the keys are the same two names either way. */
export const WHATSAPP_PROVIDERS = { META: 'meta', INTERAKT: 'interakt' } as const;
export const WHATSAPP_PROVIDER_DEFAULT = WHATSAPP_PROVIDERS.META;

export const INTERAKT_API_BASE_URL = 'https://api.interakt.ai/v1/public';
export const INTERAKT_SIGNATURE_HEADER = 'interakt-signature';

/** Graph API versions live ~2 years; bump here, nowhere else. */
export const META_GRAPH_API_BASE_URL = 'https://graph.facebook.com/v25.0';
export const META_SIGNATURE_HEADER = 'x-hub-signature-256';
/** Meta: this user has had all the marketing they will get today. Never retried. */
export const META_MARKETING_CAP_ERROR_CODE = 131049;
/** Meta's own "try again later" codes: account/throughput/pair rate limits, transient platform errors. */
export const META_RETRYABLE_ERROR_CODES: ReadonlySet<number> = new Set([80007, 130429, 131056, 131016, 131000]);
