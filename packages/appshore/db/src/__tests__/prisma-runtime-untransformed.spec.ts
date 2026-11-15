import { PrismaClient } from '../index';

/**
 * Jest must run Prisma's generated runtime as shipped, never re-compiled.
 *
 * The runtime is plain JavaScript that lives in the workspace
 * (packages/appshore/db/generated), outside node_modules, so a transform
 * pattern that matches `.js` hands it to ts-jest. TypeScript then lowers the
 * class field of the runtime's `UserFacingError` to an assignment placed
 * before `super()`, because that constructor calls `super()` inside a comma
 * expression. Every database error the driver adapter maps to a Prisma code
 * (P1000 bad credentials, P1003 no such database, P2002 unique violation…)
 * then surfaces as "Must call super constructor in derived class" and the
 * real cause is lost. `transformIgnorePatterns` in the jest config keeps the
 * runtime out of the transform; this spec fails if that entry is removed.
 *
 * No database is needed: a stub driver adapter raises the adapter error.
 */
describe('Prisma runtime under jest', () => {
  function clientWhoseDatabaseIsMissing(): PrismaClient {
    const missingDatabase = Object.assign(new Error('database "nope" does not exist'), {
      name: 'DriverAdapterError',
      cause: { kind: 'DatabaseDoesNotExist', db: 'nope', originalCode: '3D000', originalMessage: 'does not exist' },
    });
    const fail = async () => {
      throw missingDatabase;
    };
    const connection = {
      provider: 'postgres',
      adapterName: 'stub',
      queryRaw: fail,
      executeRaw: fail,
      executeScript: fail,
      startTransaction: fail,
      getConnectionInfo: () => ({ supportsRelationJoins: false }),
      dispose: async () => undefined,
    };
    const adapter = { provider: 'postgres', adapterName: 'stub', connect: async () => connection };
    return new PrismaClient({ adapter } as never);
  }

  it('reports a driver error with its Prisma code, not a broken error class', async () => {
    const prisma = clientWhoseDatabaseIsMissing();

    const error = await prisma.tenant.findFirst().then(
      () => null,
      (err: unknown) => err as { code?: string; message: string },
    );

    expect(error?.message).not.toContain('Must call super constructor');
    expect(error?.code).toBe('P1003');
    expect(error?.message).toContain('does not exist');
  });
});
