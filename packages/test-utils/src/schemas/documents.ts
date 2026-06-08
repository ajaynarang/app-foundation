/**
 * API Contracts for Documents endpoints.
 *
 * Hand-written because `@sally/shared-types/fleet/document.schema.ts`
 * drifts from the actual controller/service responses:
 *
 *   - Shared types `DocumentSchema` declares `documentId: string`,
 *     `fileSize: number` (required), `entityId: string`, and omits
 *     `tenantId`, `status`, `s3Key`, `fileUrl`, `relatedStopId`.
 *   - The backend `DocumentsService.formatDocumentResponse` actually
 *     emits: `{ id: number, entityType, entityId: number, documentType,
 *     fileName, fileUrl, fileSize, mimeType, s3Key, status, description,
 *     relatedStopId, uploadedBy, tenantId, createdAt, updatedAt }`.
 *
 *   - Shared types `PresignUploadResponseSchema` happens to match the
 *     backend `{ documentId, uploadUrl, s3Key, expiresIn }` shape — we
 *     re-declare it locally for cohesion and to avoid pulling Zod from
 *     shared-types (single source only when shape + field names match).
 *
 * Fields emitted via `?.toISOString?.()` that are null are OMITTED from
 * the JSON payload (not serialised as `null`). Model them as
 * `.nullable().optional()`.
 *
 * No `.strict()` on the list/detail shapes — backend adds fields quickly
 * (e.g. `bolNumber`) and we don't want to block the suite on additive
 * changes. The invariants we assert are field presence + type, not
 * strict equality to a known set.
 */
import { z } from 'zod';
import { dbId, isoDateString } from './helpers.js';

// ── POST /documents/presign-upload ──────────────────────────────────

export const PresignUploadResponseSchema = z.object({
  documentId: dbId,
  uploadUrl: z.string().min(1),
  s3Key: z.string().min(1),
  expiresIn: z.number().int().positive(),
});

// ── GET /documents/:id/download ─────────────────────────────────────
//
// Controller wraps the presigned URL: `{ downloadUrl: string }`.

export const DownloadUrlResponseSchema = z.object({
  downloadUrl: z.string().min(1),
});

// ── DELETE /documents/:id ───────────────────────────────────────────
//
// Controller returns `{ deleted: true }`.

export const DeleteDocumentResponseSchema = z.object({
  deleted: z.literal(true),
});

// ── POST /documents/:id/confirm + GET /documents/:id + list item ────
//
// `DocumentsService.formatDocumentResponse` shape. Same schema serves
// the single-document `getDocument`, `confirmUpload`, and each item in
// the `listDocuments` array response.

export const DocumentRecordSchema = z.object({
  id: dbId,
  entityType: z.string().min(1),
  entityId: z.number().int().nonnegative(),
  documentType: z.string().min(1),
  fileName: z.string().min(1),
  fileUrl: z.string(), // may be empty string before/after upload
  fileSize: z.number().int().nullable(),
  mimeType: z.string().nullable(),
  s3Key: z.string().nullable(),
  status: z.enum(['pending_upload', 'confirmed', 'deleted', 'expired']),
  description: z.string().nullable(),
  relatedStopId: z.number().int().nullable(),
  uploadedBy: z.number().int().nullable(),
  tenantId: z.number().int(),
  createdAt: isoDateString,
  updatedAt: isoDateString.nullable().optional(),
});
