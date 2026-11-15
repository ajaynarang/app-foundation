/**
 * Write the published OpenAPI documents: `pnpm --filter @app/backend openapi:generate`.
 *
 *   ts-node scripts/generate-openapi.ts [out]   (default: apps/backend/openapi.json)
 *
 * Writes two files from one boot: the full contract at `out`, and beside it `public-openapi.json`, the operations an
 * outside developer can call, decided from each route's guards and filters (`src/bootstrap/public-openapi.ts`). A
 * production process serves the second at `/api/openapi.json`; a local run serves the first.
 *
 * Type-aware ts-node, never `--transpile-only`: the document reads decorator metadata (`design:type`,
 * `design:paramtypes`), and an isolated transpile emits `Object` for an imported type alias where `nest build` emits
 * `String`; the committed file would then differ from what the built server serves.
 *
 * No port, no database, no Redis: the module graph boots in Nest's preview mode (no provider is instantiated) and
 * `buildOpenApiDocument`, the same builder `main.ts` serves, reads the routes' metadata. The environment is pinned
 * so the document never depends on the machine that generated it. Needs built foundation packages (`@appshore/*`
 * resolve to their dist), like every other backend entry point.
 */
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';

export const OPENAPI_PATH = join(__dirname, '..', 'openapi.json');

async function main(out: string): Promise<void> {
  // Before the app module is imported: no telemetry SDK, and the non-production module set (the dev controllers it
  // adds are excluded from the document by @ApiExcludeController).
  process.env.NODE_ENV = 'test';
  process.env.ENV_TYPE = 'development';

  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../src/app.module');
  const { applyGlobalPrefix, buildOpenApiDocument } = await import('../src/bootstrap/openapi');
  const { auditOpenApiDocument } = await import('../src/bootstrap/openapi-audit');
  const { documentedRoutes } = await import('../src/bootstrap/openapi-routes');
  const { buildPublicOpenApiDocument, vendorRoutes } = await import('../src/bootstrap/public-openapi');

  const app = await NestFactory.create(AppModule, { preview: true, logger: ['error'], abortOnError: false });
  applyGlobalPrefix(app);
  const document = buildOpenApiDocument(app);
  const vendor = vendorRoutes(documentedRoutes(app));
  const problems = [...auditOpenApiDocument(app, document), ...vendor.problems];
  await app.close();
  if (problems.length > 0) {
    // An incomplete contract is never written (swagger-completeness.spec.ts runs this script).
    console.error(`OpenAPI: ${problems.length} completeness problem(s), nothing written:\n  ${problems.join('\n  ')}`);
    process.exit(2);
  }
  const publicDocument = buildPublicOpenApiDocument(document, vendor.routes);
  const publicOut = join(dirname(out), 'public-openapi.json');
  writeFileSync(out, JSON.stringify(document, null, 2) + '\n');
  writeFileSync(publicOut, JSON.stringify(publicDocument, null, 2) + '\n');
  console.log(`OpenAPI: ${Object.keys(document.paths).length} paths → ${out}`);
  console.log(`OpenAPI: ${Object.keys(publicDocument.paths).length} public paths → ${publicOut}`);
}

main(process.argv[2] ?? OPENAPI_PATH).then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
