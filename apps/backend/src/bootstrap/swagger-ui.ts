import type { INestApplication } from '@nestjs/common';
import { SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

/** Where the interactive Swagger UI is served, when it is served. */
export const SWAGGER_UI_PATH = 'api';

/**
 * The Swagger UI is a development tool: an interactive page, served from the
 * API's own origin, that lists and calls every route. It is off in production
 * (`NODE_ENV=production`, the same test the config schema uses) unless
 * `SWAGGER_UI_ENABLED=true` turns it on deliberately. Outside production it is
 * on unless `SWAGGER_UI_ENABLED=false`.
 */
export function swaggerUiEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const override = env.SWAGGER_UI_ENABLED?.trim().toLowerCase();
  if (override === 'true') return true;
  if (override === 'false') return false;
  return env.NODE_ENV !== 'production';
}

/** Mounts the Swagger UI if it is enabled. Returns whether it was mounted. */
export function mountSwaggerUi(
  app: INestApplication,
  document: OpenAPIObject,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!swaggerUiEnabled(env)) return false;
  SwaggerModule.setup(SWAGGER_UI_PATH, app, document);
  return true;
}
