import { z } from 'zod';

/** All platform-owned service names — single source of truth */
export const PLATFORM_SERVICE_NAMES = [
  // Mapping & Routing
  'weather',
  'fuelPrices',
  'routing',
  'geocoding',
  'mileage',
  'places',
  'traffic',
  'tolls',
  // AI & Intelligence
  'anthropic',
  'aiGateway',
  'openai',
  'langfuse',
  // Voice Agent
  'livekit',
  'deepgram',
  'cartesia',
  // Auth & Security
  'firebaseAuth',
  'turnstile',
  // Communication
  'twilio',
  'resend',
  // Storage
  's3',
] as const;

export type PlatformServiceName = (typeof PLATFORM_SERVICE_NAMES)[number];

export const platformServiceNameSchema = z.enum(PLATFORM_SERVICE_NAMES);

/** Balance/cost data for a single platform service */
export const serviceBalanceSchema = z.object({
  balanceUsd: z.number().nullable(),
  monthlySpendUsd: z.number().nullable(),
  dailyBurnRateUsd: z.number().nullable(),
  daysRemaining: z.number().nullable(),
  planTier: z.string().nullable(),
  monthlyUsage: z.string().nullable(),
  quotaLimit: z.string().nullable(),
  quotaUsedPercent: z.number().nullable(),
  lastProbed: z.string().nullable(),
  probeStatus: z.enum(['success', 'failed', 'unsupported', 'not_configured']),
  probeError: z.string().optional(),
});

export type ServiceBalance = z.infer<typeof serviceBalanceSchema>;

/** Health status for a single platform service */
export const serviceHealthSchema = z.object({
  provider: z.string(),
  configured: z.boolean(),
  status: z.enum(['healthy', 'degraded', 'down', 'not_configured']),
  lastSuccess: z.string().optional(),
  lastError: z.string().optional(),
  lastErrorMessage: z.string().optional(),
  avgResponseMs: z.number().optional(),
  errorCount24h: z.number().optional(),
});

export type ServiceHealth = z.infer<typeof serviceHealthSchema>;

/** Combined health + balance data returned per service from the API */
export const platformServiceStatusSchema = serviceHealthSchema.extend({
  balance: serviceBalanceSchema,
  dashboardUrl: z.string().optional(),
});

export type PlatformServiceStatus = z.infer<typeof platformServiceStatusSchema>;
