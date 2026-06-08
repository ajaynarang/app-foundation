/**
 * Fleet — Documents API (Phase 1 Group 4)
 *
 * Covers all 6 endpoints on `DocumentsController`:
 *   - POST   /documents/presign-upload   → presigned S3 upload URL
 *   - POST   /documents/:id/confirm      → client-side post-upload ack
 *   - GET    /documents                  → list for an entity
 *   - GET    /documents/:id              → single-doc detail
 *   - GET    /documents/:id/download     → presigned S3 download URL
 *   - DELETE /documents/:id              → soft-delete (status → 'deleted')
 *
 * DTO specifics (see `apps/backend/src/domains/fleet/documents/dto/
 * presign-upload.dto.ts`):
 *   - `entityType` is lowercase snake — `'load' | 'load_stop' | 'driver' |
 *     'vehicle' | 'recurring_lane'`.
 *   - `entityId` is a STRING on the wire; the controller converts via
 *     `Number(dto.entityId)`. The list endpoint uses `@Query('entityId',
 *     ParseIntPipe)` so it's a numeric query param.
 *   - `documentType` must be one of `getAllDocumentTypeCodes()`.
 *   - `mimeType` must be in
 *     `['application/pdf','image/jpeg','image/png','image/tiff','image/heic']`.
 *   - `fileSize` ≤ 10 MB (service enforces).
 *
 * Role rules:
 *   - presign/confirm/list/detail/download → DRIVER/DISPATCHER/ADMIN/OWNER
 *   - delete                               → DISPATCHER/ADMIN/OWNER
 *   Entire spec runs as `asDispatcher` (authorised on every endpoint,
 *   and bypasses the DRIVER-specific ownership guard in the service).
 *
 * S3 observation: `FileStorageService.generatePresignedUploadUrl` / `
 * generatePresignedDownloadUrl` use `@aws-sdk/s3-request-presigner`, which
 * SIGNS a URL locally without any S3 round-trip. This means presign +
 * confirm + download are all S3-independent in dev — we never need to
 * actually upload bytes. (The service reads `doc.status === 'pending_upload'`
 * on confirm, not "does the S3 object exist".)
 *
 * Chain: presign → confirm → list/detail/download → delete. Each test
 * creates a fresh document to keep tests isolated; soft-cleanup at end.
 *
 * Schema strategy — hand-written in
 * `packages/test-utils/src/schemas/documents.ts`; see the docstring there
 * for drift rationale.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildLoad, buildDocumentPresignRequest } from '@sally/test-utils/factories';
import { cleanupLoad } from '@sally/test-utils/helpers';
import { expectContract, expectArrayContract, DocumentSchemas } from '@sally/test-utils/schemas';
import type { RoleApiClient } from '@sally/test-utils/playwright';

const { PresignUploadResponseSchema, DownloadUrlResponseSchema, DeleteDocumentResponseSchema, DocumentRecordSchema } =
  DocumentSchemas;

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Find the first customer id on the tenant so we can seed a load to attach
 * documents to. Mirrors the pattern used in `tracking.spec.ts`.
 */
async function firstCustomerId(api: RoleApiClient): Promise<number> {
  const res = await api.get('/customers');
  expect(res.status()).toBe(200);
  const body: unknown = await res.json();
  const items = Array.isArray(body)
    ? (body as Array<{ id: number }>)
    : ((body as { data?: Array<{ id: number }> }).data ?? []);
  if (items.length === 0) {
    throw new Error('GET /customers returned 0 customers — documents test requires a seeded customer');
  }
  return items[0].id;
}

/**
 * Create a LOAD on the tenant and return its numeric DB id + string loadId.
 * The numeric id is what `entityType: 'load'` document rows reference.
 */
async function createLoadForDocs(api: RoleApiClient, customerId: number): Promise<{ id: number; loadId: string }> {
  const payload = buildLoad(customerId);
  const res = await api.post('/loads', payload);
  expect(res.status()).toBe(201);
  const body = (await res.json()) as { id: number; loadId: string };
  return { id: body.id, loadId: body.loadId };
}

/**
 * Presign + confirm a fresh document for the given LOAD. Returns the
 * confirmed document record. Separated into a helper so individual tests
 * can share the setup but still assert the specific endpoint under test.
 */
async function presignAndConfirm(
  api: RoleApiClient,
  loadDbId: number,
): Promise<{
  documentId: number;
  record: import('zod').infer<typeof DocumentRecordSchema>;
}> {
  const presignPayload = buildDocumentPresignRequest({
    entityType: 'load',
    entityId: loadDbId,
    documentType: 'rate_confirmation',
  });
  const presignRes = await api.post('/documents/presign-upload', presignPayload);
  expect(presignRes.status()).toBe(201);
  const presign = expectContract(
    PresignUploadResponseSchema,
    await presignRes.json(),
    'helper: presignAndConfirm → presign',
  );

  const confirmRes = await api.post(`/documents/${presign.documentId}/confirm`, {});
  expect(confirmRes.status()).toBe(201);
  const record = expectContract(DocumentRecordSchema, await confirmRes.json(), 'helper: presignAndConfirm → confirm');
  return { documentId: presign.documentId, record };
}

