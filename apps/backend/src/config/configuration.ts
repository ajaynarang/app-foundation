import { z } from 'zod';
import { findLocalCorsOrigins, isInngestDevMode, isLocalOrigin, isPlaceholderSecret } from './production-guard';

// Config ownership rule:
// - App-owned config lives HERE, in the typed zod schema below — validated at
//   boot, accessed as `configService.get('jwt.accessExpiry')` etc.
// - Foundation/vendor-owned settings (Twilio, SMTP, Deepgram, DB pool tuning,
//   OAuth TTLs, ...) are read raw via ConfigService/process.env at their point
//   of use and are documented in .env.example instead.

// Development-only fallback secrets. These strings are public (this is a
// template repo), so production boot MUST fail if any of them is still in
// use — see the superRefine below.
const DEV_SECRET_KEY_DEFAULT = 'app-development-secret-key-minimum-32-chars';
const DEV_JWT_ACCESS_SECRET_DEFAULT = 'app-jwt-access-secret-change-in-production-min-32-chars';
const DEV_JWT_REFRESH_SECRET_DEFAULT = 'app-jwt-refresh-secret-change-in-production-min-32-chars';
// 32 bytes as 64 hex characters, the same form a real key takes. These are the
// bytes earlier versions of the credentials cipher used when the key was
// unset, so credentials stored by an existing local database stay readable.
export const DEV_CREDENTIALS_ENCRYPTION_KEY_DEFAULT = Buffer.from('dev-key-only-do-not-use-in-produ', 'utf8').toString(
  'hex',
);
// Shared with the forked voice agent, which authenticates to a public endpoint with it.
export const DEV_VOICE_AGENT_SECRET_DEFAULT = 'app-voice-dev-secret-do-not-use-in-production';

// The OAuth issuer a developer machine serves. Production must name its own public URL instead.
export const DEV_OAUTH_ISSUER_DEFAULT = 'http://localhost:8000';

const MIN_SECRET_LENGTH = 32;

const configSchema = z.object({
  environment: z.enum(['development', 'production', 'test']).default('development'),
  databaseUrl: z.string(),
  redisUrl: z.string().url('REDIS_URL must be a valid redis:// or rediss:// URL').min(1, 'REDIS_URL is required'),
  corsOrigins: z.string().default('http://localhost:3000'),
  apiV1Prefix: z.string().default('/api/v1'),
  projectName: z.string().default('App Backend'),
  secretKey: z.string().default(DEV_SECRET_KEY_DEFAULT),

  // Multi-tenancy toggle. When disabled, all requests resolve to a single
  // implicit tenant (see TenantGuard) so manual `where: { tenantId }` scoping
  // continues to work unchanged in single-tenant deployments.
  multiTenancy: z.object({
    enabled: z.boolean().default(true),
    implicitTenantId: z.number().default(1),
    /** 'multi' (orgs, self-registration) | 'single' (one implicit workspace) | 'personal' (a workspace per user, no org UI) */
    mode: z.enum(['multi', 'single', 'personal']).default('multi'),
  }),

  // JWT Configuration
  jwt: z.object({
    accessSecret: z.string().default(DEV_JWT_ACCESS_SECRET_DEFAULT),
    refreshSecret: z.string().default(DEV_JWT_REFRESH_SECRET_DEFAULT),
    accessExpiry: z.string().default('15m'),
    refreshExpiry: z.string().default('7d'),
  }),

  // Auth Configuration
  auth: z.object({
    bcryptRounds: z.number().default(10),
  }),

  anthropicApiKey: z.string().optional(),

  // Encrypts third-party integration credentials at rest (AES-256).
  credentialsEncryptionKey: z
    .string()
    .trim()
    .regex(
      /^[0-9a-fA-F]{64}$/,
      'CREDENTIALS_ENCRYPTION_KEY must be 64 hex characters (32 bytes). Generate one: openssl rand -hex 32',
    )
    .default(DEV_CREDENTIALS_ENCRYPTION_KEY_DEFAULT),

  // Vendor-owned settings that the features read raw at their point of use.
  // They are mirrored here only so the production guard below can see them.
  voice: z
    .object({
      livekitUrl: z.string().optional(),
      agentSecret: z.string().optional(),
    })
    .default({}),
  inngest: z
    .object({
      dev: z.string().optional(),
      signingKey: z.string().optional(),
    })
    .default({}),

  // Outbound webhooks. Development escape hatch: with this on, a subscription may use http and point at
  // localhost or a private address, so a receiver on a laptop works. Production refuses to boot with it.
  webhooks: z
    .object({
      allowPrivateTargets: z.boolean().default(false),
    })
    .default({}),

  // OAuth Provider. The two secrets sign different things (access tokens, consent challenges) and are never
  // the same value; outside production each is derived from SECRET_KEY when unset.
  oauthJwtSecret: z.string().optional(),
  oauthConsentSecret: z.string().optional(),
  // `iss` of every OAuth access token and the issuer in the RFC 8414 metadata: the public URL of this API.
  oauthIssuer: z.string().url('OAUTH_ISSUER must be a URL, e.g. https://api.acme.io').default(DEV_OAUTH_ISSUER_DEFAULT),

  // S3 Storage Configuration
  s3: z.object({
    bucket: z.string().default('app-files'),
    region: z.string().default('us-east-1'),
  }),
});

