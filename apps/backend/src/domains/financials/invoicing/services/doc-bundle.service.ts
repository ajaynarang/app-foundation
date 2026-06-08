import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import archiver from 'archiver';
import { Writable } from 'node:stream';
import { BundleFormat } from '@prisma/client';
import { DocumentStatusSchema, type DocBundleDocType } from '@sally/shared-types';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { FileStorageService } from '../../../../infrastructure/storage/file-storage.service';
import { InvoicePdfService } from './invoice-pdf.service';

const DOCUMENT_STATUS = DocumentStatusSchema.enum;

const REQUIRED_SOURCE_DOC_TYPES: ReadonlyArray<Exclude<DocBundleDocType, 'INVOICE'>> = ['RATE_CON', 'BOL', 'POD'];

const DOC_TYPE_LABEL: Record<DocBundleDocType, string> = {
  INVOICE: 'Invoice',
  RATE_CON: 'Rate Confirmation',
  BOL: 'Bill of Lading',
  POD: 'Proof of Delivery',
};

// Universal filenames inside ZIP — factors index by content, not filename.
const ZIP_ENTRY_NAME: Record<Exclude<DocBundleDocType, 'INVOICE'>, string> = {
  RATE_CON: 'rate-con.pdf',
  BOL: 'BOL.pdf',
  POD: 'POD.pdf',
};

type SourceDoc = { type: Exclude<DocBundleDocType, 'INVOICE'>; buf: Buffer };

@Injectable()
export class DocBundleService {
  private readonly logger = new Logger(DocBundleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fileStorage: FileStorageService,
    private readonly invoicePdfService: InvoicePdfService,
  ) {}