// ── Suite ───────────────────────────────────────────────────────────

test.describe('Fleet · Documents @workflow', () => {
  // Track loads + non-deleted document ids for afterEach cleanup. Documents
  // are soft-deleted (status → 'deleted'); loads are hard-deleted via cleanupLoad.
  const createdLoadIds: string[] = [];
  const createdDocumentIds: number[] = [];

  test.afterEach(async ({ asDispatcher }) => {
    for (const id of createdDocumentIds.splice(0)) {
      await asDispatcher.delete(`/documents/${id}`).catch(() => undefined);
    }
    for (const loadId of createdLoadIds.splice(0)) {
      await cleanupLoad(asDispatcher, loadId).catch(() => undefined);
    }
  });

  // 1 ── POST /documents/presign-upload ────────────────────────────
  test('POST /documents/presign-upload returns signed URL + documentId @workflow @destructive', async ({
    asDispatcher,
  }) => {
    const customerId = await firstCustomerId(asDispatcher);
    const load = await createLoadForDocs(asDispatcher, customerId);
    createdLoadIds.push(load.loadId);

    const payload = buildDocumentPresignRequest({
      entityType: 'load',
      entityId: load.id,
      documentType: 'rate_confirmation',
    });
    const res = await asDispatcher.post('/documents/presign-upload', payload);
    expect(res.status()).toBe(201);
    const body = expectContract(PresignUploadResponseSchema, await res.json(), 'POST /documents/presign-upload');

    // Semantic: envelope has AWS-style presigned URL + tenant-scoped S3 key.
    expect(body.uploadUrl).toContain('https://');
    expect(body.s3Key).toMatch(/^tenants\/\d+\/documents\/load\/\d+\//);
    expect(body.expiresIn).toBe(300);
    expect(body.documentId).toBeGreaterThan(0);
    createdDocumentIds.push(body.documentId);

    // Persistence: the document row exists in 'pending_upload' status — we
    // can't observe pending rows via GET /documents (which filters to
    // 'confirmed' only), but GET /documents/:id returns them because
    // `getRawDocument` excludes only 'deleted'. Assert that here.
    const detailRes = await asDispatcher.get(`/documents/${body.documentId}`);
    expect(detailRes.status()).toBe(200);
    const detail = expectContract(DocumentRecordSchema, await detailRes.json());
    expect(detail.status).toBe('pending_upload');
    expect(detail.entityType).toBe('load');
    expect(detail.entityId).toBe(load.id);
    expect(detail.documentType).toBe('rate_confirmation');
  });

  // 2 ── POST /documents/:id/confirm ───────────────────────────────
  test('POST /documents/:id/confirm transitions pending_upload → confirmed @workflow @destructive', async ({
    asDispatcher,
  }) => {
    const customerId = await firstCustomerId(asDispatcher);
    const load = await createLoadForDocs(asDispatcher, customerId);
    createdLoadIds.push(load.loadId);

    // Presign first to create a 'pending_upload' row.
    const presignPayload = buildDocumentPresignRequest({
      entityType: 'load',
      entityId: load.id,
      documentType: 'rate_confirmation',
    });
    const presignRes = await asDispatcher.post('/documents/presign-upload', presignPayload);
    expect(presignRes.status()).toBe(201);
    const presign = expectContract(PresignUploadResponseSchema, await presignRes.json());
    createdDocumentIds.push(presign.documentId);

    // Confirm — service updates status without requiring the S3 object to
    // exist (checks `doc.status === 'pending_upload'`).
    const res = await asDispatcher.post(`/documents/${presign.documentId}/confirm`, {});
    expect(res.status()).toBe(201);
    const body = expectContract(DocumentRecordSchema, await res.json(), 'POST /documents/:id/confirm');

    // Semantic: status flipped to confirmed; other fields carry through.
    expect(body.id).toBe(presign.documentId);
    expect(body.status).toBe('confirmed');
    expect(body.entityType).toBe('load');
    expect(body.entityId).toBe(load.id);

    // Persistence: GET /documents/:id sees the confirmed state.
    const detailRes = await asDispatcher.get(`/documents/${presign.documentId}`);
    expect(detailRes.status()).toBe(200);
    const detail = expectContract(DocumentRecordSchema, await detailRes.json());
    expect(detail.status).toBe('confirmed');

    // Re-confirm must 400 (service rejects with "already ...").
    const reconfirmRes = await asDispatcher.post(`/documents/${presign.documentId}/confirm`, {});
    expect(reconfirmRes.status()).toBe(400);
  });

  // 3 ── GET /documents?entityType=...&entityId=... ────────────────
  test('GET /documents lists confirmed documents for an entity @workflow @destructive', async ({ asDispatcher }) => {
    const customerId = await firstCustomerId(asDispatcher);
    const load = await createLoadForDocs(asDispatcher, customerId);
    createdLoadIds.push(load.loadId);

    // Seed one confirmed doc so the list has a deterministic entry.
    const seeded = await presignAndConfirm(asDispatcher, load.id);
    createdDocumentIds.push(seeded.documentId);

    const res = await asDispatcher.get(`/documents?entityType=load&entityId=${load.id}`);
    expect(res.status()).toBe(200);
    const items = expectArrayContract(DocumentRecordSchema, await res.json(), {
      allowEmpty: false,
      context: 'GET /documents',
    });

    // Semantic: every returned doc is for this load, confirmed, not deleted.
    for (const d of items) {
      expect(d.entityType).toBe('load');
      expect(d.entityId).toBe(load.id);
      expect(d.status).toBe('confirmed');
    }
    const ours = items.find((d) => d.id === seeded.documentId);
    expect(ours).toBeDefined();
    expect(ours?.documentType).toBe('rate_confirmation');
  });

  // 4 ── GET /documents/:id ────────────────────────────────────────
  test('GET /documents/:id returns single document detail @workflow @destructive', async ({ asDispatcher }) => {
    const customerId = await firstCustomerId(asDispatcher);
    const load = await createLoadForDocs(asDispatcher, customerId);
    createdLoadIds.push(load.loadId);

    const seeded = await presignAndConfirm(asDispatcher, load.id);
    createdDocumentIds.push(seeded.documentId);

    const res = await asDispatcher.get(`/documents/${seeded.documentId}`);
    expect(res.status()).toBe(200);
    const body = expectContract(DocumentRecordSchema, await res.json(), 'GET /documents/:id');

    // Semantic: the record matches what confirm returned.
    expect(body.id).toBe(seeded.documentId);
    expect(body.entityType).toBe('load');
    expect(body.entityId).toBe(load.id);
    expect(body.status).toBe('confirmed');
    expect(body.fileName).toBe(seeded.record.fileName);
    expect(body.s3Key).toBe(seeded.record.s3Key);

    // Persistence: unknown id returns 404.
    const missingRes = await asDispatcher.get('/documents/999999999');
    expect(missingRes.status()).toBe(404);
  });

  // 5 ── GET /documents/:id/download ───────────────────────────────
  test('GET /documents/:id/download returns presigned download URL @workflow @destructive', async ({
    asDispatcher,
  }) => {
    const customerId = await firstCustomerId(asDispatcher);
    const load = await createLoadForDocs(asDispatcher, customerId);
    createdLoadIds.push(load.loadId);

    const seeded = await presignAndConfirm(asDispatcher, load.id);
    createdDocumentIds.push(seeded.documentId);

    const res = await asDispatcher.get(`/documents/${seeded.documentId}/download`);
    expect(res.status()).toBe(200);
    const body = expectContract(DownloadUrlResponseSchema, await res.json(), 'GET /documents/:id/download');

    // Semantic: url is a presigned S3 GET URL (locally signed, no round-trip).
    expect(body.downloadUrl).toContain('https://');
    expect(body.downloadUrl.length).toBeGreaterThan(100);

    // Persistence: a subsequent download request still succeeds (presign is
    // idempotent — each call mints a fresh signed URL).
    const again = await asDispatcher.get(`/documents/${seeded.documentId}/download`);
    expect(again.status()).toBe(200);
    const againBody = expectContract(DownloadUrlResponseSchema, await again.json());
    expect(againBody.downloadUrl).toContain('https://');
  });

  // 6 ── DELETE /documents/:id ─────────────────────────────────────
  test('DELETE /documents/:id soft-deletes the document @workflow @destructive', async ({ asDispatcher }) => {
    const customerId = await firstCustomerId(asDispatcher);
    const load = await createLoadForDocs(asDispatcher, customerId);
    createdLoadIds.push(load.loadId);

    const seeded = await presignAndConfirm(asDispatcher, load.id);

    const res = await asDispatcher.delete(`/documents/${seeded.documentId}`);
    expect(res.status()).toBe(200);
    const body = expectContract(DeleteDocumentResponseSchema, await res.json(), 'DELETE /documents/:id');
    expect(body.deleted).toBe(true);

    // Persistence: GET /documents/:id → 404 (getRawDocument excludes 'deleted').
    const detailRes = await asDispatcher.get(`/documents/${seeded.documentId}`);
    expect(detailRes.status()).toBe(404);

    // The list query also no longer surfaces the deleted doc.
    const listRes = await asDispatcher.get(`/documents?entityType=load&entityId=${load.id}`);
    expect(listRes.status()).toBe(200);
    const items = expectArrayContract(DocumentRecordSchema, await listRes.json(), {
      allowEmpty: true,
      context: 'GET /documents after DELETE',
    });
    const ghost = items.find((d) => d.id === seeded.documentId);
    expect(ghost).toBeUndefined();

    // Not pushed to createdDocumentIds — already soft-deleted.
  });
});
