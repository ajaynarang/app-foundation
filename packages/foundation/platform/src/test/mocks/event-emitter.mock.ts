/**
 * Mock event emitter for unit tests.
 */

export function createMockEventEmitter() {
  return {
    emit: jest.fn().mockReturnValue(true),
    emitAsync: jest.fn().mockResolvedValue(undefined),
    on: jest.fn().mockReturnThis(),
    once: jest.fn().mockReturnThis(),
    removeListener: jest.fn().mockReturnThis(),
  };
}

/**
 * Mock DomainEventService for unit tests.
 */
export function createMockDomainEventService() {
  return {
    emit: jest.fn().mockResolvedValue(undefined),
  };
}
