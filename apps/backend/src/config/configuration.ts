import { z } from 'zod';

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

  // OAuth Provider
  oauthJwtSecret: z.string().optional(),
  oauthIssuer: z.string().default('http://localhost:8000'),

  // S3 Storage Configuration
  s3: z.object({
    bucket: z.string().default('app-files'),
    region: z.string().default('us-east-1'),
  }),
});

// Production fail-fast: refuse to boot with the published development
// secrets (unset env vars fall back to the zod defaults above, so an
// equality check catches both "unset" and "set to the template default").
// Without this, anyone could mint valid access/refresh JWTs for any
// user/tenant of a production deploy that forgot to set the secrets.
const guardedConfigSchema = configSchema.superRefine((config, ctx) => {
  if (config.environment !== 'production') return;

  const checks: Array<{ envVar: string; isDefault: boolean }> = [
    { envVar: 'SECRET_KEY', isDefault: config.secretKey === DEV_SECRET_KEY_DEFAULT },
    { envVar: 'JWT_ACCESS_SECRET', isDefault: config.jwt.accessSecret === DEV_JWT_ACCESS_SECRET_DEFAULT },
    { envVar: 'JWT_REFRESH_SECRET', isDefault: config.jwt.refreshSecret === DEV_JWT_REFRESH_SECRET_DEFAULT },
  ];
  for (const { envVar, isDefault } of checks) {
    if (isDefault) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${envVar} must be set explicitly in production — the built-in development default is public in this template. Generate one: openssl rand -hex 32`,
      });
    }
  }
});

export type Configuration = z.infer<typeof configSchema>;

export default (): Configuration => {
  const raw = {
    environment: process.env.NODE_ENV,
    databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/app',
    redisUrl: process.env.REDIS_URL,
    corsOrigins: process.env.CORS_ORIGINS,
    apiV1Prefix: process.env.API_V1_PREFIX,
    projectName: process.env.PROJECT_NAME,
    secretKey: process.env.SECRET_KEY,
    jwt: {
      accessSecret: process.env.JWT_ACCESS_SECRET,
      refreshSecret: process.env.JWT_REFRESH_SECRET,
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
    oauthJwtSecret: process.env.OAUTH_JWT_SECRET,
    oauthIssuer: process.env.OAUTH_ISSUER,
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
