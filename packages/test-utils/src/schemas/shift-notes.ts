/**
 * API contract for shift-note CRUD responses under
 * `/command-center/shift-notes`.
 *
 * `@app/shared-types/operations/command-center.schema.ts` already exposes
 * `ShiftNoteSchema` and `ShiftNotesResponseSchema`. We re-export so tests
 * have a single import site; callers tighten via `.strict()` at the
 * `expectContract` site where needed.
 */
import {
  ShiftNoteSchema as SharedShiftNoteSchema,
  ShiftNotesResponseSchema as SharedShiftNotesResponseSchema,
} from '@app/shared-types';

export const ShiftNoteSchema = SharedShiftNoteSchema;
export type ShiftNote = import('zod').z.infer<typeof ShiftNoteSchema>;

export const ShiftNotesResponseSchema = SharedShiftNotesResponseSchema;
export type ShiftNotesResponse = import('zod').z.infer<typeof ShiftNotesResponseSchema>;
