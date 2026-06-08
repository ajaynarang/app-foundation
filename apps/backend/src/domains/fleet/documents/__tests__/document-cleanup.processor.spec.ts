import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { DocumentCleanupJobHandler } from '../document-cleanup.processor';
import { DocumentsService } from '../services/documents.service';
import { BULK_OPS_JOB_NAMES, QUEUE_NAMES } from '../../../../infrastructure/queue/queue.constants';

describe('DocumentCleanupJobHandler', () => {
  let processor: DocumentCleanupJobHandler;
  let documentsService: { cleanupExpiredUploads: jest.Mock };

  beforeEach(async () => {
    documentsService = { cleanupExpiredUploads: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentCleanupJobHandler,
        { provide: DocumentsService, useValue: documentsService },
        { provide: getQueueToken(QUEUE_NAMES.BULK_OPS), useValue: {} },
      ],
    }).compile();

    processor = module.get<DocumentCleanupJobHandler>(DocumentCleanupJobHandler);
  });

  it('should clean up expired uploads on correct job name', async () => {
    documentsService.cleanupExpiredUploads.mockResolvedValue(5);

    await processor.run({
      name: BULK_OPS_JOB_NAMES.UPLOADS_CLEANUP,
    } as any);

    expect(documentsService.cleanupExpiredUploads).toHaveBeenCalled();
  });

  it('should rethrow errors from cleanup', async () => {
    documentsService.cleanupExpiredUploads.mockRejectedValue(new Error('DB error'));

    await expect(processor.run({ name: BULK_OPS_JOB_NAMES.UPLOADS_CLEANUP } as any)).rejects.toThrow('DB error');
  });
});