// Production fail-fast. Every secret the backend signs or encrypts with must
// be set explicitly: unset env vars fall back to the zod defaults above, which
// are public (this is a template repo), so anyone could mint valid JWTs or
// decrypt stored credentials of a production deploy that forgot one. The same
// goes for values copied from .env.example, and for a CORS origin or a
// dev-mode switch that only makes sense on a developer machine.
//
// "Production" here is `environment === 'production'` (NODE_ENV). Nothing
// below runs in development or test.
const guardedConfigSchema = configSchema.superRefine((config, ctx) => {
  if (config.environment !== 'production') return;

  const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });

  const voiceEnabled = !!config.voice.livekitUrl;

  const secrets: Array<{
    envVar: string;
    value: string | undefined;
    devDefault?: string;
    required: boolean;
    minLength: number;
    hint: string;
  }> = [
    {
      envVar: 'SECRET_KEY',
      value: config.secretKey,
      devDefault: DEV_SECRET_KEY_DEFAULT,
      required: true,
      minLength: MIN_SECRET_LENGTH,
      hint: 'Generate one: openssl rand -hex 32',
    },
    {
      envVar: 'JWT_ACCESS_SECRET',
      value: config.jwt.accessSecret,
      devDefault: DEV_JWT_ACCESS_SECRET_DEFAULT,
      required: true,
      minLength: MIN_SECRET_LENGTH,
      hint: 'Generate one: openssl rand -hex 32',
    },
    {
      envVar: 'JWT_REFRESH_SECRET',
      value: config.jwt.refreshSecret,
      devDefault: DEV_JWT_REFRESH_SECRET_DEFAULT,
      required: true,
      minLength: MIN_SECRET_LENGTH,
      hint: 'Generate one: openssl rand -hex 32',
    },
    {
      // Signs OAuth access tokens. Unset, it is derived from SECRET_KEY, which
      // ties two unrelated secrets together.
      envVar: 'OAUTH_JWT_SECRET',
      value: config.oauthJwtSecret,
      required: true,
      minLength: MIN_SECRET_LENGTH,
      hint: 'Generate one: openssl rand -hex 32. To keep OAuth tokens issued before this check valid, set it to the value used so far: SECRET_KEY followed by "-oauth".',
    },
    {
      // Signs OAuth consent challenges, which live ten minutes: a new value
      // only makes a consent screen that is open right now ask again.
      envVar: 'OAUTH_CONSENT_SECRET',
      value: config.oauthConsentSecret,
      required: true,
      minLength: MIN_SECRET_LENGTH,
      hint: 'Generate one: openssl rand -hex 32',
    },
    {
      envVar: 'CREDENTIALS_ENCRYPTION_KEY',
      value: config.credentialsEncryptionKey,
      devDefault: DEV_CREDENTIALS_ENCRYPTION_KEY_DEFAULT,
      required: true,
      minLength: 64,
      hint: 'Generate one: openssl rand -hex 32',
    },
    {
      // Authenticates the forked voice agent to a public endpoint. Only needed
      // when voice is on (LIVEKIT_URL set); unset, that endpoint rejects every call.
      envVar: 'VOICE_AGENT_SECRET',
      value: config.voice.agentSecret,
      devDefault: DEV_VOICE_AGENT_SECRET_DEFAULT,
      required: voiceEnabled,
      minLength: MIN_SECRET_LENGTH,
      hint: 'Generate one: openssl rand -hex 32',
    },
    {
      // Verifies that calls to the public Inngest endpoint come from Inngest.
      // Optional: without it the endpoint rejects every call (see INNGEST_DEV below).
      envVar: 'INNGEST_SIGNING_KEY',
      value: config.inngest.signingKey,
      required: false,
      minLength: 8,
      hint: 'Copy it from the Inngest dashboard.',
    },
  ];

  for (const { envVar, value, devDefault, required, minLength, hint } of secrets) {
    if (value === undefined) {
      if (required) fail(`${envVar} must be set in production. ${hint}`);
      continue;
    }
    if (devDefault !== undefined && value === devDefault) {
      fail(
        `${envVar} must be set explicitly in production: the built-in development default is public in this template. ${hint}`,
      );
    } else if (isPlaceholderSecret(value)) {
      fail(`${envVar} is still a placeholder value in production. ${hint}`);
    } else if (value.length < minLength) {
      fail(`${envVar} must be at least ${minLength} characters in production. ${hint}`);
    }
  }

  // One secret for both would let a consent challenge verify as an access token's signature.
  if (config.oauthConsentSecret !== undefined && config.oauthConsentSecret === config.oauthJwtSecret) {
    fail('OAUTH_CONSENT_SECRET must differ from OAUTH_JWT_SECRET in production. Generate one: openssl rand -hex 32');
  }

  // OAuth clients verify tokens and discover endpoints against the issuer, so it must be this deployment's
  // public URL. Unset, it defaults to the development URL.
  if (config.oauthIssuer === DEV_OAUTH_ISSUER_DEFAULT || isLocalOrigin(config.oauthIssuer)) {
    fail(
      `OAUTH_ISSUER must be set to the public URL of this API in production (got ${config.oauthIssuer}), e.g. https://api.acme.io`,
    );
  } else if (!config.oauthIssuer.startsWith('https://')) {
    fail(`OAUTH_ISSUER must be an https URL in production (got ${config.oauthIssuer}).`);
  }

  // The Inngest endpoint is public. In dev mode the SDK skips signature
  // verification, so anyone could trigger workflow runs.
  if (isInngestDevMode(config.inngest.dev)) {
    fail(
      'INNGEST_DEV must not be set in production: it turns off signature verification on the public Inngest endpoint.',
    );
  }

  // The webhook worker would then deliver to addresses inside the deployment's own network (SSRF).
  if (config.webhooks.allowPrivateTargets) {
    fail(
      'WEBHOOK_ALLOW_PRIVATE_TARGETS must not be true in production: it lets a tenant point outbound webhooks at private and loopback addresses.',
    );
  }

  const localOrigins = findLocalCorsOrigins(config.corsOrigins);
  if (localOrigins.length > 0) {
    fail(
      `CORS_ORIGINS must not include a local origin in production (${localOrigins.join(', ')}): any page served from a developer machine could call this API with a signed-in user's cookies. Unset, CORS_ORIGINS defaults to http://localhost:3000, so set it to the deployed web origin.`,
    );
  }
});

