/**
 * Mock BullMQ queue for unit tests.
 */

export function createMockQueue() {
  return {
    add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
    addBulk: jest.fn().mockResolvedValue([]),
    getJob: jest.fn().mockResolvedValue(null),
    getJobs: jest.fn().mockResolvedValue([]),
    getRepeatableJobs: jest.fn().mockResolvedValue([]),
    removeRepeatableByKey: jest.fn().mockResolvedValue(undefined),
    obliterate: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  };
}
