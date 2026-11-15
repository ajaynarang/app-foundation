import { readFileSync } from 'fs';
import { join } from 'path';
// Mock ESM dependencies pulled in via feedback.service → langfuse
jest.mock('langfuse-core', () => ({}));
jest.mock('langfuse', () => ({ Langfuse: jest.fn() }));
jest.mock('ai', () => ({ generateText: jest.fn() }));

import { FeedbackAdminController } from '../feedback-admin.controller';

const FEEDBACK_ID = '0190f1c2-0000-7000-8000-000000000001';

describe('FeedbackAdminController', () => {
  it('addresses a feedback row by its public id: every :id is parsed as a uuid, never an Int', () => {
    const source = readFileSync(join(__dirname, '../feedback-admin.controller.ts'), 'utf8');
    expect(source).not.toMatch(/ParseIntPipe/);
    expect(source.match(/@Param\('id', ParseUUIDPipe\)/g)).toHaveLength(5);
  });

  let controller: FeedbackAdminController;
  let service: any;

  beforeEach(() => {
    service = {
      listAll: jest.fn().mockResolvedValue({ items: [], nextCursor: null, total: 0 }),
      getStats: jest.fn().mockResolvedValue({ total: 0 }),
      getTenants: jest.fn().mockResolvedValue({ items: [], nextCursor: null, total: 0 }),
      bulkCategorize: jest.fn().mockResolvedValue({ categorized: 0 }),
      getDetail: jest.fn().mockResolvedValue({ feedbackId: FEEDBACK_ID }),
      resolve: jest.fn().mockResolvedValue({ feedbackId: FEEDBACK_ID, status: 'resolved' }),
      updateStatus: jest.fn().mockResolvedValue({ feedbackId: FEEDBACK_ID, status: 'in_progress' }),
      categorizeWithAi: jest.fn().mockResolvedValue({ feedbackId: FEEDBACK_ID, category: 'bug' }),
      updateCategory: jest.fn().mockResolvedValue({ feedbackId: FEEDBACK_ID, category: 'feature' }),
    };
    controller = new FeedbackAdminController(service);
  });

  it('listAll delegates to service', async () => {
    const query = { status: 'NEW', cursor: 'abc', limit: 10 };
    await controller.listAll(query as any);
    expect(service.listAll).toHaveBeenCalledWith(query);
  });

  it('getStats delegates to service', async () => {
    await controller.getStats();
    expect(service.getStats).toHaveBeenCalled();
  });

  it('getTenants delegates to service', async () => {
    const page = await controller.getTenants({ q: 'acme', limit: 10 });
    expect(service.getTenants).toHaveBeenCalledWith({ q: 'acme', limit: 10 });
    expect(page).toEqual({ items: [], nextCursor: null, total: 0 });
  });

  it('bulkCategorize delegates to service', async () => {
    await controller.bulkCategorize();
    expect(service.bulkCategorize).toHaveBeenCalled();
  });

  it('getDetail delegates to service', async () => {
    await controller.getDetail(FEEDBACK_ID);
    expect(service.getDetail).toHaveBeenCalledWith(FEEDBACK_ID);
  });

  it('resolve delegates to service', async () => {
    const dto = { note: 'Fixed' };
    await controller.resolve(FEEDBACK_ID, dto, { dbId: 5 });
    expect(service.resolve).toHaveBeenCalledWith(FEEDBACK_ID, 5, dto);
  });

  it('updateStatus delegates to service', async () => {
    const dto = { status: 'in_progress' };
    await controller.updateStatus(FEEDBACK_ID, dto as any);
    expect(service.updateStatus).toHaveBeenCalledWith(FEEDBACK_ID, dto);
  });

  it('categorize delegates to service', async () => {
    await controller.categorize(FEEDBACK_ID);
    expect(service.categorizeWithAi).toHaveBeenCalledWith(FEEDBACK_ID);
  });

  it('updateCategory delegates to service', async () => {
    const dto = { category: 'feature' };
    await controller.updateCategory(FEEDBACK_ID, dto as any);
    expect(service.updateCategory).toHaveBeenCalledWith(FEEDBACK_ID, dto);
  });
});
