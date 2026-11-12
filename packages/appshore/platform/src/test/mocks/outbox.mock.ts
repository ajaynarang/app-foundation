/**
 * Mock OutboxService for unit tests (ADR "Outbox and deadlines").
 *
 * `transaction(fn)` runs `fn(tx, emit)` through the given mock prisma's
 * `$transaction`; events emitted inside it reach `outbox.emit` only once `fn`
 * resolves — so `outbox.emit` reads as "the events that were published", and a
 * transaction that throws publishes nothing, as in the real service. Assert
 * with the same shape as a direct emit:
 * `expect(outbox.emit).toHaveBeenCalledWith(name, tenantId, payload, actor)`.
 */
export function createMockOutbox(prisma: { $transaction: (...args: any[]) => Promise<any> }) {
  const emit = jest.fn().mockResolvedValue(undefined);
  const transaction = jest.fn(async (fn: (tx: unknown, stage: (...args: unknown[]) => Promise<void>) => unknown) => {
    const staged: unknown[][] = [];
    const result = await prisma.$transaction((tx: unknown) =>
      fn(tx, async (...args: unknown[]) => {
        staged.push(args);
      }),
    );
    for (const args of staged) await emit(...args);
    return result;
  });
  return {
    emit,
    transaction,
    stage: jest.fn(async (_tx: unknown, ...args: unknown[]) => ({ args })),
    publishStaged: jest.fn().mockResolvedValue(undefined),
  };
}
