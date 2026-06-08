import { BadRequestException, ConflictException } from '@nestjs/common';
import { RateconController } from '../ratecon.controller';

describe('RateconController', () => {
  let controller: RateconController;
  let documentsQueue: any;
  let jobService: any;
  let prisma: any;
  let fileStorage: any;
  let configService: any;

  const user = { tenantDbId: 1, userId: 'user_1', dbId: 10 };
  const mockFile = {
    buffer: Buffer.from('fake-pdf-content'),
    originalname: 'ratecon.pdf',
    mimetype: 'application/pdf',
    size: 5000,
  } as Express.Multer.File;

  beforeEach(() => {
    documentsQueue = {
      add: jest.fn().mockResolvedValue({}),
    };

    jobService = {
      createJob: jest.fn().mockResolvedValue({ id: 'job_1' }),
      findActiveLoadByHash: jest.fn().mockResolvedValue(null),
    };

    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 10 }) },
    };

    fileStorage = {
      generateRateconUploadKey: jest.fn().mockReturnValue('uploads/ratecon.pdf'),
      uploadBuffer: jest.fn().mockResolvedValue(undefined),
    };

    configService = {
      get: jest.fn().mockReturnValue(null),
    };

    controller = new RateconController(documentsQueue, jobService, prisma, fileStorage, configService);
  });

  describe('parseRatecon', () => {
    it('should throw if no file provided', async () => {
      await expect(controller.parseRatecon(null as any, user)).rejects.toThrow(BadRequestException);
    });

    it('should throw for non-PDF files', async () => {
      const badFile = {
        ...mockFile,
        mimetype: 'text/plain',
      } as Express.Multer.File;
      await expect(controller.parseRatecon(badFile, user)).rejects.toThrow(BadRequestException);
    });

    it('should throw for oversized files', async () => {
      const bigFile = {
        ...mockFile,
        size: 20 * 1024 * 1024,
      } as Express.Multer.File;
      await expect(controller.parseRatecon(bigFile, user)).rejects.toThrow(BadRequestException);
    });

    it('should queue a ratecon parse job', async () => {
      const result = await controller.parseRatecon(mockFile, user);
      expect(result.jobId).toBe('job_1');
      expect(result.status).toBe('QUEUED');
      expect(fileStorage.uploadBuffer).toHaveBeenCalled();
      expect(documentsQueue.add).toHaveBeenCalledWith('ratecon', expect.any(Object), expect.any(Object));
    });

    it('should throw ConflictException for duplicate file', async () => {
      jobService.findActiveLoadByHash.mockResolvedValue({
        loadNumber: 'L-1045',
      });
      await expect(controller.parseRatecon(mockFile, user)).rejects.toThrow(ConflictException);
    });

    it('should bypass duplicate check with force=true', async () => {
      jobService.findActiveLoadByHash.mockResolvedValue({
        loadNumber: 'L-1045',
      });
      const result = await controller.parseRatecon(mockFile, user, 'true');
      expect(result.status).toBe('QUEUED');
    });
  });

  describe('parseRateconBulk', () => {
    it('should throw if no files', async () => {
      await expect(controller.parseRateconBulk([], user)).rejects.toThrow(BadRequestException);
    });

    it('should process multiple files', async () => {
      const result = await controller.parseRateconBulk([mockFile, mockFile], user);
      expect(result).toHaveLength(2);
    });
  });

  describe('getParserConfig', () => {
    it('should return parser config', () => {
      const result = controller.getParserConfig();
      expect(result.defaultStrategy).toBe('text-first');
      expect(result.timeoutMs).toBeDefined();
    });
  });
});
