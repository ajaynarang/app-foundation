import { shutdownTelemetry } from './infrastructure/telemetry/telemetry';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { validationExceptionFactory } from './shared/utils/validation-exception-factory';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Configuration } from './config/configuration';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { initializeFirebase } from './config/firebase.config';
import { Logger } from 'nestjs-pino';
import { OAUTH_SCOPES } from '@app/shared-types';
import { setNestAppContext } from './domains/desk/core/inngest/nest-context';

async function bootstrap() {
  // Initialize Firebase Admin SDK
  initializeFirebase();

  // 10MB max upload + ~33% base64 inflation + JSON overhead = 15MB body limit
  const JSON_BODY_LIMIT = '15mb';

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    // Only show warn/error during bootstrap — suppresses 100+ "Mapped {...}" route logs
    logger: ['warn', 'error'],
  });

  // Increase body parser limit from default 100KB.
  // Email intake webhook receives base64-encoded PDFs (up to 10MB → ~13.3MB after encoding).
  // useBodyParser respects the rawBody option set above.
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.useBodyParser('urlencoded', { limit: JSON_BODY_LIMIT, extended: true });

  // Enable NestJS shutdown hooks so OnApplicationShutdown lifecycle hooks run.
  // This coordinates graceful drain of in-flight requests before we flush OTel spans.
  app.enableShutdownHooks();

  const configService = app.get(ConfigService<Configuration>);

  const corsOrigins = configService.get<string>('corsOrigins') || 'http://localhost:3000';

  // Cookie parser for refresh tokens
  app.use(cookieParser());

  // HTTP security headers (helmet)
  // Note: styleSrc includes 'unsafe-inline' to allow Swagger UI inline styles
  // useDefaults: false prevents helmet from merging its own frame-ancestors: 'self'
  // which would contradict xFrameOptions: deny (modern browsers honour CSP over XFO)
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", 'https://browser.sentry-cdn.com'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", 'https://*.ingest.sentry.io'],
          fontSrc: ["'self'", 'https:', 'data:'],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          scriptSrcAttr: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
      xFrameOptions: { action: 'deny' },
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  // Permissions-Policy header (not set by helmet automatically)
  app.use((_req: any, res: any, next: () => void) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    next();
  });

  // Global validation pipe - enables class-validator DTO validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );

  // Global API prefix
  // MCP root controller is excluded because Claude.ai sends POST/GET/DELETE
  // to the domain root `/` after OAuth (MCP spec strips path for auth base URL).
  // The McpRootController handles these at `/` without the api/v1 prefix.
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: '/', method: RequestMethod.POST },
      { path: '/', method: RequestMethod.GET },
      { path: '/', method: RequestMethod.DELETE },
    ],
  });

  // CORS configuration
  // Parse CORS origins: supports exact URLs and wildcard patterns like *.sally.appshore.in
  const parsedCorsOrigins: (string | RegExp)[] = corsOrigins
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
    .map((o) => {
      if (o.includes('*')) {
        // Convert wildcard pattern to regex: https://*.sally.appshore.in → /^https:\/\/[^/]+\.sally\.appshore\.in$/
        // Uses [^/]+ (not [^.]+) so wildcard matches multi-level subdomains like console.staging.sally.appshore.in
        const escaped = o.replace(/[.+?^${}()|\\[\]]/g, '\\$&').replace(/\*/g, '[^/]+');
        return new RegExp(`^${escaped}$`);
      }
      return o;
    });

  app.enableCors({
    origin: parsedCorsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Token', 'Mcp-Session-Id'],
    exposedHeaders: ['Mcp-Session-Id'],
    credentials: true, // Allow cookies
  });

  // Warn if localhost CORS origins are present in production
  if (process.env.NODE_ENV === 'production' && corsOrigins.split(',').some((o) => o.trim().includes('localhost'))) {
    console.warn('[Bootstrap] WARNING: CORS_ORIGINS includes localhost — this should not happen in production!');
  }

  // Swagger/OpenAPI documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('SALLY API')
    .setDescription('Fleet Operations Assistant API')
    .setVersion('1.0.0')
    .addBearerAuth()
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'API Key',
        description: 'Enter your API key (sk_staging_...)',
        name: 'Authorization',
        in: 'header',
      },
      'api-key',
    )
    .addServer('https://sally-api.apps.appshore.in/api/v1', 'Staging')
    .addServer('http://localhost:8000/api/v1', 'Local Development')
    .addTag('Authentication', 'JWT-based authentication with multi-tenancy')
    .addTag('API Keys', 'API key management for external developers')
    .addTag('Route Planning', 'Create and manage optimized routes')
    .addTag('Monitoring', 'Monitor active routes in real-time')
    .addTag('Alerts', 'Dispatcher alerts and notifications')
    .addTag('HOS Rules', 'Hours of Service compliance validation')
    .addTag('Optimization', 'REST optimization recommendations')
    .addTag('Prediction', 'Drive demand predictions')
    .addTag('Drivers', 'Driver management')
    .addTag('Vehicles', 'Vehicle management')
    .addTag('Loads', 'Load management')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  // OAuth 2.1 server metadata (RFC 8414) — must be at well-known root, not under /api/v1
  const oauthIssuer = process.env.OAUTH_ISSUER || 'https://api.trysally.com';
  app.use('/.well-known/oauth-authorization-server', (_req: any, res: any) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json({
      issuer: oauthIssuer,
      authorization_endpoint: `${oauthIssuer}/api/v1/oauth/authorize`,
      token_endpoint: `${oauthIssuer}/api/v1/oauth/token`,
      registration_endpoint: `${oauthIssuer}/api/v1/oauth/register`,
      revocation_endpoint: `${oauthIssuer}/api/v1/oauth/revoke`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: [...OAUTH_SCOPES],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
    });
  });

  // RFC 9728 — OAuth Protected Resource Metadata (Claude.ai requests this)
  app.use('/.well-known/oauth-protected-resource', (_req: any, res: any) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json({
      resource: oauthIssuer,
      authorization_servers: [oauthIssuer],
      scopes_supported: [...OAUTH_SCOPES],
    });
  });

  // Serve OpenAPI spec at /api/openapi.json for docs site
  app.use('/api/openapi.json', (req: any, res: any) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json(document);
  });

  SwaggerModule.setup('api', app, document);

  const port = parseInt(process.env.PORT || '8000', 10);

  const logger = app.get(Logger);

  // Expose the DI container to Inngest step handlers (plain async functions,
  // not NestJS classes). See domains/desk/core/inngest/nest-context.ts.
  setNestAppContext(app);

  try {
    await app.listen(port);
  } catch (err: any) {
    if (err.code === 'EADDRINUSE') {
      logger.error(`Port ${port} is already in use. Stop the other process or set PORT to a free port.`, 'Bootstrap');
    }
    throw err;
  }

  // Switch to pino now that bootstrap is done (suppresses route mapping spam)
  app.useLogger(app.get(Logger));

  console.log('');
  console.log(`  ✅ SALLY Backend ready on http://localhost:${port}`);
  console.log(`     API:     http://localhost:${port}/api/v1/`);
  console.log(`     Swagger: http://localhost:${port}/api`);
  console.log('');

  // Coordinate graceful shutdown: NestJS drains requests first, then we flush OTel spans.
  // NestJS emits 'beforeExit' after all shutdown hooks complete.
  process.on('SIGTERM', () => {
    void (async () => {
      logger.log('SIGTERM received — shutting down gracefully', 'Bootstrap');
      await app.close(); // Drains in-flight NestJS requests + runs OnApplicationShutdown hooks
      await shutdownTelemetry(); // Flush any remaining OTel spans
      process.exit(0);
    })();
  });
}

void bootstrap();
