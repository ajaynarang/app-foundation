import { z } from 'zod';

/**
 * The one response shape for cursor-paged product lists.
 *
 * - `items`      — this page, already serialized to public DTOs.
 * - `nextCursor` — pass back as `?cursor=` for the next page; `null` on the last page.
 *                  Opaque: clients never build, parse or store it beyond the next request.
 * - `total`      — rows matching the CURRENT view (search + filters + date + status).
 * - `counts`     — per-status totals for the current search + filters + date window,
 *                  IGNORING the status filter — what a status pivot shows beside each label.
 */
export interface CursorList<T, CountKey extends string = string> {
  items: T[];
  nextCursor: string | null;
  total: number;
  counts?: Record<CountKey, number>;
}

/** Build the Zod schema of a cursor-paged list of `item`. */
export function cursorListSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
    total: z.number().int().min(0),
    counts: z.record(z.string(), z.number().int().min(0)).optional(),
  });
}

/** Page-size contract every cursor-paged endpoint shares (mirrors the kernel helper). */
export const CURSOR_PAGE_SIZE = { DEFAULT: 50, MAX: 100 } as const;
