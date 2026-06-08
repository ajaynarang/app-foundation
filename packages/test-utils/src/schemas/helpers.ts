/**
 * API Contract Validation Helper
 *
 * Uses Zod schemas to validate API response shapes.
 * If a field disappears, changes type, or becomes null unexpectedly,
 * the contract test fails — catching regressions before they hit production.
 */
import { z, ZodSchema, ZodError } from 'zod';

/**
 * Assert that a response body matches a Zod schema exactly.
 * Throws a descriptive error if validation fails.
 */
export function expectContract<T>(schema: ZodSchema<T>, data: unknown, context?: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = formatZodErrors(result.error);
    throw new Error(`API Contract Violation${context ? ` (${context})` : ''}:\n${issues}`);
  }
  return result.data;
}

/**
 * Assert that an array response matches a Zod array schema.
 * Also verifies the array is non-empty (unless allowEmpty is true).
 */
export function expectArrayContract<T>(
  itemSchema: ZodSchema<T>,
  data: unknown,
  options?: { allowEmpty?: boolean; context?: string },
): T[] {
  if (!Array.isArray(data)) {
    throw new Error(
      `API Contract: Expected array${options?.context ? ` (${options.context})` : ''}, got ${typeof data}`,
    );
  }
  const arr = data as unknown[];

  if (!options?.allowEmpty && arr.length === 0) {
    throw new Error(`API Contract: Expected non-empty array${options?.context ? ` (${options.context})` : ''}`);
  }

  return arr.map((item, i) => expectContract(itemSchema, item, `${options?.context ?? 'array'}[${i}]`));
}

/**
 * Assert paginated response shape.
 */
export function expectPaginatedContract<T>(itemSchema: ZodSchema<T>, data: unknown, context?: string) {
  const paginatedSchema = z.object({
    data: z.array(itemSchema),
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
  });

  return expectContract(paginatedSchema, data, context);
}

function formatZodErrors(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return `  - ${path || '(root)'}: ${issue.message} (expected ${issue.code})`;
    })
    .join('\n');
}

// ── Common field schemas (reusable across contracts) ────────────────

/** ISO date string (e.g. "2026-04-10T12:00:00.000Z") */
export const isoDateString = z.string().refine((val) => !isNaN(Date.parse(val)), {
  message: 'Expected ISO date string',
});

/** Date-only string (e.g. "2026-04-10") */
export const dateOnlyString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected date-only string (YYYY-MM-DD)');

/** Nullable ISO date */
export const nullableIsoDate = isoDateString.nullable();

/** Nullable date-only */
export const nullableDateOnly = dateOnlyString.nullable();

/** Standard ID field (positive integer) */
export const dbId = z.number().int().positive();

/** String ID field (e.g. "drv-xxx") */
export const stringId = z.string().min(1);
