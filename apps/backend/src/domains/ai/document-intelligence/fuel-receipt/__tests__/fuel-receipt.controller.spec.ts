// Mock ESM dependencies pulled in via fuel-receipt-parser → structured-output → mastra
jest.mock('@mastra/pg', () => ({ PostgresStore: jest.fn() }));
jest.mock('@mastra/memory', () => ({ Memory: jest.fn() }));
jest.mock('@mastra/core', () => ({ Mastra: jest.fn() }));
jest.mock('@mastra/core/agent', () => ({ Agent: jest.fn() }));
jest.mock('@mastra/observability', () => ({ Observability: jest.fn() }));
jest.mock('@mastra/langfuse', () => ({ LangfuseExporter: jest.fn() }));
jest.mock('langfuse-core', () => ({}));
jest.mock('langfuse', () => ({ Langfuse: jest.fn() }));

import { BadRequestException } from '@nestjs/common';
import { FuelReceiptController } from '../fuel-receipt.controller';

describe('FuelReceiptController', () => {
  let controller: FuelReceiptController;
  let fuelReceiptParser: any;

  const mockFile = {
    buffer: Buffer.from('fake-image'),
    originalname: 'receipt.jpg',
    mimetype: 'image/jpeg',
    size: 5000,
  } as Express.Multer.File;

  beforeEach(() => {
    fuelReceiptParser = {
      parse: jest.fn().mockResolvedValue({
        data: {
          vendorName: 'Shell',
          gallons: 50.5,
          totalAmount: 180.75,
          pricePerGallon: 3.58,
          date: '2026-03-15',
          state: 'TX',
          fuelType: null,
        },
        parsing: { strategy: 'vision', model: 'claude-3.5-sonnet' },
      }),
    };

    controller = new FuelReceiptController(fuelReceiptParser);
  });

  describe('scanReceipt', () => {
    it('should throw if no file provided', async () => {
      await expect(controller.scanReceipt(null as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw for unsupported file type', async () => {
      const badFile = {
        ...mockFile,
        mimetype: 'text/plain',
      } as Express.Multer.File;
      await expect(controller.scanReceipt(badFile)).rejects.toThrow(BadRequestException);
    });

    it('should throw for oversized file', async () => {
      const bigFile = {
        ...mockFile,
        size: 20 * 1024 * 1024,
      } as Express.Multer.File;
      await expect(controller.scanReceipt(bigFile)).rejects.toThrow(BadRequestException);
    });

    it('should parse a valid receipt image', async () => {
      const result = await controller.scanReceipt(mockFile);
      expect(fuelReceiptParser.parse).toHaveBeenCalledWith(mockFile.buffer, 'image/jpeg');
      expect(result.extracted.vendorName).toBe('Shell');
      expect(result.fieldsExtracted).toBe(6); // 6 non-null fields
      expect(result.totalFields).toBeDefined();
      expect(result.parsing).toBeDefined();
    });

    it('should accept PDF files', async () => {
      const pdfFile = {
        ...mockFile,
        mimetype: 'application/pdf',
      } as Express.Multer.File;
      await controller.scanReceipt(pdfFile);
      expect(fuelReceiptParser.parse).toHaveBeenCalledWith(pdfFile.buffer, 'application/pdf');
    });

    it('should accept PNG files', async () => {
      const pngFile = {
        ...mockFile,
        mimetype: 'image/png',
      } as Express.Multer.File;
      await controller.scanReceipt(pngFile);
      expect(fuelReceiptParser.parse).toHaveBeenCalled();
    });
  });
});
