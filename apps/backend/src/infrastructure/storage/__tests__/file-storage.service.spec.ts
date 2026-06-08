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
