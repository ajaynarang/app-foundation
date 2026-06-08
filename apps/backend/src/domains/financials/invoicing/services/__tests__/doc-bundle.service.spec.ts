import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DocBundleService } from '../doc-bundle.service';
import { InvoicePdfService } from '../invoice-pdf.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { FileStorageService } from '../../../../../infrastructure/storage/file-storage.service';
import { createMockPrisma } from '../../../../../test/mocks';

describe('DocBundleService', () => {
  let service: DocBundleService;
  let prisma: ReturnType<typeof createMockPrisma>;

  const mockInvoicePdfService = {
    generatePdf: jest.fn(),
  };

  const mockFileStorage = {
    downloadBuffer: jest.fn(),
    uploadBuffer: jest.fn(),
  };

  beforeEach(async () => {
    prisma = createMockPrisma();
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocBundleService,
        { provide: PrismaService, useValue: prisma },
        { provide: InvoicePdfService, useValue: mockInvoicePdfService },
        { provide: FileStorageService, useValue: mockFileStorage },
      ],
    }).compile();

    service = module.get<DocBundleService>(DocBundleService);

    // Legacy tests in this file were written for the MERGED_PDF path. The
    // format-aware describe block below overrides per-test as needed.
    prisma.tenant.findUnique.mockResolvedValue({ bundleFormat: 'MERGED_PDF' });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const tenantId = 1;

  // ─── getDocumentList ───────────────────────────────────────

  describe('getDocumentList', () => {
    it('should return documents and missing types for an invoice', async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        id: 1,
        invoiceNumber: 'inv-001',
        loadId: 10,
      });
      prisma.document.findMany.mockResolvedValue([
        {
          id: 1,
          documentType: 'RATE_CON',
          entityType: 'Load',
          entityId: 10,
          status: 'CONFIRMED',
          createdAt: new Date('2026-03-10'),
        },
        {
          id: 2,
          documentType: 'BOL',
          entityType: 'Load',
          entityId: 10,
          status: 'CONFIRMED',
          createdAt: new Date('2026-03-09'),
        },
      ]);

      const result = await service.getDocumentList(tenantId, 'inv-001');

      expect(result.documents).toHaveLength(2);
      expect(result.missing).toEqual(['POD']);
      expect(result.invoiceNumber).toBe('inv-001');
    });

    it('should throw NotFoundException when invoice not found', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.getDocumentList(tenantId, 'not-found')).rejects.toThrow(NotFoundException);
    });

    it('deduplicates documents by type, keeping the most recent by updatedAt (handles re-uploads)', async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        id: 1,
        invoiceNumber: 'inv-001',
        loadId: 10,
      });
      // Older createdAt, newer updatedAt — must still be picked.
      prisma.document.findMany.mockResolvedValue([
        {
          id: 3,
          documentType: 'BOL',
          entityType: 'Load',
          entityId: 10,
          status: 'CONFIRMED',
          createdAt: new Date('2026-03-01'),
          updatedAt: new Date('2026-03-15'),
        },
        {
          id: 2,
          documentType: 'BOL',
          entityType: 'Load',
          entityId: 10,
          status: 'CONFIRMED',
          createdAt: new Date('2026-03-12'),
          updatedAt: new Date('2026-03-12'),
        },
        {
          id: 1,
          documentType: 'RATE_CON',
          entityType: 'Load',
          entityId: 10,
          status: 'CONFIRMED',
          createdAt: new Date('2026-03-08'),
          updatedAt: new Date('2026-03-08'),
        },
      ]);

      const result = await service.getDocumentList(tenantId, 'inv-001');

      // BOL id=3 has the newest updatedAt; service must pick it.
      expect(result.documents).toHaveLength(2);
      const bol = result.documents.find((d) => d.documentType === 'BOL');
      expect(bol?.id).toBe(3);
      expect(result.missing).toEqual(['POD']);
    });

    it('should return all types as missing when no documents exist', async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        id: 1,
        invoiceNumber: 'inv-001',
        loadId: 10,
      });
      prisma.document.findMany.mockResolvedValue([]);

      const result = await service.getDocumentList(tenantId, 'inv-001');

      expect(result.documents).toHaveLength(0);
      expect(result.missing).toEqual(['RATE_CON', 'BOL', 'POD']);
    });

    it('should return empty missing array when all document types present', async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        id: 1,
        invoiceNumber: 'inv-001',
        loadId: 10,
      });
      prisma.document.findMany.mockResolvedValue([
        {
          id: 1,
          documentType: 'RATE_CON',
          createdAt: new Date(),
        },
        { id: 2, documentType: 'BOL', createdAt: new Date() },
        { id: 3, documentType: 'POD', createdAt: new Date() },
      ]);

      const result = await service.getDocumentList(tenantId, 'inv-001');

      expect(result.documents).toHaveLength(3);
      expect(result.missing).toEqual([]);
    });
  });

  // ─── validateBundleReady ───────────────────────────────────

  describe('validateBundleReady', () => {
    it('returns ready=true when all three required source docs (RATE_CON, BOL, POD) are present with s3Key', async () => {
      prisma.invoice.findFirst.mockResolvedValue({ id: 1, invoiceNumber: 'inv-001', loadId: 10 });
      prisma.document.findMany.mockResolvedValue([
        { documentType: 'RATE_CON', s3Key: 'k1', updatedAt: new Date('2026-04-25'), createdAt: new Date() },
        { documentType: 'BOL', s3Key: 'k2', updatedAt: new Date('2026-04-24'), createdAt: new Date() },
        { documentType: 'POD', s3Key: 'k3', updatedAt: new Date('2026-04-23'), createdAt: new Date() },
      ]);

      const result = await service.validateBundleReady(tenantId, 'inv-001');

      expect(result.ready).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('returns ready=false and lists missing types when POD is absent', async () => {
      prisma.invoice.findFirst.mockResolvedValue({ id: 1, invoiceNumber: 'inv-001', loadId: 10 });
      prisma.document.findMany.mockResolvedValue([
        { documentType: 'RATE_CON', s3Key: 'k1', updatedAt: new Date(), createdAt: new Date() },
        { documentType: 'BOL', s3Key: 'k2', updatedAt: new Date(), createdAt: new Date() },
      ]);

      const result = await service.validateBundleReady(tenantId, 'inv-001');

      expect(result.ready).toBe(false);
      expect(result.missing).toEqual(['POD']);
    });

    it('throws NotFoundException when invoice does not exist', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.validateBundleReady(tenantId, 'missing')).rejects.toThrow(NotFoundException);
    });

    it('treats a Document row missing s3Key as missing', async () => {
      prisma.invoice.findFirst.mockResolvedValue({ id: 1, invoiceNumber: 'inv-001', loadId: 10 });
      prisma.document.findMany.mockResolvedValue([
        { documentType: 'RATE_CON', s3Key: 'k1', updatedAt: new Date(), createdAt: new Date() },
        { documentType: 'BOL', s3Key: null, updatedAt: new Date(), createdAt: new Date() },
        { documentType: 'POD', s3Key: 'k3', updatedAt: new Date(), createdAt: new Date() },
      ]);

      const result = await service.validateBundleReady(tenantId, 'inv-001');

      expect(result.ready).toBe(false);
      expect(result.missing).toEqual(['BOL']);
    });
  });

  // ─── generateBundle (merge mode) ────────────────────────────

  describe('generateBundle', () => {
    const buildSinglePagePdf = async (label: string): Promise<Buffer> => {
      const { PDFDocument } = await import('pdf-lib');
      const doc = await PDFDocument.create();
      doc.addPage([100, 100]);
      doc.setTitle(label);
      return Buffer.from(await doc.save());
    };

    it('merges invoice + rate-con + BOL + POD in that order and uploads to S3', async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        id: 1,
        invoiceNumber: 'INV-2026-0001',
        loadId: 10,
      });
      prisma.document.findMany.mockResolvedValue([
        {
          documentType: 'POD',
          s3Key: 'pod-key',
          updatedAt: new Date('2026-04-25'),
          createdAt: new Date('2026-04-25'),
        },
        {
          documentType: 'BOL',
          s3Key: 'bol-key',
          updatedAt: new Date('2026-04-24'),
          createdAt: new Date('2026-04-24'),
        },
        {
          documentType: 'RATE_CON',
          s3Key: 'rc-key',
          updatedAt: new Date('2026-04-20'),
          createdAt: new Date('2026-04-20'),
        },
      ]);

      const invoicePdf = await buildSinglePagePdf('invoice');
      const rcPdf = await buildSinglePagePdf('ratecon');
      const bolPdf = await buildSinglePagePdf('bol');
      const podPdf = await buildSinglePagePdf('pod');

      mockInvoicePdfService.generatePdf.mockResolvedValue(invoicePdf);
      mockFileStorage.downloadBuffer.mockImplementation(async (key: string) => {
        if (key === 'rc-key') return rcPdf;
        if (key === 'bol-key') return bolPdf;
        if (key === 'pod-key') return podPdf;
        throw new Error(`unexpected key ${key}`);
      });
      mockFileStorage.uploadBuffer.mockResolvedValue(undefined);

      const fixedNow = new Date('2026-04-28T12:00:00Z').getTime();
      const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(fixedNow);

      const result = await service.generateBundle(tenantId, 'inv-001');

      expect(mockInvoicePdfService.generatePdf).toHaveBeenCalledWith(tenantId, 'inv-001');
      expect(mockFileStorage.downloadBuffer).toHaveBeenNthCalledWith(1, 'rc-key');
      expect(mockFileStorage.downloadBuffer).toHaveBeenNthCalledWith(2, 'bol-key');
      expect(mockFileStorage.downloadBuffer).toHaveBeenNthCalledWith(3, 'pod-key');
      expect(mockFileStorage.uploadBuffer).toHaveBeenCalledWith(
        `tenants/${tenantId}/invoices/inv-001/bundle-${fixedNow}.pdf`,
        expect.any(Buffer),
        'application/pdf',
      );
      expect(result.bundleS3Key).toBe(`tenants/${tenantId}/invoices/inv-001/bundle-${fixedNow}.pdf`);
      expect(result.fileName).toBe('INV-2026-0001-bundle.pdf');
      expect(result.bundleSizeBytes).toBeGreaterThan(0);
      expect(result.missingDocs).toEqual([]);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      const { PDFDocument } = await import('pdf-lib');
      const merged = await PDFDocument.load(result.buffer);
      expect(merged.getPageCount()).toBe(4);

      dateNowSpy.mockRestore();
    });

    it('throws BadRequestException with the doc name when a source PDF is corrupt', async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        id: 1,
        invoiceNumber: 'INV-2026-0001',
        loadId: 10,
      });
      prisma.document.findMany.mockResolvedValue([
        { documentType: 'RATE_CON', s3Key: 'rc-key', updatedAt: new Date(), createdAt: new Date() },
        { documentType: 'BOL', s3Key: 'bol-key', updatedAt: new Date(), createdAt: new Date() },
        { documentType: 'POD', s3Key: 'pod-key', updatedAt: new Date(), createdAt: new Date() },
      ]);

      const goodPdf = await buildSinglePagePdf('ok');
      mockInvoicePdfService.generatePdf.mockResolvedValue(goodPdf);
      mockFileStorage.downloadBuffer.mockImplementation(async (key: string) => {
        if (key === 'bol-key') return Buffer.from('not-a-pdf-at-all');
        return goodPdf;
      });

      const error: BadRequestException = await service.generateBundle(tenantId, 'inv-001').catch((e) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error.getResponse() as { message: string }).message).toContain('Bill of Lading');
    });

    it('throws BadRequestException naming the doc when an S3 source is missing (404)', async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        id: 1,
        invoiceNumber: 'INV-2026-0001',
        loadId: 10,
      });
      prisma.document.findMany.mockResolvedValue([
        { documentType: 'RATE_CON', s3Key: 'rc-key', updatedAt: new Date(), createdAt: new Date() },
        { documentType: 'BOL', s3Key: 'bol-key', updatedAt: new Date(), createdAt: new Date() },
        { documentType: 'POD', s3Key: 'pod-key', updatedAt: new Date(), createdAt: new Date() },
      ]);

      const goodPdf = await buildSinglePagePdf('ok');
      mockInvoicePdfService.generatePdf.mockResolvedValue(goodPdf);
      mockFileStorage.downloadBuffer.mockImplementation(async (key: string) => {
        if (key === 'pod-key') throw new NotFoundException(`S3 object not found: ${key}`);
        return goodPdf;
      });

      const error: BadRequestException = await service.generateBundle(tenantId, 'inv-001').catch((e) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error.getResponse() as { message: string }).message).toContain('Proof of Delivery');
    });

    it('skips missing source docs and reports them in missingDocs (rather than throwing) when validateBundleReady is false', async () => {
      // generateBundle is also used by the preview endpoint, which allows
      // partial bundles. Submit-time enforcement is FactoringService's job.
      prisma.invoice.findFirst.mockResolvedValue({
        id: 1,
        invoiceNumber: 'INV-2026-0001',
        loadId: 10,
      });
      prisma.document.findMany.mockResolvedValue([
        { documentType: 'RATE_CON', s3Key: 'rc-key', updatedAt: new Date(), createdAt: new Date() },
      ]);

      const invoicePdf = await buildSinglePagePdf('invoice');
      const rcPdf = await buildSinglePagePdf('rc');
      mockInvoicePdfService.generatePdf.mockResolvedValue(invoicePdf);
      mockFileStorage.downloadBuffer.mockImplementation(async (key: string) =>
        key === 'rc-key' ? rcPdf : Buffer.alloc(0),
      );

      const result = await service.generateBundle(tenantId, 'inv-001');

      expect(result.missingDocs.sort()).toEqual(['BOL', 'POD']);
      expect(mockFileStorage.uploadBuffer).toHaveBeenCalledTimes(1); // still uploads partial bundle
      const { PDFDocument } = await import('pdf-lib');
      const merged = await PDFDocument.load(result.buffer);
      expect(merged.getPageCount()).toBe(2); // invoice + RATE_CON
    });

    it('throws NotFoundException when invoice does not exist', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.generateBundle(tenantId, 'not-found')).rejects.toThrow(NotFoundException);
    });

    it('propagates PDF generation errors from InvoicePdfService', async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        id: 1,
        invoiceNumber: 'INV-2026-0001',
        loadId: 10,
      });
      prisma.document.findMany.mockResolvedValue([]);
      mockInvoicePdfService.generatePdf.mockRejectedValue(new Error('PDF engine failed'));

      await expect(service.generateBundle(tenantId, 'inv-001')).rejects.toThrow('PDF engine failed');
    });

    // ─── Format-aware (cleanup phase) ────────────────────────────────

    /**
     * Minimal ZIP reader that walks the central directory at the END of the
     * file (rather than the local file headers, which may have zeroed sizes
     * when archiver streams with a data descriptor). Enough to assert entry
     * names + count without pulling a 3rd-party dep into tests.
     */
    async function readZipEntries(buf: Buffer): Promise<{ name: string; bytes: Buffer }[]> {
      const zlib = await import('node:zlib');

      // 1. Find End-of-Central-Directory record (signature 0x06054b50). It's
      //    near the end of the buffer, max 22 + 65535 bytes from the tail.
      let eocdOff = -1;
      const minOff = Math.max(0, buf.length - (22 + 0xffff));
      for (let i = buf.length - 22; i >= minOff; i--) {
        if (buf.readUInt32LE(i) === 0x06054b50) {
          eocdOff = i;
          break;
        }
      }
      if (eocdOff === -1) throw new Error('EOCD not found — invalid ZIP');

      const totalEntries = buf.readUInt16LE(eocdOff + 10);
      const cdOffset = buf.readUInt32LE(eocdOff + 16);

      // 2. Walk central directory entries (signature 0x02014b50).
      const entries: { name: string; bytes: Buffer }[] = [];
      let off = cdOffset;
      for (let i = 0; i < totalEntries; i++) {
        if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('CD signature mismatch');
        const compressionMethod = buf.readUInt16LE(off + 10);
        const compressedSize = buf.readUInt32LE(off + 20);
        const uncompressedSize = buf.readUInt32LE(off + 24);
        const fileNameLength = buf.readUInt16LE(off + 28);
        const extraLength = buf.readUInt16LE(off + 30);
        const commentLength = buf.readUInt16LE(off + 32);
        const localHeaderOff = buf.readUInt32LE(off + 42);
        const name = buf.subarray(off + 46, off + 46 + fileNameLength).toString('utf8');

        // Local header: skip its variable-length sections to find file data.
        const lhFileNameLen = buf.readUInt16LE(localHeaderOff + 26);
        const lhExtraLen = buf.readUInt16LE(localHeaderOff + 28);
        const dataStart = localHeaderOff + 30 + lhFileNameLen + lhExtraLen;

        const raw = buf.subarray(dataStart, dataStart + compressedSize);
        const bytes = compressionMethod === 0 ? raw.subarray(0, uncompressedSize) : zlib.inflateRawSync(raw);
        entries.push({ name, bytes });

        off += 46 + fileNameLength + extraLength + commentLength;
      }
      return entries;
    }

    it('ZIP path: produces a ZIP with 4 entries when tenant.bundleFormat=ZIP', async () => {
      prisma.tenant.findUnique.mockResolvedValue({ bundleFormat: 'ZIP' });
      prisma.invoice.findFirst.mockResolvedValue({
        id: 1,
        invoiceNumber: 'INV-2026-0001',
        loadId: 10,
      });
      const goodPdf = await buildSinglePagePdf('inv');
      const rcPdf = await buildSinglePagePdf('rc');
      const bolPdf = await buildSinglePagePdf('bol');
      const podPdf = await buildSinglePagePdf('pod');
      mockInvoicePdfService.generatePdf.mockResolvedValue(goodPdf);
      prisma.document.findMany.mockResolvedValue([
        { documentType: 'RATE_CON', s3Key: 'rc-key', updatedAt: new Date() },
        { documentType: 'BOL', s3Key: 'bol-key', updatedAt: new Date() },
        { documentType: 'POD', s3Key: 'pod-key', updatedAt: new Date() },
      ]);
      mockFileStorage.downloadBuffer.mockImplementation(async (key: string) => {
        if (key === 'rc-key') return rcPdf;
        if (key === 'bol-key') return bolPdf;
        if (key === 'pod-key') return podPdf;
        throw new Error(`unexpected key ${key}`);
      });
      mockFileStorage.uploadBuffer.mockResolvedValue(undefined);

      const result = await service.generateBundle(tenantId, 'inv-001');

      expect(result.fileName).toBe('INV-2026-0001-bundle.zip');
      expect(result.bundleS3Key).toMatch(/^tenants\/1\/invoices\/inv-001\/bundle-\d+\.zip$/);
      expect(mockFileStorage.uploadBuffer).toHaveBeenCalledWith(
        expect.stringMatching(/\.zip$/),
        expect.any(Buffer),
        'application/zip',
      );

      const entries = await readZipEntries(result.buffer);
      const names = entries.map((e) => e.name).sort();
      expect(names).toEqual(['BOL.pdf', 'POD.pdf', 'invoice.pdf', 'rate-con.pdf']);
      expect(entries).toHaveLength(4);
    });

    it('MERGED_PDF path: preserves Phase 2 behavior when tenant.bundleFormat=MERGED_PDF', async () => {
      prisma.tenant.findUnique.mockResolvedValue({ bundleFormat: 'MERGED_PDF' });
      prisma.invoice.findFirst.mockResolvedValue({
        id: 2,
        invoiceNumber: 'INV-2026-0002',
        loadId: 11,
      });
      const goodPdf = await buildSinglePagePdf('m');
      mockInvoicePdfService.generatePdf.mockResolvedValue(goodPdf);
      prisma.document.findMany.mockResolvedValue([
        { documentType: 'RATE_CON', s3Key: 'rc', updatedAt: new Date() },
        { documentType: 'BOL', s3Key: 'bol', updatedAt: new Date() },
        { documentType: 'POD', s3Key: 'pod', updatedAt: new Date() },
      ]);
      mockFileStorage.downloadBuffer.mockResolvedValue(goodPdf);
      mockFileStorage.uploadBuffer.mockResolvedValue(undefined);

      const result = await service.generateBundle(tenantId, 'inv-002');

      expect(result.fileName).toBe('INV-2026-0002-bundle.pdf');
      expect(result.bundleS3Key).toMatch(/\.pdf$/);
      expect(mockFileStorage.uploadBuffer).toHaveBeenCalledWith(
        expect.stringMatching(/\.pdf$/),
        expect.any(Buffer),
        'application/pdf',
      );
    });

    it('defaults to ZIP when tenant row returns null (defensive)', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);
      prisma.invoice.findFirst.mockResolvedValue({
        id: 3,
        invoiceNumber: 'INV-2026-0003',
        loadId: 12,
      });
      const goodPdf = await buildSinglePagePdf('def');
      mockInvoicePdfService.generatePdf.mockResolvedValue(goodPdf);
      prisma.document.findMany.mockResolvedValue([
        { documentType: 'RATE_CON', s3Key: 'rc', updatedAt: new Date() },
        { documentType: 'BOL', s3Key: 'bol', updatedAt: new Date() },
        { documentType: 'POD', s3Key: 'pod', updatedAt: new Date() },
      ]);
      mockFileStorage.downloadBuffer.mockResolvedValue(goodPdf);
      mockFileStorage.uploadBuffer.mockResolvedValue(undefined);

      const result = await service.generateBundle(tenantId, 'inv-003');

      expect(result.fileName).toMatch(/\.zip$/);
      expect(mockFileStorage.uploadBuffer).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Buffer),
        'application/zip',
      );
    });
  });
});
