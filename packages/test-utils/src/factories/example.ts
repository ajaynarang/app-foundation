/**
 * EXAMPLE factory — the pattern to copy when you add a domain.
 *
 * Conventions every factory in this package follows:
 *   1. One `build<Thing>()` function per request body, mirroring the
 *      backend DTO 1:1 (the backend ValidationPipe runs with
 *      `whitelist: true, forbidNonWhitelisted: true` — never emit
 *      unknown keys).
 *   2. Defaults are minimal-but-valid; callers layer `overrides` on top.
 *   3. Every value that hits a uniqueness constraint gets a `unique()`
 *      suffix so parallel test workers can't collide.
 *   4. Values that may leak into a real environment are clearly
 *      test-marked (`[QA-TEST]` prefix / `@test.example.com` domain).
 *
 * Copy this file to `factories/<your-domain>.ts`, rename the builders to
 * match your DTOs, and re-export from `factories/index.ts`.
 */
import { unique } from './common.js';

export interface ExampleItemPayload {
  name: string;
  description?: string;
  quantity: number;
}

/** POST /<your-domain>/items body — mirrors a hypothetical `CreateItemDto`. */
export function buildExampleItem(overrides: Partial<ExampleItemPayload> = {}): ExampleItemPayload {
  return {
    name: `[QA-TEST] Item ${unique('item')}`,
    quantity: 1,
    ...overrides,
  };
}

/** PATCH /<your-domain>/items/:id body — default mutates one low-risk scalar. */
export function buildExampleItemUpdate(overrides: Record<string, unknown> = {}) {
  return {
    description: `[QA-TEST] updated ${unique('item-upd')}`,
    ...overrides,
  };
}
