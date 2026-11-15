import { shutdownTelemetry } from '@appshore/kernel/infrastructure/telemetry/telemetry';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { AppValidationPipe } from '@appshore/kernel/shared/utils/app-validation-pipe';
import { applyQueueProcessingMode } from '@appshore/kernel/infrastructure/queue/queue-processing-mode';
import { ConfigService } from '@nestjs/config';
import { Configuration } from './config/configuration';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { initializeFirebase } from '@appshore/platform/config/firebase.config';
import { Logger } from 'nestjs-pino';
import { resolveOAuthIssuer } from '@appshore/platform/domains/oauth-provider/oauth-settings';
import { OPTIONAL_FEATURES } from './platform-glue/features';
import { mountSwaggerUi, SWAGGER_UI_PATH } from './bootstrap/swagger-ui';
import { applyTrustProxy } from './bootstrap/trust-proxy';
import { applyGlobalPrefix, buildServedOpenApiDocument, OPENAPI_DOCUMENT_PATH } from './bootstrap/openapi';
import { mountOAuthMetadata } from './bootstrap/oauth-metadata';
import { DEPRECATION_HEADERS } from '@appshore/platform/shared/http/deprecation';
import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENT_REPLAYED_HEADER,
} from '@appshore/platform/infrastructure/idempotency/idempotency.store';

async function bootstrap() {
  // Initialize Firebase Admin SDK
  initializeFirebase();

  // QUEUE_PROCESSORS_ENABLED=false keeps this API process from consuming BullMQ
  // jobs (the worker task does that). Must run before the app is created.
  const queueProcessingEnabled = applyQueueProcessingMode();

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

  // The real client IP behind the load balancer: the rate limit and the API-key IP allowlist read req.ip.
  applyTrustProxy(app, configService.get('edge', { infer: true })?.trustProxy, configService.get('environment'));

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

  // Global validation pipe: strict class-validator DTOs for bodies and query strings. A failure is a 400
  // VALIDATION_FAILED whose `fieldErrors` names each field.
  app.useGlobalPipes(new AppValidationPipe());

  // Global API prefix
  // MCP root controller is excluded because Claude.ai sends POST/GET/DELETE
  // to the domain root `/` after OAuth (MCP spec strips path for auth base URL).
  // The McpRootController handles these at `/` without the api/v1 prefix.
  applyGlobalPrefix(app);

  // CORS configuration
  // Parse CORS origins: supports exact URLs and wildcard patterns like *.example.com
  const parsedCorsOrigins: (string | RegExp)[] = corsOrigins
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
    .map((o) => {
      if (o.includes('*')) {
        // Convert wildcard pattern to regex: https://*.example.com → /^https:\/\/[^/]+\.example\.com$/
        // Uses [^/]+ (not [^.]+) so wildcard matches multi-level subdomains
        const escaped = o.replace(/[.+?^${}()|\\[\]]/g, '\\$&').replace(/\*/g, '[^/]+');
        return new RegExp(`^${escaped}$`);
      }
      return o;
    });

  app.enableCors({
    origin: parsedCorsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Token', 'Mcp-Session-Id', IDEMPOTENCY_KEY_HEADER],
    // The replay marker and the deprecation headers (ADR "API contract", sections 4 and 5) are readable by a browser.
    exposedHeaders: ['Mcp-Session-Id', IDEMPOTENT_REPLAYED_HEADER, ...DEPRECATION_HEADERS],
    credentials: true, // Allow cookies
  });

  // A local origin in production never gets this far: the config schema
  // refuses to boot (config/configuration.ts).

  // The published contract: the same builder as the committed apps/backend/openapi.json and public-openapi.json.
  // In production (isProductionEnv(), so every deployed task) it serves the public subset; a local run serves the
  // full document. This copy names the configured API origin as its server.
  const oauthIssuer = resolveOAuthIssuer(() => configService.get<string>('oauthIssuer'));
  const document = buildServedOpenApiDocument(app, { serverUrl: oauthIssuer });

  // OAuth 2.1 server metadata (RFC 8414) and protected resource metadata (RFC 9728), at the well-known root, not
  // under /api/v1. The issuer is the one the token service signs into every access token (config `oauthIssuer`).
  mountOAuthMetadata(app, oauthIssuer);

  app.use(OPENAPI_DOCUMENT_PATH, (_req: any, res: any) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json(document);
  });

  // Interactive Swagger UI: off in production unless SWAGGER_UI_ENABLED=true.
  const swaggerUiMounted = mountSwaggerUi(app, document);

  const port = parseInt(process.env.PORT || '8000', 10);

  const logger = app.get(Logger);

  // Each optional feature this product kept gets the app once it exists (platform-glue/features).
  for (const feature of OPTIONAL_FEATURES) feature.onAppReady?.(app);

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
  console.log(`  ✅ App Backend ready on http://localhost:${port}`);
  console.log(`     API:     http://localhost:${port}/api/v1/`);
  if (swaggerUiMounted) console.log(`     Swagger: http://localhost:${port}/${SWAGGER_UI_PATH}`);
  if (!queueProcessingEnabled) console.log('     Queues:  producer only (QUEUE_PROCESSORS_ENABLED=false)');
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