  /**
   * Get the list of documents available for an invoice's load.
   * Returns documents (deduplicated by type, most recent by updatedAt),
   * the missing required types, and the invoice/load references.
   */
  async getDocumentList(tenantId: number, invoiceNumber: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { invoiceNumber, tenantId },
      select: { id: true, invoiceNumber: true, loadId: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const documents = await this.prisma.document.findMany({
      where: {
        entityType: 'Load',
        entityId: invoice.loadId,
        documentType: { in: [...REQUIRED_SOURCE_DOC_TYPES] },
        status: DOCUMENT_STATUS.CONFIRMED,
        tenantId,
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Deduplicate by type — keep the most recent (already sorted desc by updatedAt).
    const seen = new Set<string>();
    const deduplicated = documents.filter((doc) => {
      if (seen.has(doc.documentType)) return false;
      seen.add(doc.documentType);
      return true;
    });

    const foundTypes = deduplicated.map((doc) => doc.documentType);
    const missing = REQUIRED_SOURCE_DOC_TYPES.filter((t) => !foundTypes.includes(t));

    return {
      documents: deduplicated,
      missing,
      invoiceNumber: invoice.invoiceNumber,
      loadId: invoice.loadId,
    };
  }

  /**
   * Cheap pre-check used by the dialog and the submit endpoint.
   * Considers a doc "ready" only if it exists with a non-null `s3Key`.
   */
  async validateBundleReady(
    tenantId: number,
    invoiceNumber: string,
  ): Promise<{ ready: boolean; missing: DocBundleDocType[] }> {
    const { documents } = await this.getDocumentList(tenantId, invoiceNumber);
    const presentTypes = new Set(documents.filter((d) => !!d.s3Key).map((d) => d.documentType as DocBundleDocType));
    const missing: DocBundleDocType[] = REQUIRED_SOURCE_DOC_TYPES.filter((t) => !presentTypes.has(t));
    return { ready: missing.length === 0, missing };
  }

  /**
   * Generate the factoring bundle in the tenant's preferred format.
   *
   * Order: invoice (cover page) → rate-con → BOL → POD.
   *
   * - **ZIP** (default): 4 separate PDFs inside one .zip
   *   (`invoice.pdf`, `rate-con.pdf`, `BOL.pdf`, `POD.pdf`).
   *   Universally accepted by every factor.
   * - **MERGED_PDF** (opt-in): all 4 sections combined into one PDF via pdf-lib.
   *
   * The format is read from `Tenant.bundleFormat`. Filename, S3 key extension,
   * and S3 content-type all flip based on format. `submitToFactor` enforces
   * completeness via `validateBundleReady`; this method tolerates partial
   * bundles so the preview button still works before all docs are uploaded.
   */
  async generateBundle(
    tenantId: number,
    invoiceNumber: string,
  ): Promise<{
    buffer: Buffer;
    fileName: string;
    /** Authoritative format for callers (controller, email service) — avoids re-sniffing the filename. */
    format: BundleFormat;
    /** MIME type matching `format` — set as `Content-Type` on download/email responses. */
    contentType: string;
    bundleS3Key?: string;
    bundleSizeBytes: number;
    missingDocs: DocBundleDocType[];
    durationMs: number;
  }> {
    const startedAt = Date.now();
    const invoice = await this.prisma.invoice.findFirst({
      where: { invoiceNumber, tenantId },
      select: { invoiceNumber: true, loadId: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { bundleFormat: true },
    });
    // Defensive default — column is NOT NULL in DB, but ZIP is the safer
    // fallback (no PDF merge needed) if a stale row or test mock returns null.
    const format: BundleFormat = tenant?.bundleFormat ?? BundleFormat.ZIP;

    const invoicePdfBuffer = await this.invoicePdfService.generatePdf(tenantId, invoiceNumber);

    const sourceDocs = await this.fetchSourceDocs(tenantId, invoiceNumber);

    const isZip = format === BundleFormat.ZIP;
    const extension = isZip ? 'zip' : 'pdf';
    const contentType = isZip ? 'application/zip' : 'application/pdf';
    const fileName = `${invoice.invoiceNumber}-bundle.${extension}`;

    const bundleBuffer = isZip
      ? await this.buildZipBuffer(invoicePdfBuffer, sourceDocs.docs)
      : await this.buildMergedPdfBuffer(invoicePdfBuffer, sourceDocs.docs);

    const epochMs = Date.now();
    const bundleS3Key = `tenants/${tenantId}/invoices/${invoiceNumber}/bundle-${epochMs}.${extension}`;
    await this.fileStorage.uploadBuffer(bundleS3Key, bundleBuffer, contentType);

    const durationMs = Date.now() - startedAt;
    this.logger.log(
      `Bundle generated tenantId=${tenantId} invoiceNumber=${invoiceNumber} format=${format} sizeBytes=${bundleBuffer.length} durationMs=${durationMs} missing=${
        sourceDocs.missingDocs.length === 0 ? 'none' : sourceDocs.missingDocs.join(',')
      }`,
    );

    return {
      buffer: bundleBuffer,
      fileName,
      format,
      contentType,
      bundleS3Key,
      bundleSizeBytes: bundleBuffer.length,
      missingDocs: sourceDocs.missingDocs,
      durationMs,
    };
  }

  /**
   * Resolve the required source docs into in-memory PDF buffers, in the
   * canonical order. Throws `BadRequestException` (named) if any present
   * doc fails to download — caller's `validateBundleReady` controls whether
   * partial bundles are tolerated (preview vs submit).
   */
  private async fetchSourceDocs(
    tenantId: number,
    invoiceNumber: string,
  ): Promise<{ docs: SourceDoc[]; missingDocs: DocBundleDocType[] }> {
    const { documents } = await this.getDocumentList(tenantId, invoiceNumber);
    const byType = new Map(documents.map((d) => [d.documentType, d]));

    const ordered: { type: Exclude<DocBundleDocType, 'INVOICE'>; s3Key: string }[] = [];
    const missingDocs: DocBundleDocType[] = [];
    for (const t of REQUIRED_SOURCE_DOC_TYPES) {
      const doc = byType.get(t);
      if (doc?.s3Key) ordered.push({ type: t, s3Key: doc.s3Key });
      else missingDocs.push(t);
    }

    // Download source PDFs in parallel — independent S3 GETs.
    const downloadResults = await Promise.all(
      ordered.map(async ({ type, s3Key }) => {
        try {
          const buf = await this.fileStorage.downloadBuffer(s3Key);
          return { type, buf, error: null as Error | null };
        } catch (err) {
          return { type, buf: null as Buffer | null, error: err instanceof Error ? err : new Error(String(err)) };
        }
      }),
    );

    const docs: SourceDoc[] = [];
    for (const { type, buf, error } of downloadResults) {
      if (error || !buf) {
        const reason = error?.message ?? 'no buffer returned';
        this.logger.warn(`Bundle generate ${invoiceNumber}: source ${type} unavailable: ${reason}`);
        throw new BadRequestException(`${DOC_TYPE_LABEL[type]} could not be loaded — please re-upload it.`);
      }
      docs.push({ type, buf });
    }

    return { docs, missingDocs };
  }

  private async buildMergedPdfBuffer(invoicePdf: Buffer, sourceDocs: SourceDoc[]): Promise<Buffer> {
    // pdf-lib is NOT concurrency-safe, so the actual append runs sequentially.
    const merged = await PDFDocument.create();
    await this.appendPdf(merged, invoicePdf, 'INVOICE');
    for (const { type, buf } of sourceDocs) {
      await this.appendPdf(merged, buf, type);
    }
    return Buffer.from(await merged.save());
  }

  private async buildZipBuffer(invoicePdf: Buffer, sourceDocs: SourceDoc[]): Promise<Buffer> {
    const chunks: Buffer[] = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(Buffer.from(chunk));
        cb();
      },
    });

    const zip = archiver('zip', { zlib: { level: 6 } });
    const done = new Promise<void>((resolve, reject) => {
      zip.on('error', reject);
      sink.on('finish', resolve);
      sink.on('error', reject);
    });
    zip.pipe(sink);

    zip.append(invoicePdf, { name: 'invoice.pdf' });
    for (const { type, buf } of sourceDocs) {
      zip.append(buf, { name: ZIP_ENTRY_NAME[type] });
    }
    await zip.finalize();
    await done;
    return Buffer.concat(chunks);
  }

  private async appendPdf(merged: PDFDocument, source: Buffer, label: DocBundleDocType): Promise<void> {
    let src: PDFDocument;
    try {
      src = await PDFDocument.load(source);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Bundle merge: ${label} parse failed: ${reason}`);
      throw new BadRequestException(`${DOC_TYPE_LABEL[label]} is not a valid PDF — please re-upload it.`);
    }
    const pages = await merged.copyPages(src, src.getPageIndices());
    for (const p of pages) merged.addPage(p);
  }
}
