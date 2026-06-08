// Mock ESM dependencies pulled in via feedback.service → ai-provider → langfuse
jest.mock('langfuse-core', () => ({}));
jest.mock('langfuse', () => ({ Langfuse: jest.fn() }));
jest.mock('ai', () => ({ generateText: jest.fn() }));
jest.mock('../../../ai/infrastructure/providers/ai-provider', () => ({
  ai: jest.fn(),
}));

import { FeedbackController } from '../feedback.controller';

describe('FeedbackController', () => {
  let controller: FeedbackController;
  let service: any;

  const mockUser = { dbId: 10, tenantDbId: 42 };

  beforeEach(() => {
    service = {
      create: jest.fn().mockResolvedValue({ id: 1, message: 'Great!' }),
      listOwn: jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]),
    };
    controller = new FeedbackController(service);
  });

  describe('create', () => {
    it('should delegate to service with user dbId, tenantDbId, and dto', async () => {
      const dto = { sentiment: 5, message: 'Great product!' };
      const result = await controller.create(mockUser, dto as any);

      expect(service.create).toHaveBeenCalledWith(10, 42, dto);
      expect(result).toEqual({ id: 1, message: 'Great!' });
    });
  });

  describe('listOwn', () => {
    it('should delegate to service with user dbId and tenantDbId', async () => {
      const result = await controller.listOwn(mockUser);

      expect(service.listOwn).toHaveBeenCalledWith(10, 42);
      expect(result).toHaveLength(2);
    });
  });
});
