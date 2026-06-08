/**
 * API Contracts for Profitability endpoints (Phase 2 Group 2a).
 *
 * Backend controller:
 *   apps/backend/src/domains/financials/invoicing/controllers/profitability.controller.ts
 *
 * Service (source of truth for response shape):
 *   apps/backend/src/domains/financials/invoicing/services/profitability.service.ts
 *
 * Response shape emitted by `ProfitabilityService.calculateForLoad` /
 * `calculateForTenant` matches `LoadProfitabilitySchema` in
 * `@app/shared-types/financials/profitability.schema.ts` verbatim:
 *   `{ loadId, loadNumber, revenueCents, driverCostCents, fuelCostCents,
 *      marginCents, marginPercent }`
 *
 * One subtle-but-OK case: `calculateForLoad` returns an "empty" object via
 * `emptyProfitability(loadId, '')` when the load is not found — `loadNumber`
 * is an empty string and all numeric fields are 0. The shared-types schema
 * uses `z.string()` (no min-length), so strict parse still passes. Tests
 * never assert positive profit (see `GET /profitability/loads/:id`
 * documentation — margin can legitimately be 0 on a load without invoice
 * or settlement lines yet).
 *
 * List endpoint returns a raw array (no envelope).
 */
import { z } from 'zod';
import { LoadProfitabilitySchema } from '@app/shared-types';

/** GET /profitability/loads/:load_id — single-load P&L. */
export const ProfitabilityResponseSchema = LoadProfitabilitySchema;

/** GET /profitability/loads — array of LoadProfitability (raw, no envelope). */
export const ProfitabilityListResponseSchema = z.array(LoadProfitabilitySchema);
