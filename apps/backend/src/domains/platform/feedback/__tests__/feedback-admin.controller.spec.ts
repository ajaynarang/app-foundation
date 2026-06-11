// Mock ESM dependencies pulled in via feedback.service → ai-provider → langfuse
jest.mock('langfuse-core', () => ({}));
jest.mock('langfuse', () => ({ Langfuse: jest.fn() }));
jest.mock('ai', () => ({ generateText: jest.fn() }));
jest.mock('../../../ai/infrastructure/providers/ai-provider', () => ({
  ai: jest.fn(),
}));

import { FeedbackAdminController } from '../feedback-admin.controller';

describe('FeedbackAdminController', () => {
  let controller: FeedbackAdminController;
  let service: any;

  beforeEach(() => {
    service = {
      listAll: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      getStats: jest.fn().mockResolvedValue({ total: 0 }),
      getTenants: jest.fn().mockResolvedValue([]),
      bulkCategorize: jest.fn().mockResolvedValue({ categorized: 0 }),
      getDetail: jest.fn().mockResolvedValue({ id: 1 }),
      resolve: jest.fn().mockResolvedValue({ id: 1, status: 'resolved' }),
      updateStatus: jest.fn().mockResolvedValue({ id: 1, status: 'in_progress' }),
      categorizeWithAi: jest.fn().mockResolvedValue({ id: 1, category: 'bug' }),
      updateCategory: jest.fn().mockResolvedValue({ id: 1, category: 'feature' }),
    };
    controller = new FeedbackAdminController(service);
  });

  it('listAll delegates to service', async () => {
    const query = { status: 'open', page: 1 };
    await controller.listAll(query as any);
    expect(service.listAll).toHaveBeenCalledWith(query);
  });

  it('getStats delegates to service', async () => {
    await controller.getStats();
    expect(service.getStats).toHaveBeenCalled();
  });

  it('getTenants delegates to service', async () => {
    await controller.getTenants();
    expect(service.getTenants).toHaveBeenCalled();
  });

  it('bulkCategorize delegates to service', async () => {
    await controller.bulkCategorize();
    expect(service.bulkCategorize).toHaveBeenCalled();
  });

  it('getDetail delegates to service', async () => {
    await controller.getDetail(1);
    expect(service.getDetail).toHaveBeenCalledWith(1);
  });

  it('resolve delegates to service', async () => {
    const dto = { note: 'Fixed' };
    await controller.resolve(1, dto, { dbId: 5 });
    expect(service.resolve).toHaveBeenCalledWith(1, 5, dto);
  });

  it('updateStatus delegates to service', async () => {
    const dto = { status: 'in_progress' };
    await controller.updateStatus(1, dto as any);
    expect(service.updateStatus).toHaveBeenCalledWith(1, dto);
  });

  it('categorize delegates to service', async () => {
    await controller.categorize(1);
    expect(service.categorizeWithAi).toHaveBeenCalledWith(1);
  });

  it('updateCategory delegates to service', async () => {
    const dto = { category: 'feature' };
    await controller.updateCategory(1, dto as any);
    expect(service.updateCategory).toHaveBeenCalledWith(1, dto);
  });
});
