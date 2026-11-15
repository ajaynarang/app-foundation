import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FileStorageService } from '../file-storage.service';

describe('FileStorageService', () => {
  let service: FileStorageService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileStorageService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                's3.bucket': 'test-bucket',
                's3.region': 'us-east-1',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<FileStorageService>(FileStorageService);
  });

  describe('generateS3Key', () => {
    it('should generate a key with correct pattern', () => {
      const key = service.generateS3Key({
        tenantId: 1,
        entityType: 'load',
        entityId: 42,
        fileName: 'Rate Confirmation.pdf',
      });

      expect(key).toMatch(/^tenants\/1\/documents\/load\/42\/[a-f0-9-]+_Rate-Confirmation\.pdf$/);
    });

    it('should sanitize special characters in filename', () => {
      const key = service.generateS3Key({
        tenantId: 1,
        entityType: 'load',
        entityId: 42,
        fileName: 'file (copy) [final]<>.pdf',
      });

      expect(key).not.toContain('(');
      expect(key).not.toContain('<');
      expect(key).toContain('.pdf');
    });
  });

  /**
   * A presigned download must never render in the browser: a stored HTML or
   * SVG file opened inline would run as a page on the bucket's origin. The URL
   * is signed for real here (offline, with throwaway credentials) and the
   * response overrides are read back from it.
   */
  describe('generatePresignedDownloadUrl', () => {
    const ORIGINAL_ENV = process.env;

    beforeAll(() => {
      process.env = { ...ORIGINAL_ENV, AWS_ACCESS_KEY_ID: 'AKIATESTTESTTESTTEST', AWS_SECRET_ACCESS_KEY: 'test-only' };
    });

    afterAll(() => {
      process.env = ORIGINAL_ENV;
    });

    const paramsOf = async (...args: Parameters<FileStorageService['generatePresignedDownloadUrl']>) =>
      new URL(await service.generatePresignedDownloadUrl(...args)).searchParams;

    it('forces a download: attachment disposition and a generic content type', async () => {
      const params = await paramsOf('tenants/1/documents/note/42/abc_page.html');

      expect(params.get('response-content-disposition')).toBe('attachment; filename="download"');
      expect(params.get('response-content-type')).toBe('application/octet-stream');
    });

    it('signs the overrides, so a caller cannot strip them from the URL', async () => {
      const params = await paramsOf('tenants/1/documents/note/42/abc_page.html');

      // The response-* parameters are part of the canonical query string that SigV4 signs.
      expect(params.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
      expect([...params.keys()]).toEqual(
        expect.arrayContaining(['response-content-disposition', 'response-content-type', 'X-Amz-Signature']),
      );
    });

    it('names the saved file when a file name is given', async () => {
      const params = await paramsOf('k', 3600, 'Quarterly report.pdf');

      expect(params.get('response-content-disposition')).toBe('attachment; filename="Quarterly-report.pdf"');
    });

    it.each([
      ['a quote that would end the filename', 'a".html"; x="y.pdf'],
      ['a header line break', 'a\r\nSet-Cookie: x=1.pdf'],
      ['a backslash escape', 'a\\".pdf'],
      ['non-ASCII characters', 'résumé ✓.pdf'],
    ])('keeps the disposition well-formed for %s', async (_label, fileName) => {
      const disposition = (await paramsOf('k', 3600, fileName)).get('response-content-disposition');

      expect(disposition).toMatch(/^attachment; filename="[\x20-\x7e]*"$/);
      const inner = disposition.slice('attachment; filename="'.length, -1);
      expect(inner).not.toMatch(/["\\;\r\n]/);
    });

    it('still honours the expiry', async () => {
      expect((await paramsOf('k', 120)).get('X-Amz-Expires')).toBe('120');
    });
  });

  describe('sanitizeFileName', () => {
    it('should replace spaces with hyphens', () => {
      expect(service.sanitizeFileName('my file name.pdf')).toBe('my-file-name.pdf');
    });

    it('should remove special characters', () => {
      expect(service.sanitizeFileName('file<>:"|?*.pdf')).toBe('file.pdf');
    });

    it('should truncate long names', () => {
      const longName = 'a'.repeat(250) + '.pdf';
      const result = service.sanitizeFileName(longName);
      expect(result.length).toBeLessThanOrEqual(200);
      expect(result).toContain('.pdf');
    });
  });
});
