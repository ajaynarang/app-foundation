import { z } from 'zod';

const configSchema = z.object({
  environment: z.enum(['development', 'production', 'test']).default('development'),
  databaseUrl: z.string(),
  redisUrl: z.string().url('REDIS_URL must be a valid redis:// or rediss:// URL').min(1, 'REDIS_URL is required'),
  corsOrigins: z.string().default('http://localhost:3000'),
  apiV1Prefix: z.string().default('/api/v1'),
  projectName: z.string().default('SALLY Backend'),
  secretKey: z.string().default('sally-development-secret-key-minimum-32-chars'),

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

  osrmUrl: z.string().default('http://localhost:5000'),
  hereApiKey: z.string().optional(),
  hereTollsApiKey: z.string().optional(),
  routingProvider: z.enum(['osrm', 'here']).default('osrm'),
  openWeatherApiKey: z.string().optional(),
  anthropicApiKey: z.string().optional(),
  gasbuddyApiKey: z.string().optional(),
  pcmilerApiKey: z.string().optional(),

  // Platform Service Providers
  platformWeatherProvider: z.string().default('openweather'),
  platformFuelProvider: z.string().default('gasbuddy'),
  platformRoutingProvider: z.string().default('here'),
  platformGeocodingProvider: z.string().default('here'),
  platformPlacesProvider: z.string().default('here'),
  platformMileageProvider: z.string().default('here'),
  platformTrafficProvider: z.string().default('here'),
  platformTollProvider: z.string().default('here'),

  // OAuth Provider
  oauthJwtSecret: z.string().optional(),
  oauthIssuer: z.string().default('https://api.trysally.com'),

  // S3 Storage Configuration
  s3: z.object({
    bucket: z.string().default('sally-documents'),
    region: z.string().default('us-east-1'),
  }),

  // Ratecon Parser Configuration
  ratecon: z.object({
    parserStrategy: z.enum(['text-first', 'vision']).default('text-first'),
    allowUserOverride: z.boolean().default(false),
  }),
});

export type Configuration = z.infer<typeof configSchema>;

export default (): Configuration => {
  const raw = {
    environment: process.env.NODE_ENV,
    databaseUrl: process.env.DATABASE_URL || 'postgresql://sally_user:sally_password@localhost:5432/sally',
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
    osrmUrl: process.env.OSRM_URL,
    hereApiKey: process.env.HERE_API_KEY,
    hereTollsApiKey: process.env.HERE_TOLLS_API_KEY,
    routingProvider: process.env.ROUTING_PROVIDER,
    openWeatherApiKey: process.env.OPENWEATHER_API_KEY,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    gasbuddyApiKey: process.env.GASBUDDY_API_KEY,
    pcmilerApiKey: process.env.PCMILER_API_KEY,
    platformWeatherProvider: process.env.PLATFORM_WEATHER_PROVIDER,
    platformFuelProvider: process.env.PLATFORM_FUEL_PROVIDER,
    platformRoutingProvider: process.env.PLATFORM_ROUTING_PROVIDER,
    platformGeocodingProvider: process.env.PLATFORM_GEOCODING_PROVIDER,
    platformPlacesProvider: process.env.PLATFORM_PLACES_PROVIDER,
    platformMileageProvider: process.env.PLATFORM_MILEAGE_PROVIDER,
    platformTrafficProvider: process.env.PLATFORM_TRAFFIC_PROVIDER,
    platformTollProvider: process.env.PLATFORM_TOLL_PROVIDER,
    oauthJwtSecret: process.env.OAUTH_JWT_SECRET,
    oauthIssuer: process.env.OAUTH_ISSUER,
    s3: {
      bucket: process.env.S3_BUCKET,
      region: process.env.S3_REGION,
    },
    ratecon: {
      parserStrategy: process.env.RATECON_PARSER_STRATEGY,
      allowUserOverride: process.env.RATECON_ALLOW_USER_OVERRIDE === 'true',
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
