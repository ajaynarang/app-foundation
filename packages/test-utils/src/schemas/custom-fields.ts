/**
 * API Contracts for Custom Fields endpoints.
 *
 * `@sally/shared-types/fleet/custom-field.schema.ts` exposes
 * `CustomFieldDefinitionSchema` which is close to the backend response,
 * but differs:
 *
 *   - Shared types declares `createdAt: z.string()` / `updatedAt: z.string()`.
 *     Backend returns them as Prisma Date objects JSON-serialised to ISO strings
 *     (matches — kept as ISO date strings here).
 *   - Shared types uses `.default()` on several booleans/arrays; `.parse()`
 *     would SET defaults on missing keys, but the backend ALWAYS emits those
 *     keys so the defaults are irrelevant. Re-declaring explicitly here keeps
 *     the contract tight against regression.
 *
 * Rather than import the shared-types schema and layer assertions on top,
 * we mirror it here so (a) a shared-types drift doesn't silently relax the
 * test contract, and (b) the response shape is discoverable by readers of
 * this spec without chasing the import.
 *
 * The `reorder` endpoint returns `{ success: true }`. The `usage` endpoint
 * returns `{ count: number }`. Both are declared below.
 */
import { z } from 'zod';
import { isoDateString } from './helpers.js';

export const CustomFieldEntityTypeSchema = z.enum(['LOAD', 'DRIVER', 'VEHICLE', 'CUSTOMER']);

export const CustomFieldTypeSchema = z.enum(['TEXT', 'NUMBER', 'DATE', 'SELECT']);

// ── GET /custom-fields/definitions?entityType=... item shape ────────
// ── POST /custom-fields/definitions create response shape ───────────
// ── PATCH /custom-fields/definitions/:id update response shape ──────
//
// All three return the raw Prisma `CustomFieldDefinition` row. The id is a
// cuid string (not numeric). `options` is a Postgres `jsonb` column persisted
// as a string-array.

export const CustomFieldDefinitionSchema = z.object({
  id: z.string().min(1),
  tenantId: z.number().int(),
  entityType: CustomFieldEntityTypeSchema,
  name: z.string().min(1).max(100),
  fieldKey: z.string().min(1).max(50),
  fieldType: CustomFieldTypeSchema,
  options: z.array(z.string()),
  isRequired: z.boolean(),
  driverEditable: z.boolean(),
  sortOrder: z.number().int().min(0),
  isActive: z.boolean(),
  showOnInvoice: z.boolean(),
  showOnBol: z.boolean(),
  createdAt: isoDateString,
  updatedAt: isoDateString,
});

// ── PATCH /custom-fields/definitions/reorder ────────────────────────

export const ReorderCustomFieldsResponseSchema = z.object({
  success: z.literal(true),
});

// ── GET /custom-fields/definitions/:id/usage ────────────────────────

export const CustomFieldUsageResponseSchema = z.object({
  count: z.number().int().nonnegative(),
});