export type Configuration = z.infer<typeof configSchema>;

/**
 * An env var that is unset, empty or only whitespace counts as unset, so the
 * schema default applies (and production refuses it). A set value is passed
 * through unchanged.
 */
function env(name: string): string | undefined {
  const value = process.env[name];
  return value !== undefined && value.trim() !== '' ? value : undefined;
}

export default (): Configuration => {
  const raw = {
    environment: process.env.NODE_ENV,
    databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5499/app?schema=public',
    redisUrl: process.env.REDIS_URL,
    corsOrigins: process.env.CORS_ORIGINS,
    apiV1Prefix: process.env.API_V1_PREFIX,
    projectName: process.env.PROJECT_NAME,
    secretKey: env('SECRET_KEY'),
    jwt: {
      accessSecret: env('JWT_ACCESS_SECRET'),
      refreshSecret: env('JWT_REFRESH_SECRET'),
      accessExpiry: process.env.JWT_ACCESS_EXPIRY,
      refreshExpiry: process.env.JWT_REFRESH_EXPIRY,
    },
    auth: {
      bcryptRounds: process.env.BCRYPT_ROUNDS ? Number(process.env.BCRYPT_ROUNDS) : undefined,
    },
    multiTenancy: {
      enabled: process.env.MULTI_TENANT !== 'false',
      implicitTenantId: parseInt(process.env.IMPLICIT_TENANT_ID || '1', 10),
      // TENANCY_MODE wins; MULTI_TENANT=false maps to 'single' for compat.
      mode:
        (process.env.TENANCY_MODE as 'multi' | 'single' | 'personal') ||
        (process.env.MULTI_TENANT === 'false' ? 'single' : 'multi'),
    },
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    oauthJwtSecret: env('OAUTH_JWT_SECRET'),
    oauthConsentSecret: env('OAUTH_CONSENT_SECRET'),
    credentialsEncryptionKey: env('CREDENTIALS_ENCRYPTION_KEY'),
    voice: {
      livekitUrl: env('LIVEKIT_URL'),
      agentSecret: env('VOICE_AGENT_SECRET'),
    },
    inngest: {
      dev: env('INNGEST_DEV'),
      signingKey: env('INNGEST_SIGNING_KEY'),
    },
    webhooks: {
      allowPrivateTargets: env('WEBHOOK_ALLOW_PRIVATE_TARGETS') === 'true',
    },
    // Unset on a developer machine, the issuer follows the port the API listens on.
    oauthIssuer: env('OAUTH_ISSUER') ?? (env('PORT') ? `http://localhost:${env('PORT')}` : undefined),
    s3: {
      bucket: process.env.S3_BUCKET,
      region: process.env.S3_REGION,
    },
  };

  // Remove undefined values so zod defaults kick in
  const cleaned = Object.fromEntries(Object.entries(raw).filter(([_, v]) => v !== undefined));

  const config = guardedConfigSchema.parse(cleaned);

  // Log config source at startup
  const isDoppler = !!process.env.DOPPLER_PROJECT;
  const envCount = Object.keys(raw).filter((k) => raw[k as keyof typeof raw] !== undefined).length;
  const source = isDoppler ? `Doppler (${process.env.DOPPLER_PROJECT}/${process.env.DOPPLER_CONFIG})` : '.env files';
  console.log(`[Config] Source: ${source} | ${config.environment} | ${envCount} vars loaded`);

  return config;
};
