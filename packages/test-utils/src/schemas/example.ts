/**
 * EXAMPLE response schema — the pattern to copy when you add a domain.
 *
 * Conventions every schema module in this package follows:
 *   1. Hand-write the WIRE shape (what the controller actually returns),
 *      not the Prisma model — services project/rename fields.
 *   2. `.strict()` everywhere so contract drift fails loudly.
 *   3. Use the shared `dbId` / `stringId` / `isoDateString` helpers.
 *   4. Annotate each schema with the endpoint(s) it covers.
 *   5. Validate in specs via `expectContract(response, Schema)` /
 *      `expectArrayContract(response, Schema)` from `./helpers.js`.
 *
 * Copy this file to `schemas/<your-domain>.ts` and re-export it from
 * `schemas/index.ts` as `export * as <YourDomain>Schemas from ...`.
 */
import { z } from 'zod';
import { dbId, isoDateString } from './helpers.js';

/** GET /<your-domain>/items list row + GET /<your-domain>/items/:id detail. */
export const ExampleItemSchema = z
  .object({
    id: dbId,
    name: z.string(),
    description: z.string().nullable(),
    quantity: z.number().int().nonnegative(),
    createdAt: isoDateString,
    updatedAt: isoDateString,
  })
  .strict();

/** GET /<your-domain>/items — paginated envelope. */
export const ExampleItemListSchema = z
  .object({
    data: z.array(ExampleItemSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
  })
  .strict();
