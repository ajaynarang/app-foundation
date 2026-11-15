import { rlsStorage } from '../rls-context';
import { RlsContextMiddleware } from '../rls-context.middleware';

describe('RlsContextMiddleware', () => {
  it('opens an empty RLS holder around the rest of the request', () => {
    const middleware = new RlsContextMiddleware();
    let storeInNext: unknown;

    middleware.use({} as never, {} as never, () => {
      storeInNext = rlsStorage.getStore();
    });

    expect(storeInNext).toEqual({});
    expect(rlsStorage.getStore()).toBeUndefined();
  });

  it('gives each request its own holder', () => {
    const middleware = new RlsContextMiddleware();
    const holders: unknown[] = [];

    middleware.use({} as never, {} as never, () => holders.push(rlsStorage.getStore()));
    middleware.use({} as never, {} as never, () => holders.push(rlsStorage.getStore()));

    expect(holders[0]).not.toBe(holders[1]);
  });
});
