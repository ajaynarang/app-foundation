/**
 * API Contract for the global search endpoint (`GET /search`).
 *
 * IMPORTANT: `SearchService.search` returns a FLAT `SearchResult[]` — it does
 * NOT wrap results in an envelope like `{ loads, drivers, invoices, customers }`.
 * See `apps/backend/src/domains/fleet/search/search.service.ts` for the
 * authoritative shape. Each item has:
 *   - `type`: one of `'load' | 'driver' | 'invoice' | 'customer'`
 *   - `id`: the string ID of the underlying record (loadId, driverId, etc.)
 *   - `label`: short display string (e.g. `LD-20260401-001 · Ref: PO-12345`)
 *   - `description`: secondary display string (e.g. route, status, amount)
 *   - `href`: suggested in-app route (e.g. `/dispatcher/loads?open=...`)
 *
 * No `.strict()` fallback needed — the service returns exactly these five
 * fields and nothing else, so `.strict()` is applied.
 */
import { z } from 'zod';

export const SearchResultItemSchema = z
  .object({
    type: z.enum(['load', 'driver', 'invoice', 'customer']),
    id: z.string(),
    label: z.string(),
    description: z.string(),
    href: z.string(),
  })
  .strict();

export const SearchResponseSchema = z.array(SearchResultItemSchema);
