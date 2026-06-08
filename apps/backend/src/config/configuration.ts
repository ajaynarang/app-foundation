import { z } from 'zod';

const configSchema = z.object({
  environment: z.enum(['development', 'production', 'test']).default('development'),
  databaseUrl: z.string(),
  redisUrl: z.string().url('REDIS_URL must be a valid redis:// or rediss:// URL').min(1, 'REDIS_URL is required'),
  corsOrigins: z.string().default('http://localhost:3000'),
  apiV1Prefix: z.string().default('/api/v1'),
  projectName: z.string().default('App Backend'),
  secretKey: z.string().default('app-development-secret-key-minimum-32-chars'),

  // Multi-tenancy toggle. When disabled, all requests resolve to a single
  // implicit tenant (see TenantGuard) so manual `where: { tenantId }` scoping
  // continues to work unchanged in single-tenant deployments.
  multiTenancy: z.object({
    enabled: z.boolean().default(true),
    implicitTenantId: z.number().default(1),
  }),

  // JWT Configuration
  jwt: z.object({
    accessSecret: z.string().default('sally-jwt-access-secret-change-in-production-min-32-chars'),
    refreshSecret: z.string().default('sally-jwt-refresh-secret-change-in-production-min-32-chars'),
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
    bucket: z.string().default('app-documents'),
    region: z.string().default('us-east-1'),
  }),
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

  const config = configSchema.parse(cleaned);

  // Log config source at startup
  const isDoppler = !!process.env.DOPPLER_PROJECT;
  const envCount = Object.keys(raw).filter((k) => raw[k as keyof typeof raw] !== undefined).length;
  const source = isDoppler ? `Doppler (${process.env.DOPPLER_PROJECT}/${process.env.DOPPLER_CONFIG})` : '.env files';
  console.log(`[Config] Source: ${source} | ${config.environment} | ${envCount} vars loaded`);

  return config;
};
